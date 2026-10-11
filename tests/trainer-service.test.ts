import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTrainerService } from "@/lib/trainer-service";
import type { TrainerService } from "@/lib/trainer-service";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("TrainerService", () => {
  let dir: string;
  let dbPath: string;
  let service: TrainerService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chess-trainer-"));
    dbPath = join(dir, "chess.db");
    service = createTrainerService(dbPath);
  });

  afterEach(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("trả về danh sách rỗng trên DB mới (migrations đã chạy)", () => {
    expect(service.listPositions()).toEqual([]);
  });

  it("lưu thế cờ qua savePosition rồi đọc lại qua listPositions", () => {
    service.savePosition(START_FEN);

    const all = service.listPositions();
    expect(all).toHaveLength(1);
    expect(all[0].fen).toBe(START_FEN);
    expect(all[0].name).toBeNull();
    expect(all[0].id).toBeTypeOf("number");
    expect(all[0].createdAt).toBeTypeOf("string");
  });

  it("thế đã lưu còn nguyên sau khi mở lại service (restart app)", () => {
    service.savePosition(START_FEN, "Vị trí đầu");
    service.close();

    const reopened = createTrainerService(dbPath);
    try {
      const all = reopened.listPositions();
      expect(all).toHaveLength(1);
      expect(all[0].fen).toBe(START_FEN);
      expect(all[0].name).toBe("Vị trí đầu");
    } finally {
      reopened.close();
    }
  });

  it("từ chối FEN không hợp lệ", () => {
    expect(() => service.savePosition("không phải fen")).toThrowError(
      /FEN/,
    );
    expect(service.listPositions()).toHaveLength(0);
  });

  it("listPositions trả về thế mới nhất trước", () => {
    const sicilian = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    const french = "rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2";
    service.savePosition(START_FEN, "Đầu");
    service.savePosition(sicilian, "Sicilian");
    service.savePosition(french, "Pháp");

    const fens = service.listPositions().map((p) => p.fen);
    expect(fens).toEqual([french, sicilian, START_FEN]);
  });
});
