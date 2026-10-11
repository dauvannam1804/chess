"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  addEndgamePositionAction,
  answerEndgameItemAction,
  deleteEndgamePositionAction,
  getEndgameQueueAction,
  listEndgamePositionsAction,
} from "@/app/actions";
import {
  disposeBrowserEngine,
  getBrowserEngine,
} from "@/lib/engine/browser-engine";
import {
  endgameOutcome,
  type EndgameGoal,
  type EndgameUserColor,
} from "@/lib/endgame/outcome";
import type {
  EndgamePosition,
  EndgameQueueItem,
} from "@/lib/trainer-service";

/** Engine phòng ngự ở độ sâu 12 (theo ticket). */
const ENGINE_MOVE_DEPTH = 12;
const ENGINE_FIRST_MOVE_DELAY_MS = 600;
const ENGINE_REPLY_DELAY_MS = 350;

type Feedback = { kind: "error" | "success" | "info"; text: string } | null;

type EndBanner = { kind: "pass" | "fail"; text: string };

type DrillPosition = {
  id: number;
  name: string;
  fen: string;
  goal: EndgameGoal;
  userColor: EndgameUserColor;
  maxMoves: number;
};

type DrillState = {
  position: DrillPosition;
  chess: Chess;
  moveCount: number;
};

function toDrillPosition(entry: {
  id?: number;
  positionId?: number;
  name: string;
  fen: string;
  goal: EndgameGoal;
  userColor: EndgameUserColor;
  maxMoves: number;
}): DrillPosition {
  const id = entry.id ?? entry.positionId;
  if (id === undefined) throw new Error("Thế tàn cuộc thiếu id");
  return {
    id,
    name: entry.name,
    fen: entry.fen,
    goal: entry.goal,
    userColor: entry.userColor,
    maxMoves: entry.maxMoves,
  };
}

function goalLabel(goal: EndgameGoal): string {
  return goal === "win" ? "Chiếu hết" : "Cầm hòa";
}

function colorLabel(color: EndgameUserColor): string {
  return color === "w" ? "Trắng" : "Đen";
}

function MasteryBadge({
  position,
}: {
  position: EndgamePosition;
}) {
  if (position.masteredAt) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        Thuộc
      </span>
    );
  }
  if (position.box !== null) {
    return (
      <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-semibold text-stone-700">
        Hộp {position.box}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
      Chưa học
    </span>
  );
}

export function EndgameTrainer({
  initialPositions,
}: {
  initialPositions: EndgamePosition[];
}) {
  const [phase, setPhase] = useState<"catalog" | "drill">("catalog");
  const [positions, setPositions] = useState<EndgamePosition[]>(initialPositions);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  // Form nhập FEN
  const [formName, setFormName] = useState("");
  const [formFen, setFormFen] = useState("");
  const [formGoal, setFormGoal] = useState<EndgameGoal>("win");
  const [formColor, setFormColor] = useState<EndgameUserColor>("w");
  const [formMaxMoves, setFormMaxMoves] = useState("");

  // Drill runner
  const [fen, setFen] = useState("");
  const [thinking, setThinking] = useState(false);
  const [endBanner, setEndBanner] = useState<EndBanner | null>(null);
  const [moveCount, setMoveCount] = useState(0);

  const drillRef = useRef<DrillState | null>(null);
  const drillIdRef = useRef(0);
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

  const dueCount = positions.filter(
    (p) =>
      p.box !== null &&
      p.masteredAt === null &&
      p.dueAt !== null &&
      Date.parse(p.dueAt) <= Date.now(),
  ).length;

  const refreshPositions = () => {
    startTransition(async () => {
      setPositions(await listEndgamePositionsAction());
    });
  };

  /** Kết thúc phiên: chấm pass/fail, nạp vào Leitner, hiện banner. */
  const conclude = (): boolean => {
    const state = drillRef.current;
    if (!state || finishedRef.current) return true;
    const outcome = endgameOutcome(
      state.position.goal,
      state.chess,
      state.moveCount,
      state.position.userColor,
      state.position.maxMoves,
    );
    if (outcome.status === "ongoing") return false;
    finishedRef.current = true;
    setEndBanner({
      kind: outcome.status === "pass" ? "pass" : "fail",
      text: outcome.reason,
    });
    startTransition(async () => {
      await answerEndgameItemAction(
        state.position.id,
        outcome.status === "pass",
      );
      setPositions(await listEndgamePositionsAction());
    });
    return true;
  };

  const engineReply = async (gid: number) => {
    const state = drillRef.current;
    if (!state || drillIdRef.current !== gid) return;
    try {
      const analysis = await getBrowserEngine().analyse(
        state.chess.fen(),
        ENGINE_MOVE_DEPTH,
      );
      if (drillIdRef.current !== gid) return;
      const uci = analysis.bestLineUci[0];
      if (!uci) {
        // Engine hết nước — thế cờ đã kết thúc, phán định luôn.
        conclude();
        return;
      }
      state.chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      setFen(state.chess.fen());
      conclude();
    } catch (cause) {
      if (drillIdRef.current === gid) {
        setFeedback({
          kind: "error",
          text: `Lỗi engine: ${(cause as Error).message}`,
        });
      }
    } finally {
      if (drillIdRef.current === gid) {
        thinkingRef.current = false;
        setThinking(false);
      }
    }
  };

  const scheduleEngineReply = (delay: number) => {
    thinkingRef.current = true;
    setThinking(true);
    const gid = drillIdRef.current;
    engineTimerRef.current = window.setTimeout(() => {
      void engineReply(gid);
    }, delay);
  };

  const startDrill = (entry: DrillPosition) => {
    clearTimers();
    setFeedback(null);
    setEndBanner(null);
    setMoveCount(0);
    drillIdRef.current += 1;
    finishedRef.current = false;
    thinkingRef.current = false;
    drillRef.current = { position: entry, chess: new Chess(entry.fen), moveCount: 0 };
    setFen(entry.fen);
    setPhase("drill");
    if (entry.userColor === "b") {
      // Engine cầm Trắng đi trước.
      scheduleEngineReply(ENGINE_FIRST_MOVE_DELAY_MS);
    }
  };

  const startDueDrill = () => {
    startTransition(async () => {
      const queue: EndgameQueueItem[] = await getEndgameQueueAction();
      if (queue.length === 0) {
        setFeedback({
          kind: "info",
          text: "Không có thế nào đến hạn — chọn thẳng một thế trong danh sách.",
        });
        return;
      }
      startDrill(toDrillPosition(queue[0]));
    });
  };

  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean => {
    const state = drillRef.current;
    if (!targetSquare || !state) return false;
    if (thinkingRef.current || finishedRef.current) return false;
    if (state.chess.turn() !== state.position.userColor) return false;
    try {
      // Auto-queen như các module khác (react-chessboard v5 không có dialog).
      state.chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
    } catch {
      setFeedback({
        kind: "error",
        text: `Nước đi không hợp lệ: ${sourceSquare} → ${targetSquare}. Hãy đi lại.`,
      });
      return false;
    }
    state.moveCount += 1;
    setMoveCount(state.moveCount);
    setFen(state.chess.fen());
    setFeedback(null);
    if (conclude()) return true;
    scheduleEngineReply(ENGINE_REPLY_DELAY_MS);
    return true;
  };

  const backToCatalog = () => {
    clearTimers();
    drillIdRef.current += 1;
    drillRef.current = null;
    thinkingRef.current = false;
    finishedRef.current = false;
    setThinking(false);
    setEndBanner(null);
    setFeedback(null);
    setPhase("catalog");
    refreshPositions();
  };

  const handleImport = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    const parsedMaxMoves =
      formMaxMoves.trim().length > 0 ? Number(formMaxMoves) : undefined;
    startTransition(async () => {
      try {
        const created = await addEndgamePositionAction({
          name: formName,
          fen: formFen,
          goal: formGoal,
          userColor: formColor,
          maxMoves: parsedMaxMoves,
        });
        setPositions(await listEndgamePositionsAction());
        setFormName("");
        setFormFen("");
        setFormGoal("win");
        setFormColor("w");
        setFormMaxMoves("");
        setFeedback({
          kind: "success",
          text: `Đã thêm thế "${created.name}" — bấm Luyện để bắt đầu.`,
        });
      } catch (cause) {
        setFeedback({
          kind: "error",
          text: `Không thêm được thế: ${(cause as Error).message}`,
        });
      }
    });
  };

  const handleDelete = (position: EndgamePosition) => {
    if (!window.confirm(`Xóa thế "${position.name}" cùng lịch ôn của nó?`)) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteEndgamePositionAction(position.id);
        setPositions(await listEndgamePositionsAction());
      } catch (cause) {
        setFeedback({
          kind: "error",
          text: `Không xóa được: ${(cause as Error).message}`,
        });
      }
    });
  };

  return (
    <div className="mt-6">
      {phase === "catalog" && (
        <div className="flex flex-col gap-6">
          <div className="rounded-lg border border-stone-300 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">
                Danh sách thế{" "}
                <span className="text-sm font-normal text-stone-400">
                  ({positions.length})
                </span>
              </h2>
              <button
                type="button"
                onClick={startDueDrill}
                disabled={isPending || dueCount === 0}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                Luyện thế đến hạn ({dueCount})
              </button>
            </div>
            {dueCount === 0 && (
              <p className="mt-2 text-sm text-stone-500">
                Chưa có thế nào đến hạn theo Leitner (1 → 3 → 7 ngày) — vẫn có
                thể luyện thẳng bất kỳ thế nào bên dưới.
              </p>
            )}
            <ul className="mt-3 divide-y divide-stone-100">
              {positions.map((position) => (
                <li
                  key={position.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-stone-900">
                        {position.name}
                      </span>
                      <MasteryBadge position={position} />
                      {position.source === "import" && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">
                          Nhập tay
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      Mục tiêu: {goalLabel(position.goal)} · bạn cầm{" "}
                      {colorLabel(position.userColor)} · tối đa{" "}
                      {position.maxMoves} nước
                      {position.box !== null && position.dueAt && !position.masteredAt
                        ? ` · đến hạn ${position.dueAt.slice(0, 10)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startDrill(toDrillPosition(position))}
                      className="rounded-md bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
                    >
                      Luyện
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(position)}
                      disabled={isPending}
                      className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Xóa
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {feedback && (
              <p
                role={feedback.kind === "error" ? "alert" : "status"}
                className={
                  feedback.kind === "error"
                    ? "mt-3 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800"
                    : feedback.kind === "success"
                      ? "mt-3 rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-800"
                      : "mt-3 rounded-md bg-stone-200 px-3 py-2 text-sm text-stone-700"
                }
              >
                {feedback.text}
              </p>
            )}
          </div>

          <form
            className="rounded-lg border border-stone-300 bg-white p-4"
            onSubmit={handleImport}
          >
            <h2 className="font-semibold">Nhập thế bằng FEN</h2>
            <p className="mt-1 text-sm text-stone-500">
              Luyện một thế app chưa có: dán FEN bất kỳ, chọn mục tiêu và màu
              quân bạn cầm.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-stone-600" htmlFor="eg-name">
                Tên thế
                <input
                  id="eg-name"
                  required
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  placeholder="VD: Lucena biến thể g-file"
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-hidden"
                />
              </label>
              <label className="block text-sm text-stone-600" htmlFor="eg-fen">
                FEN
                <input
                  id="eg-fen"
                  required
                  value={formFen}
                  onChange={(event) => setFormFen(event.target.value)}
                  placeholder="1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1"
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm text-stone-900 focus:border-stone-500 focus:outline-hidden"
                />
              </label>
              <label className="block text-sm text-stone-600" htmlFor="eg-goal">
                Mục tiêu
                <select
                  id="eg-goal"
                  value={formGoal}
                  onChange={(event) =>
                    setFormGoal(event.target.value as EndgameGoal)
                  }
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-hidden"
                >
                  <option value="win">Chiếu hết (thắng)</option>
                  <option value="draw">Cầm hòa / phòng ngự</option>
                </select>
              </label>
              <label className="block text-sm text-stone-600" htmlFor="eg-color">
                Màu quân của bạn
                <select
                  id="eg-color"
                  value={formColor}
                  onChange={(event) =>
                    setFormColor(event.target.value as EndgameUserColor)
                  }
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-hidden"
                >
                  <option value="w">Trắng</option>
                  <option value="b">Đen</option>
                </select>
              </label>
              <label
                className="block text-sm text-stone-600"
                htmlFor="eg-max-moves"
              >
                Số nước tối đa (mặc định 50)
                <input
                  id="eg-max-moves"
                  type="number"
                  min={1}
                  value={formMaxMoves}
                  onChange={(event) => setFormMaxMoves(event.target.value)}
                  placeholder="50"
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-hidden"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              Thêm vào danh sách
            </button>
          </form>
        </div>
      )}

      {phase === "drill" && drillRef.current && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                {drillRef.current.position.name}{" "}
                <span className="text-sm font-normal text-stone-400">
                  · mục tiêu {goalLabel(drillRef.current.position.goal)} · bạn
                  cầm {colorLabel(drillRef.current.position.userColor)}
                </span>
              </h2>
              <span className="text-sm text-stone-500">
                Nước bạn đã đi:{" "}
                <span className="font-medium text-stone-700">
                  {moveCount}/{drillRef.current.position.maxMoves}
                </span>
              </span>
            </div>
            <div className="w-full max-w-[480px]">
              <Chessboard
                options={{
                  id: "endgame-drill",
                  position: fen,
                  boardOrientation:
                    drillRef.current.position.userColor === "w"
                      ? "white"
                      : "black",
                  onPieceDrop: handlePieceDrop,
                }}
              />
            </div>
            {thinking && (
              <p role="status" className="text-sm text-stone-500">
                Engine đang phòng ngự…
              </p>
            )}
            {endBanner && (
              <>
                <p
                  role="status"
                  className={
                    endBanner.kind === "pass"
                      ? "rounded-md bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800"
                      : "rounded-md bg-red-100 px-3 py-2 text-sm font-semibold text-red-800"
                  }
                >
                  {endBanner.kind === "pass" ? "Đạt mục tiêu! " : "Trượt mục tiêu. "}
                  {endBanner.text}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={startDueDrill}
                    disabled={isPending || dueCount === 0}
                    className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    Ôn tiếp
                  </button>
                  <button
                    type="button"
                    onClick={backToCatalog}
                    className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
                  >
                    Về danh sách
                  </button>
                </div>
              </>
            )}
            {feedback && (
              <p
                role="alert"
                className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800"
              >
                {feedback.text}
              </p>
            )}
          </div>
          <aside className="flex flex-col gap-3 text-sm text-stone-600">
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <h3 className="font-semibold text-stone-800">Luật luyện</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>
                  Mục tiêu &laquo;Chiếu hết&raquo;: bạn phải chiếu hết engine
                  trong {drillRef.current.position.maxMoves} nước của mình.
                </li>
                <li>
                  Mục tiêu &laquo;Cầm hòa&raquo;: sống sót — tạo hòa hoặc trụ
                  qua đủ số nước mà không bị chiếu hết.
                </li>
                <li>Engine đi nước phòng ngự tốt nhất nó thấy (độ sâu 12).</li>
                <li>
                  Kết quả nạp thẳng vào lịch Leitner: đạt thì thăng hộp, trượt
                  thì tụt về hộp 1.
                </li>
              </ul>
            </div>
            <button
              type="button"
              onClick={backToCatalog}
              className="rounded-md border border-stone-300 bg-white px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-100"
            >
              Về danh sách
            </button>
          </aside>
        </div>
      )}

      <p className="mt-8 text-sm text-stone-500">
        Module này dùng chung phép toán Leitner với{" "}
        <Link href="/drill" className="underline hover:text-stone-700">
          Ôn tập khai cuộc
        </Link>{" "}
        nhưng lịch lưu riêng trong <code>endgame_schedule</code>.
      </p>
    </div>
  );
}
