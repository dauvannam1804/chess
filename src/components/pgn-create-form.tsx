"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createLineFromPgnAction } from "@/app/actions";

const SAMPLE_PGN =
  "1. e4 e5 {king pawn} 2. Nf3 (2. f4 exf4 (2... d5) 3. Nf3) (2. d4 exd4) 2... Nc6 3. Bb5";

export function PgnCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pgnText, setPgnText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const line = await createLineFromPgnAction(name.trim(), pgnText);
        router.push(`/khai-cuoc/${line.id}`);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Không tạo được Dòng khai cuộc từ PGN này.",
        );
      }
    });
  };

  return (
    <form
      className="rounded-lg border border-stone-300 bg-white p-4"
      onSubmit={handleSubmit}
    >
      <h2 className="font-semibold">Tạo từ PGN</h2>
      <p className="mt-1 text-sm text-stone-500">
        Dán PGN có biến án (variation) và chú thích (comment) — app lưu nguyên
        cây nước kèm nhánh. Để trống phần nước để tạo line trống rồi tự đi từng
        nước trên bàn.
      </p>
      <label className="mt-3 block text-sm text-stone-600" htmlFor="line-name">
        Tên Dòng khai cuộc
      </label>
      <input
        id="line-name"
        className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-hidden"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Ví dụ: Ý — Gambit Ý"
        required
      />
      <label className="mt-3 block text-sm text-stone-600" htmlFor="line-pgn">
        PGN
      </label>
      <textarea
        id="line-pgn"
        className="mt-1 h-32 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm focus:border-stone-500 focus:outline-hidden"
        value={pgnText}
        onChange={(event) => setPgnText(event.target.value)}
        placeholder={SAMPLE_PGN}
        spellCheck={false}
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          disabled={isPending}
        >
          {isPending ? "Đang lưu…" : "Tạo Dòng khai cuộc"}
        </button>
        {pgnText.trim() === "" && !isPending && (
          <button
            type="button"
            className="text-xs text-stone-500 underline hover:text-stone-700"
            onClick={() => setPgnText(SAMPLE_PGN)}
          >
            Chèn PGN mẫu có biến án + comment
          </button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}
    </form>
  );
}
