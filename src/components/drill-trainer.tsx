"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  answerDrillItemAction,
  getDrillQueueAction,
  getDrillSummaryAction,
  getLineMasteryAction,
} from "@/app/actions";
import { FeedbackBanner } from "@/components/feedback-banner";
import type { Feedback } from "@/lib/feedback";
import { isLineMastered, type LineMastery } from "@/lib/line-mastery";
import type { DrillItem, DrillSummary, LineNode } from "@/lib/trainer-service";

type Phase = "idle" | "running" | "done";

/**
 * Trạng thái thế cờ đang luyện của một mục hàng đợi.
 * `posNode` là node trong lineTree mà thế cờ hiển thị = fenAfter của nó
 * (null-parent mục đầu dùng root ảo). Các con của posNode = nước chấp nhận.
 */
type Chain = {
  item: DrillItem;
  posNode: LineNode;
  fen: string;
  expectedSans: string[];
  isStart: boolean;
};

function findNode(node: LineNode, id: number): LineNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** Node cha của node drillable — thế cờ luyện là fenAfter của node này. */
function parentNodeOf(item: DrillItem): LineNode {
  if (item.parentNodeId === null) return item.lineTree;
  return findNode(item.lineTree, item.parentNodeId) ?? item.lineTree;
}

export function DrillTrainer({
  initialSummary,
  initialLineMastery,
}: {
  initialSummary: DrillSummary;
  initialLineMastery: LineMastery[];
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [summary, setSummary] = useState<DrillSummary>(initialSummary);
  const [lineMastery, setLineMastery] = useState<LineMastery[]>(initialLineMastery);
  const [queue, setQueue] = useState<DrillItem[]>([]);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [chain, setChain] = useState<Chain | null>(null);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  const replyTimerRef = useRef<number | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    for (const timerRef of [replyTimerRef, advanceTimerRef]) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  useEffect(() => clearTimers, []);

  /** Ghi nhận Leitner; app local nên bắn và quên, lỗi không phá phiên. */
  const feedAnswers = (nodeIds: number[], correct: boolean) => {
    for (const nodeId of new Set(nodeIds)) {
      void answerDrillItemAction(nodeId, correct).catch(() => undefined);
    }
  };

  const startItem = (item: DrillItem) => {
    clearTimers();
    setLocked(false);
    setFeedback(null);
    setOrientation(item.userColor === "b" ? "black" : "white");
    setChain({
      item,
      posNode: parentNodeOf(item),
      fen: item.parentFen,
      expectedSans: item.expectedSans,
      isStart: true,
    });
  };

  const finishSession = () => {
    setChain(null);
    setPhase("done");
    startTransition(async () => {
      const [nextSummary, nextMastery] = await Promise.all([
        getDrillSummaryAction(),
        getLineMasteryAction(),
      ]);
      setSummary(nextSummary);
      setLineMastery(nextMastery);
    });
  };

  const nextItem = () => {
    clearTimers();
    const next = indexRef.current + 1;
    if (next < queue.length) {
      indexRef.current = next;
      setIndex(next);
      startItem(queue[next]);
    } else {
      finishSession();
    }
  };

  const startSession = () => {
    startTransition(async () => {
      const items = await getDrillQueueAction();
      if (items.length === 0) {
        setFeedback({
          kind: "info",
          text: "Không có mục nào đến hạn — hãy quay lại sau!",
        });
        return;
      }
      setQueue(items);
      setCorrectCount(0);
      setWrongCount(0);
      indexRef.current = 0;
      setIndex(0);
      setPhase("running");
      startItem(items[0]);
    });
  };

  /** Node nước người dùng sẽ bị chấm tại vị trí hiện tại (trả lời sai). */
  const failNodeIds = (current: Chain): number[] => {
    const ids = current.posNode.children
      .filter((child) => child.isUserMove && child.id !== null)
      .map((child) => child.id!);
    if (current.isStart) ids.push(current.item.nodeId);
    return ids;
  };

  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean => {
    if (!targetSquare || locked || chain === null) return false;
    const current = chain;
    const chess = new Chess(current.fen);
    let move;
    try {
      // Auto-queen: react-chessboard v5 không có dialog phong cấp.
      move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
    } catch {
      return false;
    }
    if (!move) return false;

    if (!current.expectedSans.includes(move.san)) {
      // SAI: tụt về hộp 1 toàn bộ nước repertoire chấp nhận được tại thế này.
      feedAnswers(failNodeIds(current), false);
      setWrongCount((count) => count + 1);
      setLocked(true);
      setFeedback({
        kind: "error",
        text: `Sai rồi! Nước đúng: ${current.expectedSans.join(" hoặc ")}`,
      });
      advanceTimerRef.current = window.setTimeout(nextItem, 2000);
      return false;
    }

    // ĐÚNG: node đã đi được chấm đúng; nếu đây là vị trí của mục hàng đợi
    // (có thể trả lời bằng nhánh khác) thì mục đó cũng được thăng hộp.
    const played =
      current.posNode.children.find((child) => child.san === move.san) ?? null;
    if (played?.fenAfter) {
      feedAnswers(
        current.isStart ? [current.item.nodeId, played.id ?? -1] : [played.id ?? -1],
        true,
      );
    }
    setCorrectCount((count) => count + 1);
    setLocked(true);
    setFeedback({ kind: "success", text: `Chuẩn! ${move.san}` });
    replyTimerRef.current = window.setTimeout(() => {
      const reply = played?.children[0] ?? null;
      if (!reply?.fenAfter) {
        setFeedback({ kind: "info", text: "Hoàn thành biến án — hết line!" });
        advanceTimerRef.current = window.setTimeout(nextItem, 1500);
        return;
      }
      // Đối phương phản hồi bằng nhánh chính, rồi tiếp tục cùng line.
      setChain({
        item: current.item,
        posNode: reply,
        fen: reply.fenAfter,
        expectedSans: reply.children
          .filter((child) => child.isUserMove)
          .map((child) => child.san!),
        isStart: false,
      });
      setFeedback({
        kind: "info",
        text: `Đối phương đi ${reply.san} — tới lượt bạn.`,
      });
      setLocked(false);
    }, 700);
    return true;
  };

  return (
    <div className="mt-6">
      {phase === "idle" && (
        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              <span className="text-stone-500">Đến hạn:</span>{" "}
              <span className="font-semibold text-stone-900">{summary.due}</span>
            </span>
            <span>
              <span className="text-stone-500">Đang học:</span>{" "}
              <span className="font-semibold text-stone-900">{summary.learning}</span>
            </span>
            <span>
              <span className="text-stone-500">Thuộc (Mastered):</span>{" "}
              <span className="font-semibold text-emerald-700">{summary.mastered}</span>
            </span>
            <span>
              <span className="text-stone-500">Line đã thuộc:</span>{" "}
              <span className="font-semibold text-emerald-700">
                {lineMastery.filter(isLineMastered).length}/{lineMastery.length}
              </span>
            </span>
          </div>
          <p className="mt-2 text-xs text-stone-400">
            Line “Thuộc” khi toàn bộ nước repertoire của nó đã Mastered.
          </p>
          <button
            type="button"
            onClick={startSession}
            disabled={isPending || summary.due === 0}
            className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            Bắt đầu ôn tập
          </button>
          {summary.due === 0 && (
            <p className="mt-3 text-sm text-stone-500">
              Không có mục nào đến hạn hôm nay — hàng đợi sẽ refill theo due date
              của Leitner (1 → 3 → 7 ngày).
            </p>
          )}
          <FeedbackBanner feedback={feedback} className="mt-3" />
        </div>
      )}

      {phase === "running" && chain && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                Mục {index + 1}/{queue.length} ·{" "}
                <span className="text-stone-500">{chain.item.lineName}</span>{" "}
                <span className="text-sm font-normal text-stone-400">
                  · hộp {chain.item.box}
                </span>
              </h2>
              <span className="text-sm text-stone-500">
                Đúng <span className="font-medium text-emerald-700">{correctCount}</span>{" "}
                · Sai <span className="font-medium text-red-700">{wrongCount}</span>
              </span>
            </div>
            <div className="w-full max-w-[480px]">
              <Chessboard
                options={{
                  id: "drill-session",
                  position: chain.fen,
                  boardOrientation: orientation,
                  onPieceDrop: handlePieceDrop,
                }}
              />
            </div>
            <FeedbackBanner feedback={feedback} />
          </div>
          <aside className="flex flex-col gap-3 text-sm text-stone-600">
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <h3 className="font-semibold text-stone-800">Luật ôn</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Đi nước repertoire của bạn từ thế cờ trên bàn.</li>
                <li>Nước lệ trong repertoire (nhánh) cũng được chấp nhận.</li>
                <li>Đúng: đối phương tự phản hồi, bạn đi tiếp đến hết line.</li>
                <li>Sai: hiện nước đúng, tụt về hộp 1 và qua mục kế tiếp.</li>
              </ul>
            </div>
            <button
              type="button"
              onClick={nextItem}
              className="rounded-md border border-stone-300 bg-white px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-100"
            >
              {index + 1 < queue.length ? "Mục tiếp theo" : "Kết thúc phiên"}
            </button>
          </aside>
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">
            Phiên ôn hoàn thành — đúng{" "}
            <span className="text-emerald-700">{correctCount}</span> / sai{" "}
            <span className="text-red-700">{wrongCount}</span>
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Còn <span className="font-medium">{summary.due}</span> mục đến hạn ·{" "}
            <span className="font-medium text-emerald-700">{summary.mastered}</span>{" "}
            mục đã Mastered.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startSession}
              disabled={isPending || summary.due === 0}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              Ôn tiếp
            </button>
            <Link
              href="/"
              className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
            >
              Về trang chính
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
