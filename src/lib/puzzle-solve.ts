import { Chess } from "chess.js";
import { uciToMove } from "./uci-move";

/**
 * Lõi giải Puzzle thuần (không React): nhận FEN + chuỗi nước UCI của một
 * Puzzle Lichess, áp dụng nước setup (moves[0] — nước của ĐỐI PHƯƠNG), rồi
 * cho phép kiểm tra từng nước người chơi so với chuỗi giải còn lại.
 * UI (/puzzle) chỉ là lớp wire lên các hàm này.
 */

export type PuzzleSolveState = {
  /** Thế cờ hiện tại (sau setup + các nước giải đã đi). */
  fen: string;
  /** Chuỗi nước giải chưa đi, UCI, xen kẽ người chơi → đối phương → … */
  pendingUci: string[];
};

export type PlayerMoveInput = {
  from: string;
  to: string;
  promotion?: string;
};

export type PlayerMoveOutcome =
  | { kind: "correct"; san: string; state: PuzzleSolveState }
  | { kind: "illegal"; message: string }
  | { kind: "wrong"; message: string; san: string };

function parseMoves(moves: string[]): string[] {
  const cleaned = moves
    .flatMap((move) => move.trim().split(/\s+/))
    .filter((move) => move.length > 0);
  if (cleaned.length < 2) {
    throw new Error(
      `Puzzle cần ít nhất 2 nước (nước setup của đối phương + nước giải đầu tiên), nhận được: ${moves.length}.`,
    );
  }
  return cleaned;
}

/**
 * Nạp puzzle: áp dụng FEN + nước setup moves[0] (nước của đối phương).
 * Người chơi sẽ giải từ thế cờ sau setup, đi các nước pendingUci[0],
 * pendingUci[2], … (các nước chẵn lẻ xen kẽ người chơi/đối phương).
 */
export function loadPuzzle(fen: string, moves: string[]): PuzzleSolveState {
  const solution = parseMoves(moves);
  const chess = openChess(fen);
  applyUci(chess, solution[0]);
  return { fen: chess.fen(), pendingUci: solution.slice(1) };
}

/** Bên của người chơi: turn của thế cờ đang hiển thị. */
export function playerSideOf(fen: string): "w" | "b" {
  const turn = openChess(fen).turn();
  return turn;
}

export function isSolved(state: PuzzleSolveState): boolean {
  return state.pendingUci.length === 0;
}

/** Kiểm tra nước người chơi: đúng chuỗi giải thì advancing state, sai thì giữ nguyên. */
export function applyPlayerMove(
  state: PuzzleSolveState,
  input: PlayerMoveInput,
): PlayerMoveOutcome {
  const chess = openChess(state.fen);
  let move;
  try {
    move = chess.move({
      from: input.from,
      to: input.to,
      promotion: input.promotion ?? "q",
    });
  } catch {
    return {
      kind: "illegal",
      message:
        "Nước đi không hợp lệ — bàn cờ từ chối nước này, quân cờ trở về chỗ cũ.",
    };
  }
  const playedUci = `${move.from}${move.to}${move.promotion ?? ""}`;
  if (playedUci !== state.pendingUci[0]) {
    return {
      kind: "wrong",
      san: move.san,
      message: `Sai nước rồi! “${move.san}” không phải nước giải — quân cờ trở về chỗ cũ, thử lại nhé.`,
    };
  }
  return {
    kind: "correct",
    san: move.san,
    state: { fen: chess.fen(), pendingUci: state.pendingUci.slice(1) },
  };
}

/**
 * Đi tiếp 1 nước giải (thường là nước phản đòn của đối phương sau khi người
 * chơi đi đúng) và trả về state mới. Ném lỗi nếu đã hết nước.
 */
export function playNextSolutionMove(
  state: PuzzleSolveState,
): { san: string; state: PuzzleSolveState } {
  if (state.pendingUci.length === 0) {
    throw new Error("Puzzle đã giải xong — không còn nước giải nào để đi.");
  }
  const chess = openChess(state.fen);
  const move = applyUci(chess, state.pendingUci[0]);
  return {
    san: move.san,
    state: { fen: chess.fen(), pendingUci: state.pendingUci.slice(1) },
  };
}

/** Lời giải còn lại: chuỗi {san, fenAfter} từ state hiện tại (không đổi state). */
export function remainingSolution(state: PuzzleSolveState): {
  san: string;
  fenAfter: string;
}[] {
  const chess = openChess(state.fen);
  const steps: { san: string; fenAfter: string }[] = [];
  for (const uci of state.pendingUci) {
    const move = applyUci(chess, uci);
    steps.push({ san: move.san, fenAfter: chess.fen() });
  }
  return steps;
}

function openChess(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch (cause) {
    throw new Error(`FEN không hợp lệ: ${fen}`, { cause });
  }
}

function applyUci(chess: Chess, uci: string) {
  return chess.move(uciToMove(uci));
}
