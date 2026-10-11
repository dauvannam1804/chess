import type { Chess } from "chess.js";

export type EndgameGoal = "win" | "draw";
export type EndgameUserColor = "w" | "b";
export type EndgameSource = "catalog" | "import";

/** Số nước tối đa mặc định của một drill tàn cuộc (nước của người dùng). */
export const DEFAULT_MAX_ENDGAME_MOVES = 50;

export type EndgameOutcomeStatus = "ongoing" | "pass" | "fail";

export type EndgameOutcome = {
  /** ongoing = đánh tiếp; pass = đạt mục tiêu; fail = trượt mục tiêu. */
  status: EndgameOutcomeStatus;
  /** Lời giải thích tiếng Việt — hiển thị thẳng lên banner kết thúc. */
  reason: string;
};

/**
 * Phán định kết quả một drill tàn cuộc (thuần, không DB/IO).
 *
 * Ngữ nghĩa `moveCount`: số nước NGƯỜI DÙNG đã đi trong phiên (nước phản
 * hồi của engine không tính). `maxMoves` so với `moveCount`:
 * - goal "win": phải chiếu hết đối phương (sau khi phong hậu hoặc không)
 *   trong `maxMoves` nước; hết hạn / hòa / bị chiếu hết đều là fail.
 * - goal "draw": đạt nếu hòa (stalemate, hết vật chất, luật 50 nước,
 *   lặp 3 lần) HOẶC sống sót qua `maxMoves` nước mà không bị chiếu hết;
 *   chỉ fail khi bị chiếu hết. Chiếu hết ngược đối phương cũng là pass.
 */
export function endgameOutcome(
  goal: EndgameGoal,
  chess: Chess,
  moveCount: number,
  userColor: EndgameUserColor,
  maxMoves: number = DEFAULT_MAX_ENDGAME_MOVES,
): EndgameOutcome {
  if (chess.isCheckmate()) {
    const userMated = chess.turn() === userColor;
    if (userMated) {
      return { status: "fail", reason: "Bạn đã bị chiếu hết — trượt mục tiêu." };
    }
    return {
      status: "pass",
      reason: "Chiếu hết! Bạn đã hoàn thành mục tiêu của thế này.",
    };
  }

  if (chess.isDraw() || chess.isInsufficientMaterial()) {
    if (goal === "draw") {
      return { status: "pass", reason: "Hòa — đúng mục tiêu phòng ngự của thế này." };
    }
    return {
      status: "fail",
      reason: "Thế cờ đã hòa trong khi mục tiêu là chiếu hết — trượt mục tiêu.",
    };
  }

  if (moveCount >= maxMoves) {
    if (goal === "draw") {
      return {
        status: "pass",
        reason: `Bạn đã đứng vững sau ${maxMoves} nước — hoàn thành mục tiêu hòa!`,
      };
    }
    return {
      status: "fail",
      reason: `Hết ${maxMoves} nước mà chưa chiếu hết — trượt mục tiêu.`,
    };
  }

  return { status: "ongoing", reason: "Thế cờ chưa kết thúc — đánh tiếp." };
}
