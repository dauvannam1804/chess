import { describe, expect, it } from "vitest";
import { MIN_ENGINE_STRENGTH, MAX_ENGINE_STRENGTH, skillLevelForStrength } from "@/lib/engine/strength";

describe("skillLevelForStrength", () => {
  it("maps strength 1 (weakest) onto UCI Skill Level 0", () => {
    expect(skillLevelForStrength(1)).toBe(0);
  });

  it("maps strength 8 (strongest) onto UCI Skill Level 20", () => {
    expect(skillLevelForStrength(8)).toBe(20);
  });

  it("maps intermediate strengths monotonically between 0 and 20", () => {
    const levels = [2, 3, 4, 5, 6, 7].map(skillLevelForStrength);
    for (const skillLevel of levels) {
      expect(skillLevel).toBeGreaterThan(0);
      expect(skillLevel).toBeLessThan(20);
    }
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    }
  });

  it("is an evenly spaced ladder (rounded linear scale)", () => {
    expect(skillLevelForStrength(2)).toBe(3);
    expect(skillLevelForStrength(4)).toBe(9);
    expect(skillLevelForStrength(6)).toBe(14);
  });

  it("rejects strengths outside 1..8", () => {
    expect(() => skillLevelForStrength(0)).toThrow(RangeError);
    expect(() => skillLevelForStrength(9)).toThrow(RangeError);
  });

  it("exposes the supported range for the UI selector", () => {
    expect(MIN_ENGINE_STRENGTH).toBe(1);
    expect(MAX_ENGINE_STRENGTH).toBe(8);
  });
});
