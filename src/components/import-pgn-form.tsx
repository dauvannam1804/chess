"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importGameFromPgnAction } from "@/app/actions";

type UserColor = "w" | "b";

/** Form import ván bằng PGN dán vào (US-29) — tạo Game rồi nhảy tới review. */
export function ImportPgnForm() {
  const router = useRouter();
  const [pgn, setPgn] = useState("");
  const [userColor, setUserColor] = useState<UserColor>("w");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const gameId = await importGameFromPgnAction(pgn, userColor);
        router.push(`/xem-lai-van/${gameId}`);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Không import được PGN này.",
        );
      }
    });
  };

  return (
    <form
      className="rounded-lg border border-stone-300 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h2 className="font-semibold">
        Import bằng PGN <span className="text-sm font-normal text-stone-400">(Lichess / chess.com)</span>
      </h2>
      <label className="mt-3 block text-sm text-stone-600" htmlFor="import-pgn">
        Dán PGN của ván
        <textarea
          id="import-pgn"
          rows={6}
          value={pgn}
          onChange={(event) => setPgn(event.target.value)}
          placeholder={'[Event "..."]\n\n1. e4 e5 2. Nf3 ...'}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm text-stone-900 focus:border-stone-500 focus:outline-hidden"
        />
      </label>
      <label className="mt-2 block text-sm text-stone-600" htmlFor="import-color">
        Màu bạn cầm
        <select
          id="import-color"
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-hidden sm:w-56"
          value={userColor}
          onChange={(event) => setUserColor(event.target.value as UserColor)}
        >
          <option value="w">Trắng</option>
          <option value="b">Đen</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
      >
        {isPending ? "Đang import…" : "Import & xem lại"}
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </form>
  );
}
