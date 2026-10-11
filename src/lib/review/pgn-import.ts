import { GAME_RESULTS, type GameResult } from "../play/game-result";
import { pgnStartFen, replayGame } from "./replay-game";
import { Chess } from "chess.js";

/**
 * Ván import bằng PGN không có thông tin "độ mạnh engine" — lưu mức thấp
 * nhất để đạt ràng buộc `engine_strength` của bảng `games` (1..8, xem
 * `saveGame`). UI coi đây là ván import, không phải ván chơi với engine.
 */
export const IMPORT_ENGINE_STRENGTH = 1;

/** Dữ liệu đủ để tạo một Game import qua `saveGame`. */
export type ParsedImportGame = {
  /** PGN gốc, lưu nguyên văn. */
  pgn: string;
  /** Từ header `Result` nếu là giá trị hợp lệ, không thì "*". */
  result: GameResult;
  /** Thế cờ sau nước cuối (thế xuất phát nếu PGN chưa có nước nào). */
  finalFen: string;
};

/**
 * Phân tích PGN dán từ Lichess/chess.com thành dữ liệu Game (US-29).
 * Ném lỗi thân thiện nếu PGN rác (qua `replayGame`).
 */
export function parseImportedGame(pgn: string): ParsedImportGame {
  if (pgn.trim().length === 0) {
    throw new Error("PGN không hợp lệ — không phân tích được chuỗi PGN này.");
  }
  replayGame(pgn);
  const chess = new Chess(pgnStartFen(pgn));
  chess.loadPgn(pgn);
  return {
    pgn,
    result: parseHeaderResult(pgn),
    finalFen: chess.fen(),
  };
}

function parseHeaderResult(pgn: string): GameResult {
  const raw = /\[Result "([^"]*)"\]/.exec(pgn)?.[1] ?? "";
  return (GAME_RESULTS as readonly string[]).includes(raw)
    ? (raw as GameResult)
    : "*";
}
