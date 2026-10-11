/**
 * Kết quả ván dưới dạng chuỗi Result của PGN, suy ra từ trạng thái chess.js.
 *
 * Thứ tự xét:
 * 1. `resigned` — user đầu hàng là thua ngay (dù thế cờ chưa hết).
 * 2. `isCheckmate` — bên đến lượt là bên bị chiếu hết: user thua nếu đến lượt
 *    user, thắng nếu đến lượt engine.
 * 3. ván đã kết thúc mà không phải mate (hết nước, thiếu quân chất, lặp 3
 *    lần...) → hòa.
 * 4. còn lại: ván đang đi → "*".
 */
export function gameResultFromChess(
  game: {
    isGameOver(): boolean;
    isCheckmate(): boolean;
    isDraw(): boolean;
    turn(): "w" | "b";
  },
  userColor: "w" | "b",
  options: { resigned?: boolean } = {},
): GameResult {
  if (options.resigned) {
    return userColor === "w" ? "0-1" : "1-0";
  }
  if (game.isCheckmate()) {
    return game.turn() === userColor ? "0-1" : "1-0";
  }
  if (game.isGameOver() && game.isDraw()) {
    return "1/2-1/2";
  }
  return "*";
}

export const GAME_RESULTS = ["1-0", "0-1", "1/2-1/2", "*"] as const;

export type GameResult = (typeof GAME_RESULTS)[number];
