import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTrainerService } from "@/lib/trainer-service";
import type { TrainerService } from "@/lib/trainer-service";

const validCsvPath = fileURLToPath(
  new URL("./fixtures/puzzles-valid.csv", import.meta.url),
);

describe("TrainerService — Puzzle attempts", () => {
  let dir: string;
  let dbPath: string;
  let service: TrainerService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chess-puzzle-attempts-"));
    dbPath = join(dir, "chess.db");
    service = createTrainerService(dbPath);
  });

  afterEach(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("recordAttempt lưu attempt (solved) và trả về row đầy đủ", async () => {
    await service.importPuzzlesFromCsv(validCsvPath);

    const attempt = service.recordAttempt("00sHx", true);

    expect(attempt).toMatchObject({ puzzleId: "00sHx", solved: true });
    expect(attempt.id).toBeTypeOf("number");
    expect(attempt.attemptedAt).toBeTypeOf("string");
  });

  it("recordAttempt từ chối puzzle không tồn tại", async () => {
    await service.importPuzzlesFromCsv(validCsvPath);

    expect(() => service.recordAttempt("khong-ton-tai", true)).toThrowError(
      /không tồn tại/,
    );
  });

  it("attempt còn nguyên sau khi mở lại service (restart app)", async () => {
    await service.importPuzzlesFromCsv(validCsvPath);
    service.recordAttempt("00sHx", true);
    service.close();

    const reopened = createTrainerService(dbPath);
    try {
      expect(reopened.getThemeStats()).toEqual([
        { theme: "mate", solved: 1, attempted: 1 },
        { theme: "mateIn2", solved: 1, attempted: 1 },
        { theme: "middlegame", solved: 1, attempted: 1 },
        { theme: "short", solved: 1, attempted: 1 },
      ]);
    } finally {
      reopened.close();
    }
  });

  it("getThemeStats: DB mới → rỗng", () => {
    expect(service.getThemeStats()).toEqual([]);
  });

  it("getThemeStats: cộng đúng solved/attempted qua nhiều attempt, sắp theo attempted giảm dần", async () => {
    await service.importPuzzlesFromCsv(validCsvPath);

    // 00sHx: mate mateIn2 middlegame short — 2 attempt (1 solved)
    service.recordAttempt("00sHx", true);
    service.recordAttempt("00sHx", false);
    // 00sJ9: crushing endgame middlegame — 1 attempt (fail)
    service.recordAttempt("00sJ9", false);
    // 00sJw: advancedPawn middlegame — 1 attempt (solved)
    service.recordAttempt("00sJw", true);

    expect(service.getThemeStats()).toEqual([
      { theme: "middlegame", solved: 2, attempted: 4 },
      { theme: "mate", solved: 1, attempted: 2 },
      { theme: "mateIn2", solved: 1, attempted: 2 },
      { theme: "short", solved: 1, attempted: 2 },
      { theme: "advancedPawn", solved: 1, attempted: 1 },
      { theme: "crushing", solved: 0, attempted: 1 },
      { theme: "endgame", solved: 0, attempted: 1 },
    ]);
  });

  it("getRandomBatch: đúng n, không trùng, tôn trọng filter theme + rating", async () => {
    await service.importPuzzlesFromCsv(validCsvPath);

    // Filter chặt: pool chỉ còn 00sHx (middlegame, 1760)
    const tight = service.getRandomBatch(
      { theme: "middlegame", ratingMin: 1700, ratingMax: 2000 },
      5,
    );
    expect(tight.map((p) => p.puzzleId)).toEqual(["00sHx"]);

    // n=2 không filter → 2 puzzle phân biệt, thuộc pool 4
    const two = service.getRandomBatch({}, 2);
    expect(two).toHaveLength(2);
    expect(new Set(two.map((p) => p.puzzleId)).size).toBe(2);
    for (const puzzle of two) {
      expect(["00sHx", "00sJ9", "00sJw", "00087"]).toContain(puzzle.puzzleId);
    }

    // n lớn hơn pool → trả về cả pool
    const all = service.getRandomBatch({ ratingMax: 3000 }, 10);
    expect(all).toHaveLength(4);

    // Filter không khớp gì → rỗng
    expect(service.getRandomBatch({ theme: "khong-co-theme" }, 3)).toEqual([]);
  });
});
