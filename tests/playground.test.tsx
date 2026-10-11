// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

type BoardOptions = {
  position: string;
  onPieceDrop: (args: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => boolean;
};

const mocks = vi.hoisted(() => ({
  onPieceDrop: null as BoardOptions["onPieceDrop"] | null,
  position: "",
  listPositionsAction: vi.fn(async () => []),
  savePositionAction: vi.fn(async (fen: string, name?: string) => ({
    id: 1,
    fen,
    name: name ?? null,
    createdAt: "2026-10-12T00:00:00.000Z",
  })),
}));

vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: BoardOptions }) => {
    mocks.onPieceDrop = options.onPieceDrop;
    mocks.position = options.position;
    return <div data-testid="chessboard" />;
  },
}));

vi.mock("@/app/actions", () => ({
  listPositionsAction: mocks.listPositionsAction,
  savePositionAction: mocks.savePositionAction,
}));

import { Playground } from "@/components/playground";

afterEach(() => {
  cleanup();
  mocks.onPieceDrop = null;
  vi.clearAllMocks();
});

function renderBoard() {
  render(<Playground />);
  const drop = mocks.onPieceDrop;
  if (!drop) throw new Error("Chessboard mock chưa bắt được onPieceDrop");
  return drop;
}

describe("Playground — wiring bàn cờ (spec Testing Decisions)", () => {
  it("nước bất hợp lệ → onPieceDrop trả false (chess.js chặn) + báo lỗi, FEN không đổi", () => {
    const drop = renderBoard();
    const before = mocks.position;

    let accepted: boolean | undefined;
    act(() => {
      // Tốt e2 không thể đi thẳng 3 ô — chess.js từ chối.
      accepted = drop({ sourceSquare: "e2", targetSquare: "e5" });
    });

    expect(accepted).toBe(false);
    expect(mocks.position).toBe(before);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Nước đi không hợp lệ/i,
    );
  });

  it("nước hợp lệ → onPieceDrop trả true, FEN cập nhật, lượt chuyển sang Đen", async () => {
    const user = userEvent.setup();
    render(<Playground />);
    const drop = mocks.onPieceDrop;
    if (!drop) throw new Error("Chessboard mock chưa bắt được onPieceDrop");

    let accepted: boolean | undefined;
    act(() => {
      accepted = drop({ sourceSquare: "e2", targetSquare: "e4" });
    });

    expect(accepted).toBe(true);
    expect(mocks.position).toContain("4P3");
    expect(await screen.findByText("Đen")).toBeInTheDocument();

    // Lưu thế cờ đi qua server action mock — kiểm wiring.
    await user.click(screen.getByRole("button", { name: /Lưu thế cờ/ }));
    await vi.waitFor(() =>
      expect(mocks.savePositionAction).toHaveBeenCalledWith(
        mocks.position,
        undefined,
      ),
    );
  });
});
