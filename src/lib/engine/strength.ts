/**
 * Ánh xạ độ mạnh UI (1..8) → UCI "Skill Level" (0..20) của Stockfish.
 *
 * Thang đều (linear, làm tròn gần nhất): skill = round((strength - 1) * 20 / 7)
 *   1 → 0   2 → 3   3 → 6   4 → 9   5 → 11   6 → 14   7 → 17   8 → 20
 *
 * Đây là tùy chọn "Skill Level" gốc của Stockfish (giới hạn độ sâu/cảm
 * nhận nước đi, không dùng UCI_LimitStrength/UCI_Elo).
 */
export const MIN_ENGINE_STRENGTH = 1;
export const MAX_ENGINE_STRENGTH = 8;
/** Độ mạnh mặc định của panel/app: mạnh nhất (Skill Level 20). */
export const DEFAULT_ENGINE_STRENGTH: EngineStrength = MAX_ENGINE_STRENGTH;
const MIN_UCI_SKILL_LEVEL = 0;
const MAX_UCI_SKILL_LEVEL = 20;

export type EngineStrength = number;

export function skillLevelForStrength(strength: EngineStrength): number {
  if (
    !Number.isInteger(strength) ||
    strength < MIN_ENGINE_STRENGTH ||
    strength > MAX_ENGINE_STRENGTH
  ) {
    throw new RangeError(
      `Độ mạnh engine phải là số nguyên ${MIN_ENGINE_STRENGTH}..${MAX_ENGINE_STRENGTH}, nhận: ${strength}`,
    );
  }
  const span = MAX_UCI_SKILL_LEVEL - MIN_UCI_SKILL_LEVEL;
  const steps = MAX_ENGINE_STRENGTH - MIN_ENGINE_STRENGTH;
  return Math.round(((strength - MIN_ENGINE_STRENGTH) * span) / steps);
}
