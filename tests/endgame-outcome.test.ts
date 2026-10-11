import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  DEFAULT_MAX_ENDGAME_MOVES,
  endgameOutcome,
} from "@/lib/endgame/outcome";

describe("endgameOutcome — phán định kết quả drill tàn cuộc", () => {
  it("hằng số mặc định max_moves là 50", () => {
    expect(DEFAULT_MAX_ENDGAME_MOVES).toBe(50);
  });

  const cases: {
    name: string;
    goal: "win" | "draw";
    userColor: "w" | "b";
    build: () => Chess;
    moveCount: number;
    maxMoves?: number;
    expectStatus: "ongoing" | "pass" | "fail";
  }[] = [
    {
      name: "goal win: user chiếu hết (Qg7#) → pass",
      goal: "win",
      userColor: "w",
      build: () => {
        const chess = new Chess("7k/8/5K2/8/8/8/8/6Q1 w - - 0 1");
        chess.move("Qg7");
        return chess;
      },
      moveCount: 1,
      expectStatus: "pass",
    },
    {
      name: "goal win: thắng bằng phong hậu + chiếu hết (c8=Q#) → pass",
      goal: "win",
      userColor: "w",
      build: () => {
        const chess = new Chess("k7/2P5/1K6/8/8/8/8/8 w - - 0 1");
        chess.move({ from: "c7", to: "c8", promotion: "q" });
        return chess;
      },
      moveCount: 1,
      expectStatus: "pass",
    },
    {
      name: "goal win: user bị chiếu hết (Rc1# mặt sau) → fail",
      goal: "win",
      userColor: "w",
      build: () => {
        const chess = new Chess("2r3k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1");
        chess.move("Rc1");
        return chess;
      },
      moveCount: 1,
      expectStatus: "fail",
    },
    {
      name: "goal win: hết nước mà chỉ hòa (hết vật chất) → fail",
      goal: "win",
      userColor: "w",
      build: () => new Chess("8/8/8/8/8/8/8/K6k w - - 0 1"),
      moveCount: 10,
      expectStatus: "fail",
    },
    {
      name: "goal win: chưa hết nước, thế chưa kết thúc → ongoing",
      goal: "win",
      userColor: "w",
      build: () => new Chess("7k/8/5K2/8/8/8/8/6Q1 w - - 0 1"),
      moveCount: 3,
      expectStatus: "ongoing",
    },
    {
      name: "goal win: đúng giới hạn max_moves mà chưa chiếu hết → fail",
      goal: "win",
      userColor: "w",
      build: () => new Chess("7k/8/5K2/8/8/8/8/6Q1 w - - 0 1"),
      moveCount: 50,
      expectStatus: "fail",
    },
    {
      name: "goal win: max_moves tùy chỉnh nhỏ hơn → fail sớm",
      goal: "win",
      userColor: "w",
      build: () => new Chess("7k/8/5K2/8/8/8/8/6Q1 w - - 0 1"),
      moveCount: 10,
      maxMoves: 10,
      expectStatus: "fail",
    },
    {
      name: "goal draw: hết nước nhưng user sống sót (chưa bị chiếu hết) → pass",
      goal: "draw",
      userColor: "w",
      build: () => new Chess("8/8/8/8/4pk2/R7/7r/4K3 w - - 0 1"),
      moveCount: 50,
      expectStatus: "pass",
    },
    {
      name: "goal draw: hết vật chất (K vs K) → pass",
      goal: "draw",
      userColor: "w",
      build: () => new Chess("8/8/8/8/8/8/8/K6k w - - 0 1"),
      moveCount: 5,
      expectStatus: "pass",
    },
    {
      name: "goal draw: hết cờ (stalemate) → pass",
      goal: "draw",
      userColor: "w",
      build: () => new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"),
      moveCount: 7,
      expectStatus: "pass",
    },
    {
      name: "goal draw: luật 50 nước (halfmove 100) → pass",
      goal: "draw",
      userColor: "w",
      build: () => new Chess("7k/8/8/8/8/8/8/6QK w - - 100 100"),
      moveCount: 20,
      expectStatus: "pass",
    },
    {
      name: "goal draw: user bị chiếu hết → fail",
      goal: "draw",
      userColor: "w",
      build: () => {
        const chess = new Chess("2r3k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1");
        chess.move("Rc1");
        return chess;
      },
      moveCount: 30,
      expectStatus: "fail",
    },
    {
      name: "goal draw: giữa chừng, chưa hòa chưa hết nước → ongoing",
      goal: "draw",
      userColor: "w",
      build: () => new Chess("8/8/8/8/4pk2/R7/7r/4K3 w - - 0 1"),
      moveCount: 12,
      expectStatus: "ongoing",
    },
    {
      name: "goal draw: user cầm Đen và hòa bằng hết cờ → pass",
      goal: "draw",
      userColor: "b",
      build: () => new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"),
      moveCount: 9,
      expectStatus: "pass",
    },
  ];

  it.each(cases)("$name", ({ goal, userColor, build, moveCount, maxMoves, expectStatus }) => {
    const chess = build();
    const outcome = endgameOutcome(goal, chess, moveCount, userColor, maxMoves);

    expect(outcome.status).toBe(expectStatus);
    // Banner UI dùng trực tiếp reason — phải luôn có lời giải thích tiếng Việt.
    expect(outcome.reason.length).toBeGreaterThan(0);
  });
});
