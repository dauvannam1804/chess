import { describe, expect, it } from "vitest";
import { StockfishEngine } from "@/lib/engine/stockfish-engine";
import type { UciTransport } from "@/lib/engine/transport";

/** Transport giả theo kịch bản: phát các dòng UCI ghi lại sẵn. */
class ScriptedTransport implements UciTransport {
  sent: string[] = [];
  private handler: ((line: string) => void) | null = null;

  constructor(private readonly script: Record<string, string[]>) {}

  send(command: string): void {
    this.sent.push(command);
    const responses = this.script[command.split(" ")[0]];
    if (!responses) return;
    queueMicrotask(() => {
      for (const line of responses) this.handler?.(line);
    });
  }

  onLine(handler: (line: string) => void): () => void {
    this.handler = handler;
    return () => {
      this.handler = null;
    };
  }

  async dispose(): Promise<void> {}
}

const HANDSHAKE = {
  uci: ["uciok"],
  isready: ["readyok"],
};

describe("StockfishEngine over a scripted UCI transport", () => {
  it("resolves the last info line's score + pv, converted to White POV", async () => {
    const engine = new StockfishEngine(
      new ScriptedTransport({
        ...HANDSHAKE,
        go: [
          "info depth 9 score cp -34 pv e7e5",
          "info depth 10 score cp 31 pv e7e5 g1f3",
          "bestmove e7e5 ponder g1f3",
        ],
      }),
    );
    // FEN có Đen đi: cp 31 (góc nhìn Đen) phải thành -31 theo góc nhìn Trắng.
    const analysis = await engine.analyse(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      10,
    );
    expect(analysis).toEqual({
      evalCp: -31,
      mate: null,
      bestLineSan: ["e5", "Nf3"],
      bestLineUci: ["e7e5", "g1f3"],
    });
    await engine.dispose();
  });

  it("sends Skill Level mapped from app strength 1..8", async () => {
    const transport = new ScriptedTransport({ ...HANDSHAKE });
    const engine = new StockfishEngine(transport);
    await engine.setStrength(1);
    await engine.setStrength(8);
    expect(transport.sent).toContain("setoption name Skill Level value 0");
    expect(transport.sent).toContain("setoption name Skill Level value 20");
    await engine.dispose();
  });

  it("resolves an empty analysis instead of hanging when the position is over", async () => {
    const engine = new StockfishEngine(
      new ScriptedTransport({
        ...HANDSHAKE,
        go: ["bestmove (none)"],
      }),
    );
    const analysis = await engine.analyse(
      "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
      10,
    );
    expect(analysis).toEqual({
      evalCp: null,
      mate: null,
      bestLineSan: [],
      bestLineUci: [],
    });
    await engine.dispose();
  });

  it("rejects a pending analyse when disposed", async () => {
    const engine = new StockfishEngine(
      new ScriptedTransport({ ...HANDSHAKE }),
    );
    const pending = engine.analyse(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      10,
    );
    await engine.dispose();
    await expect(pending).rejects.toThrow("đã được đóng");
  });
});
