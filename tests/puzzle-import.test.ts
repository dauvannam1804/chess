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

const malformedCsvPath = fileURLToPath(
  new URL("./fixtures/puzzles-malformed.csv", import.meta.url),
);
const badNumberCsvPath = fileURLToPath(
  new URL("./fixtures/puzzles-bad-number.csv", import.meta.url),
);

describe("importPuzzlesFromCsv", () => {
  let dir: string;
  let dbPath: string;
  let service: TrainerService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chess-puzzle-import-"));
    dbPath = join(dir, "chess.db");
    service = createTrainerService(dbPath);
  });

  afterEach(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("import fixture 10 + 11 cột rồi đếm đúng số puzzle theo theme", async () => {
    const processed = await service.importPuzzlesFromCsv(validCsvPath);

    expect(processed).toBe(4);
    expect(service.countByTheme()).toEqual([
      { theme: "middlegame", count: 3 },
      { theme: "advancedPawn", count: 1 },
      { theme: "crushing", count: 1 },
      { theme: "endgame", count: 1 },
      { theme: "mate", count: 1 },
      { theme: "mateIn2", count: 1 },
      { theme: "short", count: 1 },
    ]);
  });

  it("import lại cùng fixture không tạo row trùng (idempotent)", async () => {
    await service.importPuzzlesFromCsv(validCsvPath);
    const processedSecond = await service.importPuzzlesFromCsv(validCsvPath);

    expect(processedSecond).toBe(4);
    const { total } = service.listPuzzles();
    expect(total).toBe(4);
    expect(service.countByTheme()).toEqual([
      { theme: "middlegame", count: 3 },
      { theme: "advancedPawn", count: 1 },
      { theme: "crushing", count: 1 },
      { theme: "endgame", count: 1 },
      { theme: "mate", count: 1 },
      { theme: "mateIn2", count: 1 },
      { theme: "short", count: 1 },
    ]);
  });

  it("row lỗi cột → lỗi rõ ràng kèm số dòng, không nạp nửa vời", async () => {
    await expect(
      service.importPuzzlesFromCsv(malformedCsvPath),
    ).rejects.toThrowError(/Dòng 3: số cột không đúng/);

    expect(service.listPuzzles()).toMatchObject({ total: 0, items: [] });
    expect(service.countByTheme()).toEqual([]);
  });

  it("rating không phải số → lỗi rõ ràng, không nạp nửa vời", async () => {
    await expect(
      service.importPuzzlesFromCsv(badNumberCsvPath),
    ).rejects.toThrowError(/Dòng 2: Rating không phải số nguyên: "co cao"/);

    expect(service.listPuzzles()).toMatchObject({ total: 0, items: [] });
    expect(service.countByTheme()).toEqual([]);
  });

  it("lọc theo theme + khoảng rating, phân trang đúng", async () => {
    await service.importPuzzlesFromCsv(validCsvPath);

    const both = service.listPuzzles({
      theme: "middlegame",
      ratingMin: 1700,
      ratingMax: 2000,
    });
    expect(both.total).toBe(1);
    expect(both.items.map((p) => p.puzzleId)).toEqual(["00sHx"]);

    const themeOnly = service.listPuzzles({ theme: "middlegame" });
    expect(themeOnly.total).toBe(3);
    expect(themeOnly.items.map((p) => p.puzzleId)).toEqual([
      "00sJ9",
      "00sHx",
      "00sJw",
    ]);

    const ratingOnly = service.listPuzzles({ ratingMin: 1669 });
    expect(ratingOnly.total).toBe(3);

    const page = service.listPuzzles({ limit: 2, offset: 1 });
    expect(page.total).toBe(4);
    expect(page.items.map((p) => p.puzzleId)).toEqual(["00sJ9", "00sHx"]);
  });

  it("đọc lại puzzle đã import với đủ trường đã parse (10 và 11 cột)", async () => {
    await service.importPuzzlesFromCsv(validCsvPath);

    const { total, items } = service.listPuzzles();
    expect(total).toBe(4);
    const byId = new Map(items.map((p) => [p.puzzleId, p]));

    const hx = byId.get("00sHx");
    expect(hx).toMatchObject({
      fen: "q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17",
      moves: "e8d7 a2e6 d7d8 f7f8",
      rating: 1760,
      ratingDeviation: 80,
      popularity: 83,
      nbPlays: 72,
      themes: ["mate", "mateIn2", "middlegame", "short"],
      gameUrl: "https://lichess.org/yyznGmXs/black#34",
      openingTags: ["Italian_Game", "Italian_Game_Classical_Variation"],
    });
    expect(hx?.insertedAt).toBeTypeOf("string");

    expect(byId.get("00sJ9")?.openingTags).toEqual([]);
    expect(byId.get("00sJw")?.popularity).toBe(91);
    expect(byId.get("00087")?.themes).toEqual([]);
  });
});
