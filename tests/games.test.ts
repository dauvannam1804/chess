import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTrainerService, type SaveGameInput } from "@/lib/trainer-service";
import type { TrainerService } from "@/lib/trainer-service";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function sampleGame(overrides: Partial<SaveGameInput> = {}): SaveGameInput {
  return {
    pgn: '[Event "Chess Trainer"]\n\n1. e4 e5 *',
    result: "1-0",
    userColor: "w",
    engineStrength: 4,
    finalFen: AFTER_E4_FEN,
    ...overrides,
  };
}

describe("TrainerService — archive Game", () => {
  let dir: string;
  let dbPath: string;
  let service: TrainerService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chess-games-"));
    dbPath = join(dir, "chess.db");
    service = createTrainerService(dbPath);
  });

  afterEach(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("saveGame → getGame đọc lại đủ trường", () => {
    const saved = service.saveGame(sampleGame());

    expect(saved.id).toBeTypeOf("number");
    const game = service.getGame(saved.id);
    expect(game).not.toBeNull();
    expect(game!.pgn).toContain("1. e4 e5");
    expect(game!.result).toBe("1-0");
    expect(game!.userColor).toBe("w");
    expect(game!.engineStrength).toBe(4);
    expect(game!.finalFen).toBe(AFTER_E4_FEN);
    expect(game!.playedAt).toBeTypeOf("string");
  });

  it("getGame với id không tồn tại → null", () => {
    expect(service.getGame(4242)).toBeNull();
  });

  it("listGames: mới nhất trước, phân trang limit/offset + total", () => {
    service.saveGame(sampleGame({ result: "1-0" }));
    service.saveGame(sampleGame({ result: "0-1", userColor: "b" }));
    service.saveGame(sampleGame({ result: "1/2-1/2", engineStrength: 8 }));

    const page1 = service.listGames({ limit: 2, offset: 0 });
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.items.map((g) => g.result)).toEqual(["1/2-1/2", "0-1"]);

    const page2 = service.listGames({ limit: 2, offset: 2 });
    expect(page2.items.map((g) => g.result)).toEqual(["1-0"]);
  });

  it("listGames mặc định: đủ danh sách, mới nhất trước", () => {
    service.saveGame(sampleGame({ engineStrength: 1 }));
    service.saveGame(sampleGame({ engineStrength: 8 }));

    const all = service.listGames();
    expect(all.total).toBe(2);
    expect(all.items.map((g) => g.engineStrength)).toEqual([8, 1]);
  });

  it("ván đã lưu còn nguyên sau khi mở lại service (restart app)", () => {
    const saved = service.saveGame(sampleGame());
    service.close();

    const reopened = createTrainerService(dbPath);
    try {
      const game = reopened.getGame(saved.id);
      expect(game?.result).toBe("1-0");
      expect(reopened.listGames().total).toBe(1);
    } finally {
      reopened.close();
    }
  });

  it("từ chối result rác và không lưu gì xuống DB", () => {
    expect(() =>
      service.saveGame(sampleGame({ result: "2-1" as "1-0" })),
    ).toThrowError(/Result/);
    expect(() =>
      service.saveGame(sampleGame({ result: "win" as "1-0" })),
    ).toThrowError(/Result/);
    expect(service.listGames().total).toBe(0);
  });

  it("từ chối userColor rác", () => {
    expect(() =>
      service.saveGame(sampleGame({ userColor: "x" as "w" })),
    ).toThrowError(/Màu/);
  });

  it("từ chối engineStrength ngoài 1..8 hoặc lẻ", () => {
    expect(() => service.saveGame(sampleGame({ engineStrength: 0 }))).toThrowError(
      /Độ mạnh/,
    );
    expect(() => service.saveGame(sampleGame({ engineStrength: 9 }))).toThrowError(
      /Độ mạnh/,
    );
    expect(() =>
      service.saveGame(sampleGame({ engineStrength: 3.5 })),
    ).toThrowError(/Độ mạnh/);
  });

  it("từ chối PGN rỗng và finalFen không phải FEN", () => {
    expect(() => service.saveGame(sampleGame({ pgn: "   " }))).toThrowError(/PGN/);
    expect(() =>
      service.saveGame(sampleGame({ finalFen: "không phải fen" })),
    ).toThrowError(/FEN/);
  });

  it("bắt ván mới từ thế chuẩn: finalFen hợp lệ, không đụng bảng khác", () => {
    service.savePosition(START_FEN);
    service.saveGame(sampleGame());
    expect(service.listPositions()).toHaveLength(1);
    expect(service.listGames().total).toBe(1);
  });
});
