"use client";

import { Chess } from "chess.js";
import {
  MAX_ENGINE_STRENGTH,
  MIN_ENGINE_STRENGTH,
} from "@/lib/engine/strength";
import {
  ENGINE_ANALYSIS_DEPTH,
  useEngineAnalysis,
} from "@/lib/engine/use-engine-analysis";

const pawnFormatter = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Điểm centipawn (góc nhìn Trắng) → chuỗi "+0,31" kiểu người Việt đọc. */
function formatPawns(evalCp: number): string {
  const pawns = Math.abs(evalCp) / 100;
  return `${evalCp >= 0 ? "+" : "−"}${pawnFormatter.format(pawns)}`;
}

function evalSummary(evalCp: number): string {
  if (evalCp === 0) return "0,00 — Cân bằng";
  return `${formatPawns(evalCp)} — ${evalCp > 0 ? "Trắng" : "Đen"} hơn`;
}

/** Đánh số kiểu PGN cho biến án SAN ("1. e4 c5 2. Nf3 …"). */
function numberedSan(fen: string, sans: string[]): string {
  const parts = fen.split(" ");
  let moveNo = Number.parseInt(parts[5] ?? "1", 10);
  let turn = parts[1] === "b" ? "b" : "w";
  const out: string[] = [];
  for (const san of sans) {
    if (turn === "w") {
      out.push(`${moveNo}. ${san}`);
    } else {
      out.push(out.length === 0 ? `${moveNo}... ${san}` : san);
      moveNo += 1;
    }
    turn = turn === "w" ? "b" : "w";
  }
  return out.join(" ");
}

const STRENGTH_LABELS: Record<number, string> = {
  1: "1 — Yếu nhất",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8 — Mạnh nhất",
};

/**
 * Panel "Phân tích thế này": eval + biến án chính cho thế cờ đang chọn,
 * engine Stockfish chạy trong Web Worker (không chặn UI thread).
 * Điểm số hiển thị theo góc nhìn Trắng — đúng hợp đồng của interface Engine.
 */
export function EngineAnalysisPanel({
  fen,
  depth = ENGINE_ANALYSIS_DEPTH,
}: {
  fen: string;
  depth?: number;
}) {
  const { state, strength, setStrength, run } = useEngineAnalysis(fen, {
    depth,
  });
  const isLoading = state.status === "loading";

  return (
    <div className="rounded-lg border border-stone-300 bg-white p-4">
      <h2 className="font-semibold">Phân tích engine</h2>
      <p className="mt-1 text-sm text-stone-500">
        Stockfish (WASM) chạy trong Web Worker — đi quân trên bàn vẫn mượt khi
        đang phân tích.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          onClick={() => void run()}
          disabled={isLoading}
        >
          {state.status === "done" ? "Phân tích lại thế này" : "Phân tích thế này"}
        </button>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          Độ mạnh:
          <select
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
            value={strength}
            onChange={(event) => setStrength(Number(event.target.value))}
          >
            {Array.from(
              { length: MAX_ENGINE_STRENGTH - MIN_ENGINE_STRENGTH + 1 },
              (_, index) => index + MIN_ENGINE_STRENGTH,
            ).map((level) => (
              <option key={level} value={level}>
                {STRENGTH_LABELS[level] ?? String(level)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && (
        <p role="status" className="mt-3 text-sm text-stone-500">
          Đang phân tích thế này ở độ sâu {depth}…
        </p>
      )}

      {state.status === "error" && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800"
        >
          Lỗi phân tích: {state.message}
        </p>
      )}

      {state.status === "done" && (
        <div className="mt-3">
          {state.analysis.mate !== null ? (
            <p className="text-lg font-bold text-emerald-800">
              Mate trong {Math.abs(state.analysis.mate)}{" "}
              <span className="text-sm font-normal">
                (
                {state.analysis.mate > 0 ? "Trắng thắng" : "Đen thắng"}
                )
              </span>
            </p>
          ) : state.analysis.evalCp !== null ? (
            <p className="text-lg font-bold text-stone-800">
              {evalSummary(state.analysis.evalCp)}
            </p>
          ) : (
            <p className="text-lg font-bold text-stone-500">—</p>
          )}
          <p className="mt-2 break-words font-mono text-sm text-stone-700">
            {state.analysis.bestLineSan.length > 0
              ? numberedSan(fen, state.analysis.bestLineSan)
              : "Không có biến án chính (thế có thể đã kết thúc)."}
          </p>
          <p className="mt-2 text-xs text-stone-400">
            Điểm số theo góc nhìn Trắng (dương = Trắng hơn), quy đổi 100 cp =
            1 Tốt. Depth {depth}.
          </p>
        </div>
      )}
    </div>
  );
}
