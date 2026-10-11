"use client";

import { Chess } from "chess.js";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Chessboard } from "react-chessboard";
import { listPositionsAction, savePositionAction } from "@/app/actions";
import type { SavedPosition } from "@/lib/trainer-service";

const START_FEN = new Chess().fen();

export function Playground() {
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [fenInput, setFenInput] = useState(gameRef.current.fen());
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedPosition[]>([]);
  const [isPending, startTransition] = useTransition();

  const refreshList = useCallback(() => {
    startTransition(async () => {
      setSaved(await listPositionsAction());
    });
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const showError = (message: string) => {
    setError(message);
    setNotice(null);
  };

  const showNotice = (message: string) => {
    setNotice(message);
    setError(null);
  };

  const loadFen = (raw: string): boolean => {
    const candidate = new Chess();
    try {
      candidate.load(raw.trim());
    } catch {
      showError(
        "FEN không hợp lệ — hãy kiểm tra lại chuỗi FEN (đủ 6 phần, cách nhau bằng dấu cách).",
      );
      return false;
    }
    gameRef.current = candidate;
    setFen(candidate.fen());
    setFenInput(candidate.fen());
    setError(null);
    setNotice(null);
    return true;
  };

  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (!targetSquare) return false;
    const move = gameRef.current.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });
    if (move === null) {
      showError(
        "Nước đi không hợp lệ — bàn cờ từ chối nước này, quân cờ trở về chỗ cũ.",
      );
      return false;
    }
    setFen(gameRef.current.fen());
    setFenInput(gameRef.current.fen());
    setError(null);
    setNotice(null);
    return true;
  };

  const handleSave = () => {
    const currentFen = gameRef.current.fen();
    startTransition(async () => {
      try {
        const savedPosition = await savePositionAction(
          currentFen,
          name.trim() || undefined,
        );
        setName("");
        showNotice(
          `Đã lưu thế cờ${savedPosition.name ? ` “${savedPosition.name}”` : ""} vào SQLite.`,
        );
        setSaved(await listPositionsAction());
      } catch (cause) {
        showError(
          cause instanceof Error
            ? cause.message
            : "Không lưu được thế cờ vào cơ sở dữ liệu.",
        );
      }
    });
  };

  const turn = gameRef.current.turn() === "w" ? "Trắng" : "Đen";

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,480px)_1fr]">
      <div className="flex flex-col gap-4">
        <div className="w-full">
          <Chessboard
            options={{
              id: "playground",
              position: fen,
              boardOrientation: "white",
              onPieceDrop: handlePieceDrop,
            }}
          />
        </div>
        <p className="text-sm text-stone-500">
          Lượt đi: <span className="font-semibold text-stone-700">{turn}</span>
          {" · "}
          Tốt tới hàng cuối sẽ phong Hậu (queen).
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <form
          className="rounded-lg border border-stone-300 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            loadFen(fenInput);
          }}
        >
          <h2 className="font-semibold">Nạp thế cờ từ FEN</h2>
          <label className="mt-2 block text-sm text-stone-600" htmlFor="fen">
            FEN (Forsyth–Edwards Notation)
          </label>
          <input
            id="fen"
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm focus:border-stone-500 focus:outline-hidden"
            value={fenInput}
            onChange={(event) => setFenInput(event.target.value)}
            spellCheck={false}
          />
          <button
            type="submit"
            className="mt-3 rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            disabled={isPending}
          >
            Nạp FEN (Load)
          </button>
        </form>

        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">Lưu thế cờ hiện tại</h2>
          <label className="mt-2 block text-sm text-stone-600" htmlFor="name">
            Tên (tùy chọn)
          </label>
          <input
            id="name"
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-hidden"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ví dụ: Tàn cuộc Rook vs Pawn"
          />
          <button
            type="button"
            onClick={handleSave}
            className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            disabled={isPending}
          >
            Lưu thế cờ (Save)
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-800"
          >
            {notice}
          </p>
        )}

        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">
            Thế đã lưu <span className="text-stone-400">(Saved positions)</span>
          </h2>
          {saved.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">
              Chưa có thế nào được lưu — hãy bấm “Lưu thế cờ (Save)”.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-stone-200">
              {saved.map((position) => (
                <li key={position.id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-2 text-left hover:bg-stone-100"
                    onClick={() => {
                      if (loadFen(position.fen)) {
                        showNotice(
                          `Đã nạp thế${position.name ? ` “${position.name}”` : ""} từ danh sách đã lưu.`,
                        );
                      }
                    }}
                  >
                    <span className="block text-sm font-medium">
                      {position.name ?? "Không tên"}
                    </span>
                    <span className="block truncate font-mono text-xs text-stone-500">
                      {position.fen}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
