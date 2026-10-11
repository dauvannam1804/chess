import type { Chess } from "chess.js";
import type { GameResult } from "./game-result";

/**
 * Dựng text PGN đầy đủ cho một Game đã chơi xong, theo spec:
 * headers Event "Chess Trainer", Date (dạng PGN yyyy.mm.dd), White/Black
 * mang tên "Bạn" / "Stockfish (cấp N)", Result. Chuỗi nước lấy từ `chess`.
 */
export function buildGamePgn(
  chess: Chess,
  {
    userColor,
    engineStrength,
    result,
    date = new Date(),
  }: {
    userColor: "w" | "b";
    engineStrength: number;
    result: GameResult;
    date?: Date;
  },
): string {
  const userName = "Bạn";
  const engineName = `Stockfish (cấp ${engineStrength})`;
  chess.setHeader("Event", "Chess Trainer");
  chess.setHeader("Date", pgnDate(date));
  chess.setHeader("White", userColor === "w" ? userName : engineName);
  chess.setHeader("Black", userColor === "b" ? userName : engineName);
  chess.setHeader("Result", result);
  return chess.pgn();
}

/** Ngày sang định dạng header PGN: "2026.10.11". */
function pgnDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}
