/**
 * Đánh dấu nước lỗi/blunder cho Game Review (TT-09) — helper THUẦN, không
 * đụng DB/Engine để unit test bảng được.
 *
 * ## Quy ước POV (point of view)
 *
 * Engine trả eval **góc nhìn Trắng** (`evalCp` dương = Trắng hơn; `mate` dương
 * = Trắng mate — xem hợp đồng `Engine` ở TT-06). Để so sánh một nước, ta phải
 * xét độ suy giảm **theo góc nhìn BÊN ĐI nước đó (mover)**:
 *
 * - Mover tại ply `p` (0-based, ván khởi đầu Trắng đi): `p` chẵn → Trắng,
 *   `p` lẻ → Đen.
 * - Chuyển White-POV → mover-POV: **đảo dấu khi mover là Đen** — tức là toàn
 *   bộ nước của người dùng khi `userColor = 'b'` đều bị negate trước khi so.
 * - Điểm mate quy về thang centipawn: mate trong N (cho bên đang thắng) =
 *   `MATE_SCORE_CP - N` — mate nhanh hơn tốt hơn, và mọi điểm mate (≈10.000)
 *   đều trội hơn mọi điểm cp thường → **swing mate** (mất thế mate, hoặc từ
 *   thế thường rơi vào bị mate) tự nhiên vượt ngưỡng và bị flag.
 *
 * ## Ngưỡng (trên độ suy giảm mover-POV `evalBefore − evalAfter`)
 *
 * - `< 100cp`: nước bình thường, không flag.
 * - `≥ 100cp và < 300cp`: `mistake` (lỗi).
 * - `≥ 300cp`: `blunder` (lỗi nghiêm trọng).
 *
 * Cả hai bên đều được so sánh (nước lỗi của đối phương cũng đáng xem lại);
 * `userColor` dùng để xác thực màu người dùng, còn POV từng ply luôn là POV
 * bên đi. Nước CUỐI không có eval sau nên không thể flag (mảng `evals` là
 * eval của các thế TRƯỚC mỗi nước — xem `replayGame`).
 */

export const MISTAKE_THRESHOLD_CP = 100;
export const BLUNDER_THRESHOLD_CP = 300;

/** Điểm quy đổi cho thế có mate; mate trong N → MATE_SCORE_CP − N. */
export const MATE_SCORE_CP = 10_000;

export type FlagSeverity = "mistake" | "blunder";

export type MoveFlag = {
  /** Ply 0-based của thế TRƯỚC nước bị flag. */
  ply: number;
  severity: FlagSeverity;
  /** Eval trước nước, centipawn theo POV bên đi (đã negate nếu Đen đi). */
  evalBefore: number;
  /** Eval sau nước, cùng quy ước POV với `evalBefore`. */
  evalAfter: number;
};

export type EvalScore = { evalCp: number | null; mate: number | null };

/** Quy một eval White-POV về điểm centipawn theo POV `sign` (+1 Trắng, −1 Đen). */
function moverPovScoreCp(evalScore: EvalScore, sign: 1 | -1): number {
  let whitePov: number;
  if (evalScore.mate !== null) {
    // Dấu của mate cho biết BÊN NÀO đang mate (khác màu mover) — kích thước
    // theo |mate|, rồi mới chuyển sang POV của mover.
    whitePov = Math.sign(evalScore.mate) * (MATE_SCORE_CP - Math.abs(evalScore.mate));
  } else {
    whitePov = evalScore.evalCp ?? 0;
  }
  return normalizeZero(sign * whitePov);
}

/**
 * Eval White-POV thành chuỗi hiển thị: pawns với dấu (`+` Trắng hơn, `-` Đen
 * hơn); mate → "Mate trong N (Trắng|Đen)"; không có dữ liệu → "—".
 */
export function formatEval(evalScore: EvalScore): string {
  if (evalScore.mate !== null) {
    return evalScore.mate > 0
      ? `Mate trong ${evalScore.mate} (Trắng)`
      : `Mate trong ${-evalScore.mate} (Đen)`;
  }
  if (evalScore.evalCp !== null) {
    const pawns = (evalScore.evalCp / 100).toFixed(2);
    return `${evalScore.evalCp >= 0 ? "+" : "-"}${Math.abs(Number(pawns)).toFixed(2)}`;
  }
  return "—";
}

/** −0 hiển thị/so sánh phiền — quy về +0. */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * Đánh dấu nước lỗi/blunder từ chuỗi eval các thế TRƯỚC mỗi nước (White-POV,
 * đánh chỉ số theo ply). Xem phần đầu file cho quy ước POV + ngưỡng.
 */
export function flagMistakes(
  evals: EvalScore[],
  userColor: string,
): MoveFlag[] {
  if (userColor !== "w" && userColor !== "b") {
    throw new Error(
      `Màu quân của bạn không hợp lệ: "${userColor}" — phải là 'w' | 'b'.`,
    );
  }
  const flags: MoveFlag[] = [];
  // Nước tại ply p cần evalAfter = evals[p + 1] → duyệt đến p = length - 2.
  for (let ply = 0; ply + 1 < evals.length; ply += 1) {
    const moverIsWhite = ply % 2 === 0;
    const sign: 1 | -1 = moverIsWhite ? 1 : -1;
    const evalBefore = moverPovScoreCp(evals[ply], sign);
    const evalAfter = moverPovScoreCp(evals[ply + 1], sign);
    const drop = evalBefore - evalAfter;
    if (drop < MISTAKE_THRESHOLD_CP) continue;
    flags.push({
      ply,
      severity: drop >= BLUNDER_THRESHOLD_CP ? "blunder" : "mistake",
      evalBefore,
      evalAfter,
    });
  }
  return flags;
}
