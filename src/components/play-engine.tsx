"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { listGamesAction, saveGameAction } from "@/app/actions";
import { getBrowserEngine, disposeBrowserEngine } from "@/lib/engine/browser-engine";
import { gameResultFromChess } from "@/lib/play/game-result";
import { buildGamePgn } from "@/lib/play/game-pgn";
import type { GamePage, SavedGame } from "@/lib/trainer-service";

/** Độ sâu phân tích khi engine đi nước của mình — snappy hơn eval panel. */
const ENGINE_MOVE_DEPTH = 10;
const ARCHIVE_LIMIT = 20;
const ENGINE_FIRST_MOVE_DELAY_MS = 600;
const ENGINE_REPLY_DELAY_MS = 350;

export const PLAY_ARCHIVE_LIMIT = ARCHIVE_LIMIT;

type UserColor = "w" | "b";

type EndBanner = { kind: "win" | "loss" | "draw"; text: string };

type Feedback = { kind: "error" | "info"; text: string };

type PlayState = {
  chess: Chess;
  userColor: UserColor;
  engineStrength: number;
};

export function PlayEngine({ initialArchive }: { initialArchive: GamePage }) {
  const [phase, setPhase] = useState<"setup" | "playing">("setup");
  const [archive, setArchive] = useState<GamePage>(initialArchive);
  const [isPending, startTransition] = useTransition();

  const [color, setColor] = useState<UserColor>("w");
  const [strength, setStrength] = useState(4);

  const [fen, setFen] = useState("");
  const [thinking, setThinking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [endBanner, setEndBanner] = useState<EndBanner | null>(null);

  const gameRef = useRef<PlayState | null>(null);
  const gameIdRef = useRef(0);
  const thinkingRef = useRef(false);
  const finishedRef = useRef(false);
  const engineTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (engineTimerRef.current !== null) {
      window.clearTimeout(engineTimerRef.current);
      engineTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimers();
      void disposeBrowserEngine();
    };
  }, []);

  const startGame = async () => {
    setFeedback(null);
    setEndBanner(null);
    try {
      const engine = getBrowserEngine();
      await engine.setStrength(strength);
    } catch (cause) {
      setFeedback({
        kind: "error",
        text: `Không khởi động được engine: ${(cause as Error).message}`,
      });
      return;
    }
    gameIdRef.current += 1;
    finishedRef.current = false;
    thinkingRef.current = false;
    gameRef.current = { chess: new Chess(), userColor: color, engineStrength: strength };
    setFen(gameRef.current.chess.fen());
    setPhase("playing");
    if (color === "b") {
      // Engine cầm Trắng đi trước sau một nhịp ngắn.
      thinkingRef.current = true;
      setThinking(true);
      const gid = gameIdRef.current;
      engineTimerRef.current = window.setTimeout(() => {
        void engineMove(gid);
      }, ENGINE_FIRST_MOVE_DELAY_MS);
    }
  };

  const engineMove = async (gameId: number) => {
    const state = gameRef.current;
    // Ván đã reset trong lúc chờ — bỏ qua, trạng thái thinking do ván mới quản.
    if (!state || gameIdRef.current !== gameId) return;
    try {
      const analysis = await getBrowserEngine().analyse(
        state.chess.fen(),
        ENGINE_MOVE_DEPTH,
      );
      if (gameIdRef.current !== gameId) return;
      const uci = analysis.bestLineUci[0];
      if (!uci) {
        thinkingRef.current = false;
        setThinking(false);
        setFeedback({
          kind: "error",
          text: "Engine không trả lời được nước đi — thử lại hoặc bắt ván mới.",
        });
        return;
      }
      state.chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      setFen(state.chess.fen());
    } catch (cause) {
      if (gameIdRef.current === gameId) {
        setFeedback({
          kind: "error",
          text: `Lỗi engine: ${(cause as Error).message}`,
        });
      }
    } finally {
      if (gameIdRef.current === gameId) {
        thinkingRef.current = false;
        setThinking(false);
      }
    }
    concludeIfOver();
  };

  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean => {
    const state = gameRef.current;
    if (!targetSquare || !state) return false;
    if (thinkingRef.current || finishedRef.current) return false;
    if (state.chess.turn() !== state.userColor) return false;
    try {
      // Tự phong hậu (auto-queen) khi kéo tốt tới hàng cuối.
      state.chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
    } catch {
      setFeedback({
        kind: "error",
        text: `Nước đi không hợp lệ: ${sourceSquare} → ${targetSquare}. Hãy đi lại.`,
      });
      return false;
    }
    setFen(state.chess.fen());
    setFeedback(null);
    if (!concludeIfOver()) {
      thinkingRef.current = true;
      setThinking(true);
      const gid = gameIdRef.current;
      engineTimerRef.current = window.setTimeout(() => {
        void engineMove(gid);
      }, ENGINE_REPLY_DELAY_MS);
    }
    return true;
  };

  /** Hết ván tự nhiên (chiếu hết / hòa): lưu 1 lần rồi hiện banner. */
  const concludeIfOver = (): boolean => {
    const state = gameRef.current;
    if (!state || finishedRef.current || !state.chess.isGameOver()) return false;
    const { chess, userColor } = state;
    const result = gameResultFromChess(chess, userColor);
    let banner: EndBanner;
    if (chess.isCheckmate()) {
      banner =
        chess.turn() !== userColor
          ? { kind: "win", text: "Chiếu hết! Bạn thắng" }
          : { kind: "loss", text: "Bạn thua" };
    } else {
      banner = { kind: "draw", text: "Hòa" };
    }
    finishGame(result, banner);
    return true;
  };

  const handleResign = () => {
    const state = gameRef.current;
    if (!state || finishedRef.current) return;
    const result = gameResultFromChess(state.chess, state.userColor, {
      resigned: true,
    });
    finishGame(result, { kind: "loss", text: "Bạn đã đầu hàng — thua" });
  };

  const handleNewGame = () => {
    gameIdRef.current += 1;
    clearTimers();
    gameRef.current = null;
    thinkingRef.current = false;
    finishedRef.current = false;
    setThinking(false);
    setFeedback(null);
    setEndBanner(null);
    setPhase("setup");
  };

  /** Lưu ván đúng một lần với PGN đầy đủ, rồi làm mới archive. */
  const finishGame = (result: ReturnType<typeof gameResultFromChess>, banner: EndBanner) => {
    const state = gameRef.current;
    if (!state || finishedRef.current) return;
    finishedRef.current = true;
    const { chess, userColor, engineStrength } = state;
    const pgn = buildGamePgn(chess, { userColor, engineStrength, result });
    setEndBanner(banner);
    setFeedback(null);
    startTransition(async () => {
      await saveGameAction({
        pgn,
        result,
        userColor,
        engineStrength,
        finalFen: chess.fen(),
      });
      setArchive(await listGamesAction({ limit: ARCHIVE_LIMIT }));
    });
  };

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <div className="flex flex-col gap-4">
        {phase === "setup" && (
          <form
            className="rounded-lg border border-stone-300 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void startGame();
            }}
          >
            <h2 className="font-semibold">Bắt ván mới</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-stone-600" htmlFor="play-color">
                Màu của bạn
                <select
                  id="play-color"
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-hidden"
                  value={color}
                  onChange={(event) => setColor(event.target.value as UserColor)}
                >
                  <option value="w">Trắng (đi trước)</option>
                  <option value="b">Đen (engine đi trước)</option>
                </select>
              </label>
              <label className="block text-sm text-stone-600" htmlFor="play-strength">
                Độ mạnh engine
                <select
                  id="play-strength"
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-hidden"
                  value={strength}
                  onChange={(event) => setStrength(Number(event.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((level) => (
                    <option key={level} value={level}>
                      Cấp {level}
                      {level === 1 ? " (yếu nhất)" : level === 8 ? " (mạnh nhất)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Bắt đầu ván
            </button>
            {feedback && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {feedback.text}
              </p>
            )}
          </form>
        )}

        {phase === "playing" && gameRef.current && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                Ván với Stockfish{" "}
                <span className="text-sm font-normal text-stone-400">
                  · bạn cầm {gameRef.current.userColor === "w" ? "Trắng" : "Đen"} ·
                  cấp {gameRef.current.engineStrength}
                </span>
              </h2>
              {thinking && (
                <span role="status" className="text-sm text-stone-500">
                  Engine đang suy nghĩ…
                </span>
              )}
            </div>
            <div className="w-full max-w-[480px]">
              <Chessboard
                options={{
                  id: "play-vs-engine",
                  position: fen,
                  boardOrientation:
                    gameRef.current.userColor === "w" ? "white" : "black",
                  onPieceDrop: handlePieceDrop,
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleResign}
                disabled={finishedRef.current || isPending}
                className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Đầu hàng
              </button>
              <button
                type="button"
                onClick={handleNewGame}
                className="rounded-md bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
              >
                Ván mới
              </button>
            </div>
            {endBanner && (
              <p
                role="status"
                className={
                  endBanner.kind === "win"
                    ? "rounded-md bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800"
                    : endBanner.kind === "loss"
                      ? "rounded-md bg-red-100 px-3 py-2 text-sm font-semibold text-red-800"
                      : "rounded-md bg-stone-200 px-3 py-2 text-sm font-semibold text-stone-700"
                }
              >
                {endBanner.text}
              </p>
            )}
            {feedback && (
              <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800">
                {feedback.text}
              </p>
            )}
          </>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">
            Archive ván đã chơi{" "}
            <span className="text-sm font-normal text-stone-400">
              ({archive.total})
            </span>
          </h2>
          {archive.items.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">
              Chưa có ván nào — hãy chơi ván đầu tiên, ván kết thúc sẽ tự lưu.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-100">
              {archive.items.map((game: SavedGame) => (
                <li key={game.id} className="flex flex-wrap items-baseline gap-x-2 py-2 text-sm">
                  <span className="font-mono text-xs text-stone-400">
                    {formatPlayedAt(game.playedAt)}
                  </span>
                  <span className="text-stone-700">
                    Bạn cầm {game.userColor === "w" ? "Trắng" : "Đen"}
                  </span>
                  <span className="text-stone-500">· cấp {game.engineStrength}</span>
                  <span
                    className={
                      game.result === (game.userColor === "w" ? "1-0" : "0-1")
                        ? "font-medium text-emerald-700"
                        : game.result === "*"
                          ? "font-medium text-stone-400"
                          : "font-medium text-red-700"
                    }
                  >
                    {game.result}
                  </span>
                  <Link
                    href={`/xem-lai-van/${game.id}`}
                    className="rounded-md border border-stone-300 px-2 py-0.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                  >
                    Xem lại
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
          <h2 className="font-semibold text-stone-800">Cách chơi</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Kéo quân trên bàn; nước không hợp lệ bị trả lại chỗ cũ.</li>
            <li>Engine chạy Stockfish WASM ngay trong trình duyệt — không cần mạng.</li>
            <li>Ván chiếu hết / hòa / đầu hàng đều tự lưu vào archive.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function formatPlayedAt(playedAt: string): string {
  return playedAt.slice(0, 16).replace("T", " ");
}
