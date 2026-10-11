"use client";

import { useState } from "react";
import { Chessboard } from "react-chessboard";
import { saveGameAnalysisAction } from "@/app/actions";
import { disposeBrowserEngine, getBrowserEngine } from "@/lib/engine/browser-engine";
import { flagMistakes, formatEval, type MoveFlag } from "@/lib/review/flag-mistakes";
import type { ReplayStep } from "@/lib/review/replay-game";
import type {
  GameAnalysis,
  PositionEval,
  SavedGame,
} from "@/lib/trainer-service";

/** Độ sâu phân tích cho Game Review (theo ticket TT-09). */
const REVIEW_ANALYSIS_DEPTH = 10;

/** Cờ hiệu màu cho nước lỗi trong move list. */
const FLAG_CLASS: Record<MoveFlag["severity"], string> = {
  mistake: "bg-amber-100 text-amber-900 hover:bg-amber-200",
  blunder: "bg-red-100 text-red-800 hover:bg-red-200",
};

const FLAG_LABEL: Record<MoveFlag["severity"], string> = {
  mistake: "Lỗi (mistake)",
  blunder: "Lỗi nghiêm trọng (blunder)",
};

export function GameReview({
  game,
  steps,
  initialAnalysis,
}: {
  game: SavedGame;
  steps: ReplayStep[];
  initialAnalysis: GameAnalysis | null;
}) {
  const [ply, setPly] = useState(0);
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(initialAnalysis);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = steps.length;
  const position = ply < total ? steps[ply].fenBefore : game.finalFen;
  const currentEval =
    analysis && ply < analysis.evals.length ? formatEval(analysis.evals[ply]) : "—";
  const currentFlag = analysis?.flags.find((flag) => flag.ply === ply) ?? null;

  /** Chạy engine TỪ ĐẦU cho từng thế (US-26) rồi cache kết quả (US-28). */
  const runAnalysis = async () => {
    if (total === 0) return;
    setError(null);
    setProgress({ done: 0, total });
    try {
      const engine = getBrowserEngine();
      const evals: PositionEval[] = [];
      for (let index = 0; index < steps.length; index += 1) {
        const result = await engine.analyse(
          steps[index].fenBefore,
          REVIEW_ANALYSIS_DEPTH,
        );
        evals.push({
          fen: steps[index].fenBefore,
          evalCp: result.evalCp,
          mate: result.mate,
        });
        setProgress({ done: index + 1, total });
      }
      await disposeBrowserEngine();
      const flags = flagMistakes(evals, game.userColor);
      const saved = await saveGameAnalysisAction({
        gameId: game.id,
        evals,
        flags,
        depth: REVIEW_ANALYSIS_DEPTH,
      });
      setAnalysis(saved);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không phân tích được ván này.",
      );
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <div className="flex flex-col gap-4">
        <div className="w-full max-w-[480px]">
          <Chessboard
            options={{
              id: "game-review",
              position,
              boardOrientation: game.userColor === "w" ? "white" : "black",
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Về đầu ván"
            onClick={() => setPly(0)}
            disabled={ply === 0}
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40"
          >
            ⏮ Đầu
          </button>
          <button
            type="button"
            aria-label="Nước trước"
            onClick={() => setPly((p) => Math.max(0, p - 1))}
            disabled={ply === 0}
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40"
          >
            ◀ Trước
          </button>
          <button
            type="button"
            aria-label="Nước sau"
            onClick={() => setPly((p) => Math.min(total, p + 1))}
            disabled={ply >= total}
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40"
          >
            Sau ▶
          </button>
          <button
            type="button"
            aria-label="Tới cuối ván"
            onClick={() => setPly(total)}
            disabled={ply >= total}
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40"
          >
            Cuối ⏭
          </button>
          <span className="ml-auto text-sm text-stone-500">
            Nước {ply}/{total}
          </span>
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">Thông tin ván</h2>
          <dl className="mt-2 space-y-1 text-sm text-stone-600">
            <div className="flex justify-between gap-2">
              <dt>Bạn cầm</dt>
              <dd className="font-medium text-stone-800">
                {game.userColor === "w" ? "Trắng" : "Đen"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Kết quả</dt>
              <dd className="font-mono font-medium text-stone-800">{game.result}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Đã chơi</dt>
              <dd>{formatPlayedAt(game.playedAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">
            Đánh giá thế hiện tại{" "}
            <span className="text-sm font-normal text-stone-400">
              (+ Trắng hơn, − Đen hơn)
            </span>
          </h2>
          {analysis ? (
            <>
              <p className="mt-2 font-mono text-2xl font-semibold text-stone-900">
                {currentEval}
              </p>
              {currentFlag && (
                <p
                  className={
                    currentFlag.severity === "blunder"
                      ? "mt-2 rounded-md bg-red-100 px-3 py-2 text-sm font-semibold text-red-800"
                      : "mt-2 rounded-md bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900"
                  }
                >
                  Nước tiếp theo ({steps[ply]?.san}) là{" "}
                  {FLAG_LABEL[currentFlag.severity].toLowerCase()}:{" "}
                  {currentFlag.evalBefore} → {currentFlag.evalAfter} cp
                </p>
              )}
              <p className="mt-2 text-xs text-stone-400">
                Đã phân tích (depth {analysis.depth}) · {analysis.evals.length} thế ·
                mở lại là xem ngay, không chạy engine
              </p>
            </>
          ) : total === 0 ? (
            <p className="mt-2 text-sm text-stone-500">
              Ván chưa có nước đi nào để phân tích.
            </p>
          ) : progress ? (
            <div className="mt-3">
              <p role="status" className="text-sm font-medium text-stone-700">
                Đang phân tích… {progress.done}/{progress.total}
              </p>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-200"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
              >
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{
                    width: `${Math.round((progress.done / progress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-stone-500">
                Chưa phân tích — chạy Stockfish cho từng thế ({total} thế, depth{" "}
                {REVIEW_ANALYSIS_DEPTH}) rồi cache lại.
              </p>
              <button
                type="button"
                onClick={() => void runAnalysis()}
                className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              >
                Phân tích ván này
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="mt-3 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">
            Biên bản <span className="text-sm font-normal text-stone-400">(bấm để nhảy)</span>
          </h2>
          {total === 0 ? (
            <p className="mt-2 text-sm text-stone-500">Ván chưa có nước nào.</p>
          ) : (
            <ol className="mt-3 flex flex-wrap gap-1.5">
              {steps.map((step) => {
                const flag = analysis?.flags.find((f) => f.ply === step.ply);
                const isCurrent = step.ply === ply;
                return (
                  <li key={step.ply}>
                    <button
                      type="button"
                      onClick={() => setPly(step.ply)}
                      className={[
                        "rounded-md px-2 py-1 font-mono text-sm",
                        flag
                          ? `${FLAG_CLASS[flag.severity]} font-semibold`
                          : "bg-stone-100 text-stone-700 hover:bg-stone-200",
                        isCurrent ? "ring-2 ring-stone-700" : "",
                      ].join(" ")}
                      title={
                        step.ply % 2 === 0
                          ? `${step.ply / 2 + 1}. ${step.san}`
                          : `${step.ply / 2 + 0.5}… ${step.san}`
                      }
                    >
                      {step.san}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {analysis && analysis.flags.length > 0 && (
            <p className="mt-3 text-xs text-stone-500">
              <span className="mr-3">
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-200 align-middle" />
                lỗi ≥ 1.0
              </span>
              <span>
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-red-200 align-middle" />
                blunder ≥ 3.0
              </span>
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function formatPlayedAt(playedAt: string): string {
  return playedAt.slice(0, 16).replace("T", " ");
}
