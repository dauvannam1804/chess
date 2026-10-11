// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import type { DrillItem, DrillSummary, LineNode } from "@/lib/trainer-service";

type BoardOptions = {
  position: string;
  onPieceDrop: (args: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => boolean;
};

const mocks = vi.hoisted(() => ({
  onPieceDrop: null as BoardOptions["onPieceDrop"] | null,
  getDrillQueueAction: vi.fn(),
  answerDrillItemAction: vi.fn(async () => ({
    nodeId: 1,
    box: 1,
    dueAt: new Date().toISOString(),
    masteredAt: null,
    updatedAt: new Date().toISOString(),
  })),
  getDrillSummaryAction: vi.fn(async () => SUMMARY),
  getLineMasteryAction: vi.fn(async () => []),
}));

vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: BoardOptions }) => {
    mocks.onPieceDrop = options.onPieceDrop;
    return <div data-testid="chessboard" />;
  },
}));

vi.mock("@/app/actions", () => ({
  getDrillQueueAction: mocks.getDrillQueueAction,
  answerDrillItemAction: mocks.answerDrillItemAction,
  getDrillSummaryAction: mocks.getDrillSummaryAction,
  getLineMasteryAction: mocks.getLineMasteryAction,
}));

import { DrillTrainer } from "@/components/drill-trainer";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const SUMMARY: DrillSummary = { due: 1, mastered: 0, learning: 0 };

/** Cây line "1. e4 e5 2. Nf3 Nc6" rút gọn cho fixture — fenAfter sinh bằng chess.js. */
function buildLineTree(): LineNode {
  const chess = new Chess();
  const fenAfter = (san: string) => {
    chess.move(san);
    return chess.fen();
  };
  const fenE4 = fenAfter("e4");
  const fenE5 = fenAfter("e5");
  const fenNf3 = fenAfter("Nf3");
  const node = (
    id: number,
    san: string,
    uci: string,
    fenAfter_: string,
    isUserMove: boolean,
    children: LineNode[],
  ): LineNode => ({
    id,
    san,
    uci,
    fenAfter: fenAfter_,
    isUserMove,
    comments: [],
    startingComments: [],
    nags: [],
    children,
  });
  return {
    id: null,
    san: null,
    uci: null,
    fenAfter: START_FEN,
    isUserMove: false,
    comments: [],
    startingComments: [],
    nags: [],
    children: [
      node(
        1,
        "e4",
        "e2e4",
        fenE4,
        true,
        [
          node(2, "e5", "e7e5", fenE5, false, [
            node(3, "Nf3", "g1f3", fenNf3, true, []),
          ]),
        ],
      ),
    ],
  };
}

const ITEM: DrillItem = {
  nodeId: 1,
  parentNodeId: null,
  lineId: 7,
  lineName: "Ý",
  userColor: "w",
  box: 1,
  dueAt: new Date().toISOString(),
  parentFen: START_FEN,
  expectedSans: ["e4"],
  lineTree: buildLineTree(),
};

function renderTrainer() {
  render(<DrillTrainer initialSummary={SUMMARY} initialLineMastery={[]} />);
}

async function startSession() {
  const user = userEvent.setup();
  renderTrainer();
  await user.click(screen.getByRole("button", { name: /Bắt đầu ôn tập/ }));
  await screen.findByText(/Mục 1\/1/);
  const drop = mocks.onPieceDrop;
  if (!drop) throw new Error("Chessboard mock chưa bắt được onPieceDrop");
  return drop;
}

function drop_(drop: BoardOptions["onPieceDrop"], from: string, to: string) {
  let accepted: boolean | undefined;
  act(() => {
    accepted = drop({ sourceSquare: from, targetSquare: to });
  });
  return accepted;
}

beforeEach(() => {
  mocks.getDrillQueueAction.mockResolvedValue([ITEM]);
});

afterEach(() => {
  cleanup();
  mocks.onPieceDrop = null;
  vi.clearAllMocks();
});

describe("DrillTrainer — wiring trả lời drill (spec Testing Decisions)", () => {
  it("đi SAI → answerDrillItemAction(nodeId, false) + feedback đỏ hiện nước đúng", async () => {
    const drop = await startSession();

    // Mã đi g1f3 hợp lệ theo chess.js nhưng không nằm trong expectedSans.
    const accepted = drop_(drop, "g1", "f3");

    expect(accepted).toBe(false);
    await vi.waitFor(() =>
      expect(mocks.answerDrillItemAction).toHaveBeenCalledWith(1, false),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Sai rồi! Nước đúng: e4/,
    );
  });

  it("đi ĐÚNG → answerDrillItemAction(nodeId, true) + feedback xanh, bàn cập nhật", async () => {
    mocks.getDrillQueueAction.mockResolvedValue([ITEM]);
    const drop = await startSession();

    const accepted = drop_(drop, "e2", "e4");

    expect(accepted).toBe(true);
    await vi.waitFor(() =>
      expect(mocks.answerDrillItemAction).toHaveBeenCalledWith(1, true),
    );
    const feedback = await screen.findByText(/Chuẩn! e4/);
    expect(feedback).toHaveAttribute("role", "status");
  });

  it("hàng đợi rỗng → không gọi answerDrillItemAction, thông báo quay lại sau", async () => {
    mocks.getDrillQueueAction.mockResolvedValue([]);
    const user = userEvent.setup();
    renderTrainer();

    await user.click(screen.getByRole("button", { name: /Bắt đầu ôn tập/ }));

    const info = await screen.findByText(/Không có mục nào đến hạn/);
    expect(info).toHaveAttribute("role", "status");
    expect(mocks.answerDrillItemAction).not.toHaveBeenCalled();
  });
});
