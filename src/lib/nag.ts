/**
 * Bảng NAG (Numeric Annotation Glyph) chuẩn PGN: $1 "!", $2 "?", $3 "!!",
 * $4 "?!", $5 "!?", $6 "±" (Trắng tốt hơn rõ). NAG ngoài bảng hiển thị dạng
 * `$n` nguyên văn — xem nagLabel.
 */
export const NAG_SYMBOLS: Record<number, string> = {
  1: "!",
  2: "?",
  3: "!!",
  4: "?!",
  5: "!?",
  6: "±",
};

/** Ghép ký hiệu NAG của một nước; ngoài bảng thì giữ nguyên dạng $n. */
export function nagLabel(nags: number[]): string {
  return nags.map((nag) => NAG_SYMBOLS[nag] ?? `$${nag}`).join("");
}
