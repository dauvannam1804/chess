import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTrainerService,
  type BackupFile,
  type LineNode,
  type TrainerService,
} from "@/lib/trainer-service";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN =
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const KQK_FEN = "7k/8/5K2/8/8/8/8/6Q1 w - - 0 1"; // catalog #1
const KRK_FEN = "4k3/8/8/8/8/8/8/4K2R w - - 0 1";
const VALID_CSV = fileURLToPath(
  new URL("./fixtures/puzzles-valid.csv", import.meta.url),
);

/** PGN đủ chi: nhánh lồng + comment đầu/cuối nước + NAG. */
const RICH_PGN =
  "{Gambit Ý} 1. e4 e5 {king pawn} 2. Nf3 $1 " +
  "(2. f4 exf4 (2... d5) 3. Nf3) " +
  "(2. d4 exd4 {phản đòn trung tâm}) " +
  "2... {chương phòng: Nc6} Nc6 3. Bb5";

/** Tìm node theo đường dẫn SAN từ root (vd ["e4", "e5"]). */
function nodeAtPath(
  service: TrainerService,
  lineId: number,
  path: string[],
): LineNode {
  let node: LineNode | null = service.getLineTree(lineId);
  if (!node) throw new Error("fixture hỏng: line không tồn tại");
  for (const san of path) {
    const next: LineNode | undefined = node.children.find(
      (child) => child.san === san,
    );
    if (!next?.id) {
      throw new Error(`fixture hỏng: không tìm thấy nước ${san}`);
    }
    node = next;
  }
  if (node.id === null) throw new Error("fixture hỏng: node ảo root");
  return node;
}

/**
 * Seed ĐỦ row cho MỌI bảng dữ liệu người dùng: vị trí đã lưu, puzzle + lượt
 * giải, line khai cuộc có nhánh + Annotation, drill Leitner (có 1 Mastered),
 * ván + phân tích, catalog tàn cuộc + thế nhập tay + lịch tàn cuộc.
 */
async function seedEverything(service: TrainerService): Promise<void> {
  service.savePosition(START_FEN, "Đầu");
  service.savePosition(
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    "Sicilian",
  );

  const imported = await service.importPuzzlesFromCsv(VALID_CSV);
  if (imported !== 4) throw new Error("fixture hỏng: CSV puzzle phải có 4 dòng");
  service.recordAttempt("00sHx", true);
  service.recordAttempt("00sJ9", false);

  const line = service.createLineFromPgn("Ý đầy đủ", RICH_PGN);
  const e5 = nodeAtPath(service, line.id, ["e4", "e5"]);
  const exf4 = nodeAtPath(service, line.id, ["e4", "e5", "f4", "exf4"]);
  service.setAnnotation(line.id, e5.id!, "Đừng để mất trung tâm — xem ADR-0002.");
  service.setAnnotation(line.id, exf4.id!, null);

  const other = service.createLineFromPgn("Sicilian", "1. e4 c5 2. Nf3 d6");

  // Drill Leitner: e4 → Mastered (4 lần đúng: 1→2→3→4→Mastered),
  // Nf3 → hộp 2, c5 (line khác) → trượt về hộp 1.
  const e4 = nodeAtPath(service, line.id, ["e4"]);
  const nf3 = nodeAtPath(service, line.id, ["e4", "e5", "Nf3"]);
  const c5 = nodeAtPath(service, other.id, ["e4", "c5"]);
  const t1 = new Date("2026-10-01T08:00:00.000Z");
  service.answerDrillItem(e4.id!, true, t1);
  service.answerDrillItem(e4.id!, true, new Date("2026-10-02T08:00:00.000Z"));
  service.answerDrillItem(e4.id!, true, new Date("2026-10-05T08:00:00.000Z"));
  service.answerDrillItem(e4.id!, true, new Date("2026-10-12T08:00:00.000Z"));
  service.answerDrillItem(nf3.id!, true, t1);
  service.answerDrillItem(c5.id!, false, t1);

  const game1 = service.saveGame({
    pgn: '[Event "Chess Trainer"]\n\n1. e4 e5 2. Nf3 1-0',
    result: "1-0",
    userColor: "w",
    engineStrength: 4,
    finalFen: AFTER_E4_FEN,
  });
  service.saveGame({
    pgn: '[Event "Chess Trainer"]\n\n1. d4 d5 0-1',
    result: "0-1",
    userColor: "b",
    engineStrength: 8,
    finalFen: START_FEN,
  });
  service.saveGameAnalysis({
    gameId: game1.id,
    evals: [
      { fen: START_FEN, evalCp: 30, mate: null },
      { fen: AFTER_E4_FEN, evalCp: 35, mate: null },
    ],
    flags: [{ ply: 4, severity: "mistake", evalBefore: 100, evalAfter: -200 }],
    depth: 12,
  });

  service.seedEndgameCatalog();
  service.addEndgamePosition({
    name: "K+R vs K (nhập tay)",
    fen: KRK_FEN,
    goal: "win",
    userColor: "w",
  });
  const all = service.listEndgamePositions();
  const kqk = all.find((p) => p.fen === KQK_FEN)!;
  const krk = all.find((p) => p.fen === KRK_FEN)!;
  const kp = all.find((p) => p.id !== kqk.id && p.id !== krk.id)!;
  // 4 lần đúng → hộp 4 → Mastered.
  service.answerEndgameItem(kqk.id, true, t1);
  service.answerEndgameItem(kqk.id, true, new Date("2026-10-02T08:00:00.000Z"));
  service.answerEndgameItem(kqk.id, true, new Date("2026-10-05T08:00:00.000Z"));
  service.answerEndgameItem(kqk.id, true, new Date("2026-10-12T08:00:00.000Z"));
  service.answerEndgameItem(krk.id, false, t1);
  service.answerEndgameItem(kp.id, true, t1);
}

describe("TrainerService — Backup export/import (TT-11)", () => {
  let dir: string;
  let dbPath: string;
  let service: TrainerService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chess-backup-"));
    dbPath = join(dir, "chess.db");
    service = createTrainerService(dbPath);
  });

  afterEach(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("exportBackup", () => {
    it("file backup mới: đúng metadata + 9 bảng dữ liệu người dùng (rỗng)", () => {
      const backup: BackupFile = service.exportBackup();

      expect(backup.format).toBe("chess-trainer-backup");
      expect(backup.version).toBe(1);
      expect(backup.exportedAt).toBeTypeOf("string");
      expect(() => new Date(backup.exportedAt)).not.toThrow();
      expect(new Date(backup.exportedAt).toISOString()).toBe(backup.exportedAt);

      expect(Object.keys(backup.tables).sort()).toEqual(
        [
          "drillSchedule",
          "endgamePositions",
          "endgameSchedule",
          "gameAnalysis",
          "games",
          "lineMoves",
          "positions",
          "puzzleAttempts",
          "repertoireLines",
        ].sort(),
      );
      for (const rows of Object.values(backup.tables)) {
        expect(rows).toEqual([]);
      }

      // Nội dung Puzzle KHÔNG xuất kèm — nhập lại từ Lichess dump (ADR-0002),
      // loại trừ được ghi rõ trong metadata của file.
      expect(backup.excluded.tables).toEqual(["puzzles", "puzzle_themes"]);
      expect(backup.excluded.reason).toContain("ADR-0002");

      // JSON-serializable nguyên trạng (bản sao cấu trúc bằng nhau).
      expect(JSON.parse(JSON.stringify(backup))).toEqual(backup);
    });

    it("export DB đã seed: đủ row mọi bảng, id gốc + timestamp ISO", async () => {
      await seedEverything(service);

      const backup = service.exportBackup();
      const t = backup.tables;

      expect(t.positions).toHaveLength(2);
      expect(t.positions[0]).toMatchObject({ id: 1, name: "Đầu" });

      expect(t.puzzleAttempts).toHaveLength(2);
      expect(t.puzzleAttempts[0]).toMatchObject({
        id: 1,
        puzzleId: "00sHx",
        solved: true,
      });
      expect(t.puzzleAttempts[1]?.solved).toBe(false);

      expect(t.repertoireLines).toHaveLength(2);
      expect(t.repertoireLines[0]).toMatchObject({
        id: 1,
        name: "Ý đầy đủ",
        userColor: "w",
      });

      // Line chính: 11 node (nhánh lồng + NAG + comment); line 2: 4 node.
      expect(t.lineMoves).toHaveLength(15);
      expect(t.lineMoves.map((m) => m.id)).toEqual(
        Array.from({ length: 15 }, (_, i) => i + 1),
      );
      const annotated = t.lineMoves.find((m) => m.annotation !== null);
      expect(annotated?.annotation).toContain("Đừng để mất trung tâm");
      const nagged = t.lineMoves.find((m) => m.nagsJson !== "[]");
      expect(nagged?.nagsJson).toBe("[1]");
      // Nút con trỏ đúng cha: node "f4" con của "e5".
      const e5 = t.lineMoves.find((m) => m.san === "e5")!;
      const f4 = t.lineMoves.find((m) => m.san === "f4")!;
      expect(f4.parentId).toBe(e5.id);

      expect(t.drillSchedule).toHaveLength(3);
      const mastered = t.drillSchedule.find((s) => s.masteredAt !== null);
      expect(mastered).toBeDefined();
      expect(mastered?.box).toBe(4);
      expect(new Date(mastered!.masteredAt!).toISOString()).toBe(
        mastered!.masteredAt,
      );
      expect(new Date(mastered!.updatedAt).toISOString()).toBe(
        mastered!.updatedAt,
      );

      expect(t.games).toHaveLength(2);
      expect(t.games[0]).toMatchObject({ id: 1, result: "1-0" });

      expect(t.gameAnalysis).toHaveLength(1);
      expect(t.gameAnalysis[0]).toMatchObject({ id: 1, gameId: 1, depth: 12 });
      expect(JSON.parse(t.gameAnalysis[0]!.evalsJson)).toHaveLength(2);

      // Toàn bộ catalog tàn cuộc (source 'catalog' là trạng thái người dùng:
      // đã gắn lịch) + 1 thế nhập tay.
      expect(t.endgamePositions).toHaveLength(11);
      expect(
        t.endgamePositions.filter((p) => p.source === "catalog"),
      ).toHaveLength(10);
      expect(t.endgamePositions.find((p) => p.fen === KRK_FEN)).toMatchObject({
        source: "import",
        goal: "win",
        userColor: "w",
      });

      expect(t.endgameSchedule).toHaveLength(3);
      expect(
        t.endgameSchedule.filter((s) => s.masteredAt !== null),
      ).toHaveLength(1);
    });
  });

  describe("importBackup — round-trip (AC chính)", () => {
    it("export → import DB trống → export lại: `tables` deep-equal, không cần chuẩn hóa gì ngoài exportedAt", async () => {
      await seedEverything(service);
      const first = service.exportBackup();

      const dir2 = mkdtempSync(join(tmpdir(), "chess-restore-"));
      const service2 = createTrainerService(join(dir2, "restore.db"));
      try {
        const { imported } = await service2.importBackup(
          JSON.parse(JSON.stringify(first)),
        );

        expect(Object.values(imported).reduce((a, b) => a + b, 0)).toBe(
          2 + 2 + 2 + 15 + 3 + 2 + 1 + 11 + 3,
        );
        expect(imported).toEqual({
          positions: 2,
          puzzleAttempts: 2,
          repertoireLines: 2,
          lineMoves: 15,
          drillSchedule: 3,
          games: 2,
          gameAnalysis: 1,
          endgamePositions: 11,
          endgameSchedule: 3,
        });

        const second = service2.exportBackup();
        expect(second.format).toBe(first.format);
        expect(second.version).toBe(first.version);
        expect(second.excluded).toEqual(first.excluded);
        expect(second.tables).toEqual(first.tables);
      } finally {
        service2.close();
        rmSync(dir2, { recursive: true, force: true });
      }
    });

    it.each([
      ["null", null],
      ["chuỗi thường", "xin chào"],
      ["số", 42],
      ["sai format", { format: "khac", version: 1, tables: {} }],
      ["sai version", { format: "chess-trainer-backup", version: 2, tables: {} }],
      ["thiếu tables", { format: "chess-trainer-backup", version: 1 }],
      ["thiếu bảng lineMoves", {
        format: "chess-trainer-backup",
        version: 1,
        tables: {
          positions: [],
          puzzleAttempts: [],
          repertoireLines: [],
          drillSchedule: [],
          games: [],
          gameAnalysis: [],
          endgamePositions: [],
          endgameSchedule: [],
        },
      }],
      ["bảng không phải mảng", {
        format: "chess-trainer-backup",
        version: 1,
        tables: {
          positions: "không phải mảng",
          puzzleAttempts: [],
          repertoireLines: [],
          lineMoves: [],
          drillSchedule: [],
          games: [],
          gameAnalysis: [],
          endgamePositions: [],
          endgameSchedule: [],
        },
      }],
      ["row thiếu id", {
        format: "chess-trainer-backup",
        version: 1,
        tables: {
          positions: [{ fen: START_FEN, name: null, createdAt: "2026-10-12T00:00:00.000Z" }],
          puzzleAttempts: [],
          repertoireLines: [],
          lineMoves: [],
          drillSchedule: [],
          games: [],
          gameAnalysis: [],
          endgamePositions: [],
          endgameSchedule: [],
        },
      }],
    ])("junk (%s) → lỗi tiếng Việt rõ ràng, DB nguyên vẹn", async (_label, junk) => {
      await seedEverything(service);
      const before = service.exportBackup();

      await expect(service.importBackup(junk)).rejects.toThrowError(/bakup|backup|Backup/i);

      const after = service.exportBackup();
      expect(after.tables).toEqual(before.tables);
    });

    it("import lại cùng file vào DB đã có dữ liệu → không nhân bản, trạng thái không đổi", async () => {
      await seedEverything(service);
      const first = service.exportBackup();

      const dir2 = mkdtempSync(join(tmpdir(), "chess-restore-2-"));
      const service2 = createTrainerService(join(dir2, "restore.db"));
      try {
        const payload = JSON.parse(JSON.stringify(first));
        await service2.importBackup(payload);
        const second = await service2.importBackup(payload);

        expect(second.imported).toEqual({
          positions: 2,
          puzzleAttempts: 2,
          repertoireLines: 2,
          lineMoves: 15,
          drillSchedule: 3,
          games: 2,
          gameAnalysis: 1,
          endgamePositions: 11,
          endgameSchedule: 3,
        });
        expect(service2.exportBackup().tables).toEqual(first.tables);

        // Tự phục hồi đè lên chính DB nguồn: cũng không nhân bản.
        const self = await service.importBackup(payload);
        expect(self.imported).toEqual(second.imported);
        expect(service.exportBackup().tables).toEqual(first.tables);
      } finally {
        service2.close();
        rmSync(dir2, { recursive: true, force: true });
      }
    });

    it("DB phục hồi dùng được qua seam công khai: cây + Annotation + drill queue + tàn cuộc + analysis", async () => {
      await seedEverything(service);
      const payload = JSON.parse(JSON.stringify(service.exportBackup()));

      const dir2 = mkdtempSync(join(tmpdir(), "chess-restore-3-"));
      const service2 = createTrainerService(join(dir2, "restore.db"));
      try {
        await service2.importBackup(payload);

        // Số lượng khớp nguồn.
        expect(service2.listLines()).toHaveLength(2);
        expect(service2.listPositions()).toHaveLength(2);

        // puzzle_attempts khôi phục đủ; thống kê Theme join bảng NỘI DUNG
        // puzzle_themes (không xuất kèm — ADR-0002): chỉ đầy đủ lại sau khi
        // nhập lại dump Lichess — đúng flow phục hồi đã tài liệu hóa.
        expect(service2.getThemeStats()).toEqual([]);
        await service2.importPuzzlesFromCsv(VALID_CSV);
        expect(service2.getThemeStats()).toEqual(service.getThemeStats());
        expect(service2.listPuzzles().total).toBe(4);

        // line_moves giữ đúng quan hệ cha–con (FK theo id gốc): cây dựng lại
        // giống hệt cây nguồn, kể cả Annotation gắn trên node.
        const sourceTree = service.getLineTree(1);
        const restoredTree = service2.getLineTree(1);
        expect(restoredTree).toEqual(sourceTree);
        const e5 = nodeAtPath(service2, 1, ["e4", "e5"]);
        expect(service2.getAnnotation(1, e5.id!)).toBe(
          "Đừng để mất trung tâm — xem ADR-0002.",
        );

        // Lịch drill nối đúng node: cùng summary + cùng hàng đợi ở mọi mốc.
        expect(service2.getDrillSummary()).toEqual(service.getDrillSummary());
        expect(service2.getDrillSummary(new Date("2026-10-03T08:00:00.000Z"))).toEqual(
          service.getDrillSummary(new Date("2026-10-03T08:00:00.000Z")),
        );
        expect(service2.getDrillQueue(new Date("2026-10-03T08:00:00.000Z"))).toEqual(
          service.getDrillQueue(new Date("2026-10-03T08:00:00.000Z")),
        );

        // Catalog tàn cuộc + lịch riêng: đủ 11 thế, 1 Mastered.
        const positions = service2.listEndgamePositions();
        expect(positions).toHaveLength(11);
        expect(positions.filter((p) => p.masteredAt !== null)).toHaveLength(1);
        expect(
          positions.find((p) => p.fen === KRK_FEN)?.source,
        ).toBe("import");

        // Ván + cache phân tích: mở lại đọc thẳng cache.
        expect(service2.listGames()).toEqual(service.listGames());
        expect(service2.getGameAnalysis(1)).toEqual(service.getGameAnalysis(1));
        expect(service2.isGameAnalysed(1)).toBe(true);

        // Tiếp tục ghi trên DB phục hồi vẫn chạy: id mới không đụng id cũ.
        const fresh = service2.savePosition(KQK_FEN, "Sau phục hồi");
        expect(fresh.id).toBe(3);
      } finally {
        service2.close();
        rmSync(dir2, { recursive: true, force: true });
      }
    });

    it("import hỏng giữa chừng (row vi phạm ràng buộc SQL) → cả giao dịch hủy, DB nguyên vẹn", async () => {
      await seedEverything(service);
      const before = service.exportBackup();

      const payload = JSON.parse(JSON.stringify(before));
      // Shape hợp lệ theo parseBackupFile, nhưng vi phạm CHECK box 1..4 →
      // lỗi nổ ở GIỮA giao dịch, mọi row chèn trước đó phải hủy theo.
      payload.tables.endgameSchedule.push({
        id: 999,
        positionId: 999,
        box: 9,
        dueAt: "2026-10-13T08:00:00.000Z",
        masteredAt: null,
        updatedAt: "2026-10-13T08:00:00.000Z",
      });

      await expect(service.importBackup(payload)).rejects.toThrowError();

      expect(service.exportBackup().tables).toEqual(before.tables);
    });
  });
});
