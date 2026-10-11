import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { gameResultFromChess } from "@/lib/play/game-result";
import { buildGamePgn } from "@/lib/play/game-pgn";

/** Thế chiếu hết điển hình: sau 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6? thì Trắng có Qxf7#. */
function scholarMatePosition(): Chess {
  const chess = new Chess();
  for (const san of ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"]) {
    chess.move(san);
  }
  chess.move("Qxf7#");
  return chess;
}

describe("gameResultFromChess", () => {
  it("chiếu hết: user Trắng thắng → 1-0", () => {
    const chess = scholarMatePosition();
    expect(chess.isCheckmate()).toBe(true);
    expect(gameResultFromChess(chess, "w")).toBe("1-0");
  });

  it("chiếu hết: user Đen bị mate → 0-1", () => {
    const chess = scholarMatePosition();
    expect(gameResultFromChess(chess, "b")).toBe("0-1");
  });

  it("hết nước (stalemate) → hòa 1/2-1/2", () => {
    const chess = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(chess.isGameOver()).toBe(true);
    expect(chess.isCheckmate()).toBe(false);
    expect(gameResultFromChess(chess, "w")).toBe("1/2-1/2");
  });

  it("thiếu quân chất (chỉ còn 2 vua) → hòa 1/2-1/2", () => {
    const chess = new Chess("8/8/8/4k3/8/8/8/4K3 w - - 0 1");
    expect(chess.isGameOver()).toBe(true);
    expect(gameResultFromChess(chess, "b")).toBe("1/2-1/2");
  });

  it("đầu hàng: user Trắng → 0-1 dù ván chưa hết", () => {
    const chess = new Chess();
    expect(gameResultFromChess(chess, "w", { resigned: true })).toBe("0-1");
  });

  it("đầu hàng: user Đen → 1-0", () => {
    const chess = new Chess();
    expect(gameResultFromChess(chess, "b", { resigned: true })).toBe("1-0");
  });

  it("đầu hàng có thắng thế vẫn thua", () => {
    // User Trắng hơn cả quân nhưng vẫn bấm đầu hàng → 0-1.
    const chess = new Chess("8/8/8/4k3/8/8/4Q3/4K3 w - - 0 1");
    expect(chess.isGameOver()).toBe(false);
    expect(gameResultFromChess(chess, "w", { resigned: true })).toBe("0-1");
  });

  it("ván chưa kết thúc và chưa ai đầu hàng → *", () => {
    const chess = new Chess();
    expect(gameResultFromChess(chess, "w")).toBe("*");
  });
});

describe("buildGamePgn", () => {
  it("đủ headers theo spec + chuỗi nước SAN", () => {
    const chess = new Chess();
    chess.move("e4");
    chess.move("e5");
    const pgn = buildGamePgn(chess, {
      userColor: "w",
      engineStrength: 4,
      result: "*",
      date: new Date(2026, 9, 11, 10, 0, 0),
    });

    expect(pgn).toContain('[Event "Chess Trainer"]');
    expect(pgn).toContain('[Date "2026.10.11"]');
    expect(pgn).toContain('[White "Bạn"]');
    expect(pgn).toContain('[Black "Stockfish (cấp 4)"]');
    expect(pgn).toContain('[Result "*"]');
    expect(pgn).toContain("1. e4 e5");
  });

  it("user cầm Đen: Stockfish ở bên Trắng", () => {
    const chess = new Chess();
    chess.move("e4");
    const pgn = buildGamePgn(chess, {
      userColor: "b",
      engineStrength: 2,
      result: "1-0",
      date: new Date(2026, 0, 2),
    });

    expect(pgn).toContain('[White "Stockfish (cấp 2)"]');
    expect(pgn).toContain('[Black "Bạn"]');
    expect(pgn).toContain('[Result "1-0"]');
  });
});
