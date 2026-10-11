import { Chess } from "chess.js";
import type { Engine, EngineAnalysis } from "./engine";
import { skillLevelForStrength, type EngineStrength } from "./strength";
import type { UciTransport } from "./transport";
import { parseBestMoveLine, parseInfoLine, toWhitePointOfView } from "./uci";

type AnalyseWaiter = {
  fen: string;
  depth: number;
  turn: "w" | "b";
  bestLineUci: string[];
  score: { kind: "cp" | "mate"; value: number } | null;
  resolve: (analysis: EngineAnalysis) => void;
  reject: (cause: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Chuyển PV dạng UCI thành SAN bằng chess.js từ chính FEN của thế đó. */
export function uciLineToSan(fen: string, uciLine: string[]): string[] {
  const chess = new Chess(fen);
  const sans: string[] = [];
  for (const uci of uciLine) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.slice(4, 5) || undefined;
    try {
      sans.push(chess.move({ from, to, promotion }).san);
    } catch {
      break; // PV có thể cắt ở nước không hợp lệ trong thế này — giữ phần hợp lệ.
    }
  }
  return sans;
}

/**
 * `Engine` hiện thực bằng Stockfish qua một transport UCI (worker trình
 * duyệt hoặc tiến trình con Node). Nói UCI: `uci`/`isready` handshake,
 * `setoption name Skill Level`, `position fen`, `go depth`, gom dòng
 * `info … score … pv` cuối trước `bestmove`.
 */
export class StockfishEngine implements Engine {
  private readonly transport: UciTransport;
  private readonly analyseTimeoutMs: number;
  private readonly unsubscribe: () => void;
  private initPromise: Promise<void> | null = null;
  private initReject: ((cause: Error) => void) | null = null;
  private commandChain: Promise<unknown> = Promise.resolve();
  private handshakeResolve: (() => void) | null = null;
  private waiter: AnalyseWaiter | null = null;
  private disposed = false;

  constructor(
    transport: UciTransport,
    options: { analyseTimeoutMs?: number } = {},
  ) {
    this.transport = transport;
    this.analyseTimeoutMs = options.analyseTimeoutMs ?? 30_000;
    this.unsubscribe = transport.onLine((line) => this.handleLine(line));
  }

  private handleLine(line: string) {
    if (line.startsWith("bestmove")) {
      const bestMove = parseBestMoveLine(line);
      if (bestMove === null) {
        // `bestmove (none)` — thế đã kết thúc (hết nước/mắt rồi): trả rỗng.
        this.resolveAnalyse({
          evalCp: null,
          mate: null,
          bestLineSan: [],
          bestLineUci: [],
        });
      } else {
        this.finishAnalyse(bestMove);
      }
      return;
    }
    if (line === "uciok" || line === "readyok") {
      const stage = this.handshakeResolve;
      this.handshakeResolve = null;
      stage?.();
      return;
    }
    const info = parseInfoLine(line);
    if (info && this.waiter) {
      if (info.score) this.waiter.score = info.score;
      if (info.pv.length > 0) this.waiter.bestLineUci = info.pv;
    }
  }

  private resolveAnalyse(analysis: EngineAnalysis) {
    const waiter = this.waiter;
    if (!waiter) return;
    this.waiter = null;
    clearTimeout(waiter.timer);
    waiter.resolve(analysis);
  }

  private finishAnalyse(_bestMove: string) {
    const waiter = this.waiter;
    if (!waiter) return;
    const whitePovScore = waiter.score
      ? toWhitePointOfView(waiter.score, waiter.turn)
      : null;
    this.resolveAnalyse({
      evalCp:
        whitePovScore && whitePovScore.kind === "cp" ? whitePovScore.value : null,
      mate:
        whitePovScore && whitePovScore.kind === "mate" ? whitePovScore.value : null,
      bestLineUci: waiter.bestLineUci,
      bestLineSan: uciLineToSan(waiter.fen, waiter.bestLineUci),
    });
  }

  private failWaiter(cause: Error) {
    const waiter = this.waiter;
    if (!waiter) return;
    this.waiter = null;
    clearTimeout(waiter.timer);
    waiter.reject(cause);
  }

  /** Handshake `uci`→`uciok` + `isready`→`readyok` (chạy đúng một lần). */
  private ready(): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error("Engine đã được đóng."));
    }
    if (!this.initPromise) {
      this.initPromise = new Promise<void>((resolve, reject) => {
        this.initReject = reject;
        const timer = setTimeout(() => {
          this.handshakeResolve = null;
          reject(new Error("Engine không phản hồi sau khi khởi động."));
        }, this.analyseTimeoutMs);
        this.handshakeResolve = () => {
          // uciok → hỏi engine sẵn sàng
          this.handshakeResolve = () => {
            // readyok → handshake xong
            clearTimeout(timer);
            this.handshakeResolve = null;
            resolve();
          };
          this.transport.send("isready");
        };
        this.transport.send("uci");
      });
    }
    return this.initPromise;
  }

  /** Xếp hàng lệnh (UCI không nhận setoption/position/go khi đang search). */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.commandChain.then(task, task);
    this.commandChain = run.catch(() => {});
    return run;
  }

  analyse(fen: string, depth: number): Promise<EngineAnalysis> {
    return this.enqueue(() =>
      this.ready().then(
        () =>
          new Promise<EngineAnalysis>((resolve, reject) => {
            if (this.disposed) {
              reject(new Error("Engine đã được đóng."));
              return;
            }
            const turn = fen.split(" ")[1] === "b" ? "b" : "w";
            const timer = setTimeout(() => {
              this.failWaiter(
                new Error(
                  `Engine quá thời hạn phân tích (depth ${depth}). Thử lại hoặc giảm depth.`,
                ),
              );
            }, this.analyseTimeoutMs);
            this.waiter = {
              fen,
              depth,
              turn,
              bestLineUci: [],
              score: null,
              resolve,
              reject,
              timer,
            };
            this.transport.send(`position fen ${fen}`);
            this.transport.send(`go depth ${depth}`);
          }),
      ),
    );
  }

  setStrength(level: EngineStrength): Promise<void> {
    const skillLevel = skillLevelForStrength(level);
    return this.enqueue(() =>
      this.ready().then(() => {
        this.transport.send(`setoption name Skill Level value ${skillLevel}`);
      }),
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.initReject?.(new Error("Engine đã được đóng."));
    this.initReject = null;
    this.failWaiter(new Error("Engine đã được đóng."));
    this.unsubscribe();
    await this.transport.dispose();
  }
}
