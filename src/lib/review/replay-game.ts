import { Chess } from "chess.js";
import { STANDARD_START_FEN } from "../chess-constants";

/** Một bước trong ván: thế cờ TRƯỚC nước `san` (ply 0-based từ đầu ván). */
export type ReplayStep = {
  ply: number;
  san: string;
  fenBefore: string;
};

/**
 * Replay một PGN thành chuỗi các thế cờ TRƯỚC mỗi nước, đúng thứ tự ply.
 * Chỉ chạy mainline (biến án PGN bỏ qua — Game Review duyệt ván chính).
 * Ném lỗi thân thiện nếu PGN không phân tích được (chess.js 1.x `move`
 * quăng exception khi nước bất hợp lệ — `loadPgn` đã chặn trước đó).
 */
export function replayGame(pgn: string): ReplayStep[] {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch (cause) {
    throw new Error("PGN không hợp lệ — không phân tích được chuỗi PGN này.", {
      cause,
    });
  }
  const replay = new Chess(pgnStartFen(pgn));
  return chess.history().map((san, ply) => {
    const fenBefore = replay.fen();
    replay.move(san);
    return { ply, san, fenBefore };
  });
}

/** FEN xuất phát của một PGN: header `FEN` (kèm `SetUp`) hoặc thế chuẩn. */
export function pgnStartFen(pgn: string): string {
  const match = /\[FEN "([^"]+)"\]/.exec(pgn);
  if (!match) return STANDARD_START_FEN;
  try {
    new Chess(match[1]);
    return match[1];
  } catch {
    return STANDARD_START_FEN;
  }
}
