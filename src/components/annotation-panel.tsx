"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  draftAnnotationAction,
  getAnnotationAction,
  setAnnotationAction,
} from "@/app/actions";

export type AnnotationPanelProps = {
  lineId: number;
  nodeId: number;
  lineName: string;
  moveSan: string;
  fenBefore: string;
  fenAfter: string;
  movesSoFar: string[];
  isUserMove: boolean;
  /** PGN comment gốc (nếu có) — dùng prefill ô sửa, KHÔNG tự lưu. */
  pgnComments: string[];
  explainerAvailable: boolean;
};

/**
 * Panel Annotation (Giải thích) của một nước: bản nháp GLM chỉ đổ vào ô
 * sửa; text chỉ persist vĩnh viễn khi người dùng bấm "Lưu giải thích".
 */
export function AnnotationPanel(props: AnnotationPanelProps) {
  const {
    lineId,
    nodeId,
    lineName,
    moveSan,
    fenBefore,
    fenAfter,
    movesSoFar,
    isUserMove,
    pgnComments,
    explainerAvailable,
  } = props;
  const router = useRouter();
  const [savedAnnotation, setSavedAnnotation] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const saved = await getAnnotationAction(lineId, nodeId);
        if (cancelled) return;
        setSavedAnnotation(saved);
        // Chưa có annotation → prefill từ PGN comment đầu tiên (chưa lưu).
        setDraft(saved ?? pgnComments[0] ?? "");
      } catch {
        if (!cancelled) {
          setError("Không tải được Giải thích đã lưu của nước này.");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lineId, nodeId]);

  const handleSave = () => {
    startTransition(async () => {
      try {
        const text = draft.trim() ? draft : null;
        await setAnnotationAction(lineId, nodeId, text);
        setSavedAnnotation(text);
        setNotice(
          text === null
            ? "Đã xóa Giải thích."
            : "Đã lưu Giải thích vào cơ sở dữ liệu.",
        );
        setError(null);
        router.refresh();
      } catch {
        setError("Không lưu được Giải thích — thử lại.");
      }
    });
  };

  const handleDraft = () => {
    startTransition(async () => {
      try {
        const result = await draftAnnotationAction({
          lineName,
          moveSan,
          fenBefore,
          fenAfter,
          movesSoFar,
          isUserMove,
        });
        if (result.text === null) {
          setNotice(
            "GLM không trả được bản nháp — bạn có thể tự viết rồi bấm lưu.",
          );
          return;
        }
        setDraft(result.text);
        setNotice(
          "Đã đổ bản nháp vào ô sửa — bấm \"Lưu giải thích\" để lưu vĩnh viễn.",
        );
        setError(null);
      } catch {
        setError("Không soạn được bản nháp — thử lại.");
      }
    });
  };

  return (
    <div className="rounded-lg border border-stone-300 bg-white p-4">
      <h2 className="font-semibold">
        Giải thích <span className="text-xs font-normal text-stone-400">(Annotation)</span>
      </h2>
      {savedAnnotation === null ? (
        <p className="mt-1 text-sm text-stone-500">
          Chưa có Giải thích nào cho nước này — viết rõ vì sao nước này được
          chơi rồi bấm lưu.
        </p>
      ) : (
        <p className="mt-1 text-sm text-emerald-700">
          Đã có Giải thích lưu vĩnh viễn cho nước này.
        </p>
      )}
      <textarea
        className="mt-3 h-28 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
        placeholder="Vì sao nước này? (ví dụ: chiếm trung tâm, mở đường Tượng C4…)"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          onClick={handleSave}
          disabled={isPending}
        >
          Lưu giải thích
        </button>
        <button
          type="button"
          className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleDraft}
          disabled={isPending || !explainerAvailable}
          title={
            explainerAvailable
              ? "Soạn bản nháp bằng GLM — chưa lưu tới khi bạn bấm Lưu giải thích"
              : "Chưa cấu hình GLM_API_KEY trong .env.local — tự viết rồi bấm Lưu giải thích"
          }
        >
          Soạn nháp (GLM)
        </button>
        {isPending && (
          <span role="status" className="text-sm text-stone-500">
            Đang xử lý…
          </span>
        )}
      </div>
      {!explainerAvailable && (
        <p className="mt-2 text-xs text-stone-400">
          Soạn nháp bằng GLM cần GLM_API_KEY trong .env.local (xem
          docs/adr/0001 — app chạy local, key không commit).
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 text-sm text-stone-600">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
