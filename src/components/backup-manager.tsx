"use client";

import { useState, useTransition } from "react";
import {
  exportBackupAction,
  importBackupAction,
} from "@/app/actions";

type ImportedCounts = Record<string, number>;

const COUNT_LABELS: Record<string, string> = {
  positions: "vị trí đã lưu",
  puzzleAttempts: "lượt giải Puzzle",
  repertoireLines: "dòng khai cuộc",
  lineMoves: "nước đi",
  drillSchedule: "lịch drill",
  games: "ván",
  gameAnalysis: "phân tích ván",
  endgamePositions: "thế tàn cuộc",
  endgameSchedule: "lịch tàn cuộc",
};

function describeImported(imported: ImportedCounts): string {
  const parts = Object.entries(COUNT_LABELS)
    .filter(([key]) => (imported[key] ?? 0) > 0)
    .map(([key, label]) => `${imported[key]} ${label}`);
  return parts.length > 0
    ? `Đã nhập: ${parts.join(", ")}.`
    : "File backup không chứa dữ liệu nào.";
}

/** Backup (US-35): xuất toàn bộ dữ liệu người dùng ra JSON, nhập lại từ file. */
export function BackupManager() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const downloadBackup = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const backup = await exportBackupAction();
        const blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `chess-trainer-backup-${new Date()
          .toISOString()
          .slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        setMessage(
          `Đã xuất file backup ${link.download} — chứa toàn bộ dữ liệu người dùng (trừ nội dung Puzzle, xem ADR-0002).`,
        );
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Không xuất được backup.",
        );
      }
    });
  };

  const importFromFile = (file: File) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch (cause) {
        setError(
          `Không đọc được file JSON: ${cause instanceof Error ? cause.message : "định dạng không hợp lệ"}.`,
        );
        return;
      }
      try {
        const { imported } = await importBackupAction(data);
        setMessage(describeImported(imported));
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Không nhập được file backup.",
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-stone-300 bg-white p-4">
        <h2 className="font-semibold">
          Xuất dữ liệu <span className="text-sm font-normal text-stone-400">(export)</span>
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Tải một file JSON chứa toàn bộ dữ liệu người dùng: dòng khai cuộc +
          Annotation, lượt giải Puzzle, lịch SRS Leitner (drill + tàn cuộc),
          ván đấu + cache phân tích, thế tàn cuộc (bao gồm cả catalog). Nội dung
          Puzzle không xuất kèm — nhập lại từ Lichess dump (ADR-0002).
        </p>
        <button
          type="button"
          onClick={downloadBackup}
          disabled={isPending}
          className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {isPending ? "Đang xuất…" : "Xuất dữ liệu (export)"}
        </button>
      </section>

      <section className="rounded-lg border border-stone-300 bg-white p-4">
        <h2 className="font-semibold">
          Nhập từ file backup <span className="text-sm font-normal text-stone-400">(import)</span>
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Chọn file backup đã xuất trước đó. Dữ liệu được khôi phục nguyên trạng
          (giữ nguyên id, upsert không nhân bản); toàn bộ nhập trong một giao
          dịch — file hỏng thì database không đổi.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          className="mt-3 block w-full text-sm text-stone-700 file:mr-3 file:rounded-md file:border-0 file:bg-stone-200 file:px-4 file:py-2 file:text-sm file:font-medium file:text-stone-800 hover:file:bg-stone-300"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importFromFile(file);
            event.target.value = "";
          }}
        />
      </section>

      {message && (
        <p
          role="status"
          className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900"
        >
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
