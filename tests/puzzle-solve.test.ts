import { describe, expect, it } from "vitest";
import {
  applyPlayerMove,
  isSolved,
  loadPuzzle,
  playNextSolutionMove,
  playerSideOf,
  remainingSolution,
  type PuzzleSolveState,
} from "@/lib/puzzle-solve";

// Fixture puzzle 00sHx (tests/fixtures/puzzles-valid.csv):
// FEN trước nước setup; moves[0] là nước setup của đối phương.
const FEN = "q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17";
const MOVES = ["e8d7", "a2e6", "d7d8", "f7f8"];

describe("loadPuzzle", () => {
  it("áp dụng nước setup (moves[0]) và để nước giải còn lại ở pending", () => {
    const state = loadPuzzle(FEN, MOVES);

    expect(state.fen).toBe(
      "q5nr/1ppknQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 w - - 1 18",
    );
    expect(state.pendingUci).toEqual(["a2e6", "d7d8", "f7f8"]);
  });

  it("playerSideOf: sau nước setup, lượt đi thuộc người chơi", () => {
    const state = loadPuzzle(FEN, MOVES);
    // FEN gốc turn 'b' (đối phương) → sau setup, người chơi là trắng
    expect(playerSideOf(FEN)).toBe("b");
    expect(playerSideOf(state.fen)).toBe("w");
  });

  it("né lỗi dữ liệu hỏng: ít hơn 2 nước (setup + giải) → lỗi rõ ràng", () => {
    expect(() => loadPuzzle(FEN, [])).toThrowError(/ít nhất 2 nước/);
    expect(() => loadPuzzle(FEN, ["e8d7"])).toThrowError(/ít nhất 2 nước/);
  });

  it("FEN không hợp lệ → lỗi rõ ràng", () => {
    expect(() => loadPuzzle("khong-phai-fen", ["e2e4", "e7e5"])).toThrowError(
      /FEN/,
    );
  });
});

describe("applyPlayerMove", () => {
  // 00sHx sau setup: trắng đi Be6+ (a2e6), đen trả lời Kd8 (d7d8), trắng Qf8# (f7f8)
  let state: PuzzleSolveState;
  beforeEachState();

  function beforeEachState() {
    state = loadPuzzle(FEN, MOVES);
  }

  it("đúng nước giải → correct + tiến state, pending còn nước phản đòn đối phương", () => {
    const outcome = applyPlayerMove(state, { from: "a2", to: "e6" });

    expect(outcome.kind).toBe("correct");
    if (outcome.kind !== "correct") return;
    expect(outcome.san).toBe("Be6+");
    expect(outcome.state.pendingUci).toEqual(["d7d8", "f7f8"]);
    expect(outcome.state.fen).toBe(
      "q5nr/1ppknQpp/3pB3/1P2p3/4P3/B1PP1b2/6PP/5K2 b - - 2 18",
    );
    expect(isSolved(outcome.state)).toBe(false);
  });

  it("nước hợp lệ nhưng sai chuỗi giải → wrong + message tiếng Việt, state không đổi", () => {
    const outcome = applyPlayerMove(state, { from: "a2", to: "b1" });

    expect(outcome.kind).toBe("wrong");
    if (outcome.kind !== "wrong") return;
    expect(outcome.san).toBe("Bb1");
    expect(outcome.message).toMatch(/Sai nước rồi/);
    expect(outcome.message).toContain("Bb1");
    // state gốc nguyên vẹn (quân cờ snap back)
    expect(state.fen).toBe(
      "q5nr/1ppknQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 w - - 1 18",
    );
    expect(state.pendingUci).toEqual(["a2e6", "d7d8", "f7f8"]);
  });

  it("nước không hợp lệ → illegal + message tiếng Việt, state không đổi", () => {
    const outcome = applyPlayerMove(state, { from: "e4", to: "e6" });

    expect(outcome.kind).toBe("illegal");
    if (outcome.kind !== "illegal") return;
    expect(outcome.message).toMatch(/không hợp lệ/);
    expect(state.pendingUci).toEqual(["a2e6", "d7d8", "f7f8"]);
  });

  it("flow đầy đủ: đúng → đối phương trả lời tự động → đúng nước cuối → solved", () => {
    const first = applyPlayerMove(state, { from: "a2", to: "e6" });
    expect(first.kind).toBe("correct");
    if (first.kind !== "correct") return;

    // UI tự động đi nước phản đòn của đối phương sau delay
    const reply = playNextSolutionMove(first.state);
    expect(reply.san).toBe("Kd8");
    expect(reply.state.fen).toBe(
      "q2k2nr/1pp1nQpp/3pB3/1P2p3/4P3/B1PP1b2/6PP/5K2 w - - 3 19",
    );

    const mate = applyPlayerMove(reply.state, { from: "f7", to: "f8" });
    expect(mate.kind).toBe("correct");
    if (mate.kind !== "correct") return;
    expect(mate.san).toBe("Qf8#");
    expect(isSolved(mate.state)).toBe(true);
    expect(mate.state.fen).toBe(
      "q2k1Qnr/1pp1n1pp/3pB3/1P2p3/4P3/B1PP1b2/6PP/5K2 b - - 4 19",
    );
  });

  it("remainingSolution: liệt kê toàn bộ nước còn lại + FEN sau từng nước", () => {
    const steps = remainingSolution(state);

    expect(steps.map((step) => step.san)).toEqual(["Be6+", "Kd8", "Qf8#"]);
    expect(steps.at(-1)?.fenAfter).toBe(
      "q2k1Qnr/1pp1n1pp/3pB3/1P2p3/4P3/B1PP1b2/6PP/5K2 b - - 4 19",
    );
    // không đổi state
    expect(state.pendingUci).toHaveLength(3);
  });
});
