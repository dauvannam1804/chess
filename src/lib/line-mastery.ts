/**
 * Mức thuộc của một Dòng khai cuộc (US-21) suy từ node con: line "Thuộc"
 * khi TOÀN BỘ node user-move của nó đã Mastered (xem `isLineMastered`).
 * Module thuần (không DB) — client component import trực tiếp được.
 */
export type LineMastery = {
  lineId: number;
  /** Tổng số node user-move trong line. */
  userMoveCount: number;
  /** Số node user-move đã Mastered. */
  masteredCount: number;
};

/** Line "Thuộc": có ít nhất một node user-move và tất cả đã Mastered. */
export function isLineMastered(mastery: LineMastery): boolean {
  return (
    mastery.userMoveCount > 0 && mastery.masteredCount === mastery.userMoveCount
  );
}
