/**
 * Tách chuỗi nước UCI ("e2e4", "e7e8q") thành tham số `move` của chess.js —
 * một nguồn duy nhất cho mọi chỗ bóc UCI (puzzle, engine, replay, line tree).
 */
export function uciToMove(uci: string): {
  from: string;
  to: string;
  promotion?: string;
} {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
  };
}
