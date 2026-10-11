"use client";

import { useRef, useState, useTransition } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { listGamesAction, saveGameAction } from "@/app/actions";
import { GameArchiveList } from "@/components/game-archive-list";
import { FeedbackBanner } from "@/components/feedback-banner";
import type { Feedback } from "@/lib/feedback";
import {
  ENGINE_FIRST_MOVE_DELAY_MS,
  ENGINE_REPLY_DELAY_MS,
  useEngineOpponent,
} from "@/lib/engine/use-engine-opponent";
import { getBrowserEngine } from "@/lib/engine/browser-engine";
import { uciToMove } from "@/lib/uci-move";
import { gameResultFromChess } from "@/lib/play/game-result";
import { buildGamePgn } from "@/lib/play/game-pgn";
import type { GamePage } from "@/lib/trainer-service";

/** Độ sâu phân tích khi engine đi nước của mình — snappy hơn eval panel. */
const ENGINE_MOVE_DEPTH = 10;
const ARCHIVE_LIMIT = 20;

export const PLAY_ARCHIVE_LIMIT = ARCHIVE_LIMIT;

type UserColor = "w" | "b";

type EndBanner = { kind: "win" | "loss" | "draw"; text: string };

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
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [endBanner, setEndBanner] = useState<EndBanner | null>(null);

  const gameRef = useRef<PlayState | null>(null);
  const finishedRef = useRef(false);

  const { thinking, thinkingRef, resetSession, scheduleReply } =
    useEngineOpponent({
      depth: ENGINE_MOVE_DEPTH,
      currentFen: () => gameRef.current?.chess.fen() ?? null,
      applyMove: (uci) => {
        const state = gameRef.current;
        if (!state) return;
        state.chess.move(uciToMove(uci));
        setFen(state.chess.fen());
      },
      afterMove: () => concludeIfOver(),
      onNoMove: () => {
        setFeedback({
          kind: "error",
          text: "Engine không trả lời được nước đi — thử lại hoặc bắt ván mới.",
        });
      },
      onError: (message) => {
        setFeedback({ kind: "error", text: `Lỗi engine: ${message}` });
      },
    });

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
    resetSession();
    finishedRef.current = false;
    gameRef.current = { chess: new Chess(), userColor: color, engineStrength: strength };
    setFen(gameRef.current.chess.fen());
    setPhase("playing");
    if (color === "b") {
      // Engine cầm Trắng đi trước sau một nhịp ngắn.
      scheduleReply(ENGINE_FIRST_MOVE_DELAY_MS);
    }
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
      scheduleReply(ENGINE_REPLY_DELAY_MS);
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
    resetSession();
    gameRef.current = null;
    finishedRef.current = false;
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
            <FeedbackBanner feedback={feedback} />
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
            <GameArchiveList games={archive.items} />
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
