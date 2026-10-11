"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Chessboard } from "react-chessboard";
import {
  getRandomBatchAction,
  getThemeStatsAction,
  recordAttemptAction,
} from "@/app/actions";
import {
  applyPlayerMove,
  isSolved,
  loadPuzzle,
  playNextSolutionMove,
  playerSideOf,
  remainingSolution,
  type PuzzleSolveState,
} from "@/lib/puzzle-solve";
import type {
  StoredPuzzle,
  ThemeCount,
  ThemeStat,
} from "@/lib/trainer-service";

const LICHESS_ATTRIBUTION = (
  <p className="text-xs text-stone-400">
    Nguồn puzzle:{" "}
    <a
      href="https://database.lichess.org/#puzzles"
      target="_blank"
      rel="noreferrer"
      className="underline hover:text-stone-600"
    >
      Lichess puzzle database (CC0)
    </a>
  </p>
);

type Phase = "setup" | "solving" | "summary";

type Feedback = { kind: "error" | "success" | "info"; text: string };

type SessionResult = {
  puzzleId: string;
  rating: number;
  theme: string | null;
  solved: boolean;
  mistakes: number;
  revealed: boolean;
};

export function PuzzleTrainer({
  initialThemes,
  initialStats,
}: {
  initialThemes: ThemeCount[];
  initialStats: ThemeStat[];
}) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [stats, setStats] = useState<ThemeStat[]>(initialStats);
  const [isPending, startTransition] = useTransition();

  // Bộ lọc phiên
  const [theme, setTheme] = useState("");
  const [ratingMin, setRatingMin] = useState("");
  const [ratingMax, setRatingMax] = useState("");
  const [size, setSize] = useState("10");
  const [startError, setStartError] = useState<string | null>(null);

  // Phiên đang giải
  const [session, setSession] = useState<{ puzzles: StoredPuzzle[] } | null>(
    null,
  );
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [fen, setFen] = useState("");
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const solverRef = useRef<PuzzleSolveState | null>(null);
  const recordedRef = useRef(false);
  const advancingRef = useRef(false);
  const [mistakes, setMistakes] = useState(0);
  const [locked, setLocked] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [results, setResults] = useState<SessionResult[]>([]);

  const replyTimerRef = useRef<number | null>(null);
  const advanceTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    for (const timerRef of [replyTimerRef, advanceTimerRef, revealTimerRef]) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  useEffect(() => clearTimers, []);

  const current = session?.puzzles[index] ?? null;

  const loadPuzzleIntoState = (puzzle: StoredPuzzle) => {
    clearTimers();
    advancingRef.current = false;
    const state = loadPuzzle(puzzle.fen, puzzle.moves.split(" "));
    solverRef.current = state;
    recordedRef.current = false;
    setFen(state.fen);
    setOrientation(playerSideOf(state.fen) === "w" ? "white" : "black");
    setMistakes(0);
    setHint(null);
    setRevealed(false);
    setLocked(false);
    setFeedback(null);
  };

  const refreshStats = () => {
    startTransition(async () => {
      setStats(await getThemeStatsAction());
    });
  };

  const concludePuzzle = (solved: boolean, viaReveal = false) => {
    if (!current || recordedRef.current) return;
    recordedRef.current = true;
    const result: SessionResult = {
      puzzleId: current.puzzleId,
      rating: current.rating,
      theme: current.themes[0] ?? null,
      solved,
      mistakes,
      revealed: viaReveal,
    };
    setResults((prev) => [...prev, result]);
    startTransition(async () => {
      await recordAttemptAction(current.puzzleId, solved);
      setStats(await getThemeStatsAction());
    });
    if (!viaReveal) {
      const scheduledFor = indexRef.current;
      advanceTimerRef.current = window.setTimeout(() => {
        // Timer cũ chỉ có hiệu lực nếu người dùng chưa tự bấm chuyển puzzle
        if (indexRef.current === scheduledFor) advance();
      }, 1600);
    }
  };

  const advance = () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    clearTimers();
    if (!session) return;
    const next = indexRef.current + 1;
    if (next < session.puzzles.length) {
      indexRef.current = next;
      setIndex(next);
      loadPuzzleIntoState(session.puzzles[next]);
    } else {
      setPhase("summary");
    }
  };

  const startSession = () => {
    setStartError(null);
    const min = ratingMin.trim() === "" ? undefined : Number(ratingMin);
    const max = ratingMax.trim() === "" ? undefined : Number(ratingMax);
    const n = Number(size);
    if (min !== undefined && Number.isNaN(min)) {
      setStartError("Rating tối thiểu phải là số.");
      return;
    }
    if (max !== undefined && Number.isNaN(max)) {
      setStartError("Rating tối đa phải là số.");
      return;
    }
    if (min !== undefined && max !== undefined && min > max) {
      setStartError("Rating tối thiểu không được lớn hơn rating tối đa.");
      return;
    }
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      setStartError("Số puzzle mỗi phiên phải là số nguyên từ 1 đến 50.");
      return;
    }
    startTransition(async () => {
      const batch = await getRandomBatchAction(
        { theme: theme || undefined, ratingMin: min, ratingMax: max },
        n,
      );
      if (batch.length === 0) {
        setStartError(
          "Không có puzzle nào khớp bộ lọc — hãy nới lỏng Theme hoặc khoảng rating.",
        );
        return;
      }
      const puzzles = batch;
      setSession({ puzzles });
      setResults([]);
      indexRef.current = 0;
      setIndex(0);
      setPhase("solving");
      loadPuzzleIntoState(puzzles[0]);
    });
  };

  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean => {
    if (!targetSquare || locked || solverRef.current === null) return false;
    const outcome = applyPlayerMove(solverRef.current, {
      from: sourceSquare,
      to: targetSquare,
    });
    if (outcome.kind === "illegal") {
      setFeedback({ kind: "error", text: outcome.message });
      return false;
    }
    if (outcome.kind === "wrong") {
      setMistakes((count) => count + 1);
      setFeedback({ kind: "error", text: outcome.message });
      return false;
    }
    // Nước đúng
    solverRef.current = outcome.state;
    setFen(outcome.state.fen);
    setFeedback({ kind: "success", text: `Chuẩn! ${outcome.san}` });
    if (isSolved(outcome.state)) {
      setLocked(true);
      concludePuzzle(true);
      return true;
    }
    // Nước giải kế tiếp là phản đòn của đối phương → tự đi sau một nhịp
    setLocked(true);
    replyTimerRef.current = window.setTimeout(() => {
      if (solverRef.current === null) return;
      const reply = playNextSolutionMove(solverRef.current);
      solverRef.current = reply.state;
      setFen(reply.state.fen);
      setFeedback({
        kind: "info",
        text: `Đối phương phản đòn: ${reply.san} — tới lượt bạn.`,
      });
      setLocked(false);
      if (isSolved(reply.state)) {
        setLocked(true);
        concludePuzzle(true);
      }
    }, 700);
    return true;
  };

  const handleHint = () => {
    if (!current) return;
    const primaryTheme = current.themes[0];
    setHint(primaryTheme ?? "Puzzle này không có motip nào trong database");
    setFeedback(null);
  };

  const handleReveal = () => {
    if (!current || solverRef.current === null) return;
    concludePuzzle(false, true);
    setRevealed(true);
    setLocked(true);
    const steps = remainingSolution(solverRef.current);
    if (steps.length === 0) return;
    const playStep = (remaining: number) => {
      if (solverRef.current === null) return;
      const step = playNextSolutionMove(solverRef.current);
      solverRef.current = step.state;
      setFen(step.state.fen);
      setFeedback({
        kind: "info",
        text: `Lời giải: ${step.san}${
          remaining > 1 ? " — xem tiếp bên dưới bàn cờ" : ""
        }`,
      });
      if (remaining > 1) {
        revealTimerRef.current = window.setTimeout(() => playStep(remaining - 1), 800);
      }
    };
    revealTimerRef.current = window.setTimeout(() => playStep(steps.length), 500);
  };

  const statsByTheme = new Map(stats.map((stat) => [stat.theme, stat]));

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <div className="flex flex-col gap-4">
        {phase === "setup" && (
          <form
            className="rounded-lg border border-stone-300 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              startSession();
            }}
          >
            <h2 className="font-semibold">Tạo phiên giải Puzzle</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-stone-600" htmlFor="theme">
                Chủ đề (Theme)
                <select
                  id="theme"
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-hidden"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                >
                  <option value="">Tất cả chủ đề</option>
                  {initialThemes.map((entry) => (
                    <option key={entry.theme} value={entry.theme}>
                      {entry.theme} ({entry.count} puzzle)
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-stone-600" htmlFor="size">
                Số puzzle mỗi phiên
                <input
                  id="size"
                  type="number"
                  min={1}
                  max={50}
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-hidden"
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                />
              </label>
              <label className="block text-sm text-stone-600" htmlFor="rating-min">
                Rating tối thiểu
                <input
                  id="rating-min"
                  type="number"
                  placeholder="vd: 1000"
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-hidden"
                  value={ratingMin}
                  onChange={(event) => setRatingMin(event.target.value)}
                />
              </label>
              <label className="block text-sm text-stone-600" htmlFor="rating-max">
                Rating tối đa
                <input
                  id="rating-max"
                  type="number"
                  placeholder="vd: 2000"
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-hidden"
                  value={ratingMax}
                  onChange={(event) => setRatingMax(event.target.value)}
                />
              </label>
            </div>
            <button
              type="submit"
              className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              disabled={isPending}
            >
              Bắt đầu phiên (Start)
            </button>
            {startError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {startError}
              </p>
            )}
          </form>
        )}

        {phase === "solving" && current && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                Puzzle {index + 1}/{session?.puzzles.length}{" "}
                <span className="text-sm font-normal text-stone-400">
                  · rating {current.rating} · #{current.puzzleId}
                </span>
              </h2>
              {mistakes > 0 && (
                <span className="text-sm text-amber-700">
                  Đã sai {mistakes} lần
                </span>
              )}
            </div>
            <div className="w-full max-w-[480px]">
              <Chessboard
                options={{
                  id: "puzzle-solve",
                  position: fen,
                  boardOrientation: orientation,
                  onPieceDrop: handlePieceDrop,
                }}
              />
            </div>
            {LICHESS_ATTRIBUTION}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleHint}
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
              >
                Gợi ý (hint)
              </button>
              <button
                type="button"
                onClick={handleReveal}
                disabled={revealed || locked}
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
              >
                Xem lời giải
              </button>
              <button
                type="button"
                onClick={advance}
                disabled={isPending}
                className="rounded-md bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
              >
                {index + 1 < (session?.puzzles.length ?? 0)
                  ? "Puzzle tiếp theo"
                  : "Xem tổng kết"}
              </button>
            </div>
            {hint && (
              <p
                role="status"
                className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800"
              >
                Motip gợi ý: <span className="font-semibold">{hint}</span>
              </p>
            )}
            {feedback && (
              <p
                role={feedback.kind === "error" ? "alert" : "status"}
                className={
                  feedback.kind === "error"
                    ? "rounded-md bg-red-100 px-3 py-2 text-sm text-red-800"
                    : feedback.kind === "success"
                      ? "rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-800"
                      : "rounded-md bg-stone-200 px-3 py-2 text-sm text-stone-700"
                }
              >
                {feedback.text}
              </p>
            )}
          </>
        )}

        {phase === "summary" && session && (
          <div className="rounded-lg border border-stone-300 bg-white p-4">
            <h2 className="font-semibold">
              Tổng kết phiên: giải đúng{" "}
              {results.filter((result) => result.solved).length}/
              {results.length}
            </h2>
            <ul className="mt-3 divide-y divide-stone-200">
              {results.map((result, resultIndex) => (
                <li
                  key={result.puzzleId}
                  className="flex flex-wrap items-baseline gap-x-2 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-stone-400">
                    #{resultIndex + 1}
                  </span>
                  <span
                    className={
                      result.solved
                        ? "font-medium text-emerald-700"
                        : "font-medium text-red-700"
                    }
                  >
                    {result.solved ? "Đã giải" : "Chưa giải"}
                  </span>
                  <span className="text-stone-500">
                    #{result.puzzleId} · rating {result.rating}
                    {result.theme ? ` · motip: ${result.theme}` : ""}
                    {result.mistakes > 0 ? ` · sai ${result.mistakes} lần` : ""}
                    {result.revealed ? " · đã xem lời giải" : ""}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setPhase("setup")}
              className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Tạo phiên mới
            </button>
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">
            Thống kê theo Theme{" "}
            <span className="text-stone-400">(solved/attempt)</span>
          </h2>
          {initialThemes.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">
              Chưa có puzzle nào trong database — hãy import dump Lichess trước
              (xem ticket TT-02).
            </p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-400">
                  <th className="py-1 pr-2 font-medium">Theme</th>
                  <th className="py-1 pr-2 font-medium">Solved</th>
                  <th className="py-1 font-medium">Attempted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {initialThemes.map((entry) => {
                  const stat = statsByTheme.get(entry.theme);
                  return (
                    <tr key={entry.theme}>
                      <td className="py-1.5 pr-2 font-mono text-xs">
                        {entry.theme}
                      </td>
                      <td className="py-1.5 pr-2">
                        {stat?.solved ?? 0}
                        <span className="text-stone-300"> / </span>
                        <span className="text-stone-500">
                          {stat?.attempted ?? 0}
                        </span>
                      </td>
                      <td className="py-1.5 text-stone-400">
                        {entry.count} puzzle
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
          <h2 className="font-semibold text-stone-800">Cách giải</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Kéo quân đi đúng chuỗi nước thắng — sai là phản hồi ngay.</li>
            <li>
              Nước đầu trong dữ liệu là nước setup của đối phương: bạn thấy thế
              cờ SAU nước đó và đi phần còn lại.
            </li>
            <li>“Gợi ý” chỉ hiện motip, không lộ lời giải.</li>
            <li>“Xem lời giải” tự chạy toàn bộ chuỗi và tính là chưa giải.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
