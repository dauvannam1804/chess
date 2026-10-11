import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTrainerService } from "@/lib/trainer-service";
import type { TrainerService } from "@/lib/trainer-service";
import type { SaveGameAnalysisInput } from "@/lib/trainer-service";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN =
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function sampleInput(gameId: number): SaveGameAnalysisInput {
  return {
    gameId,
    evals: [
      { fen: START_FEN, evalCp: 30, mate: null },
      { fen: AFTER_E4_FEN, evalCp: -10, mate: null },
    ],
    flags: [
      { ply: 0, severity: "mistake", evalBefore: 30, evalAfter: -10 },
    ],
    depth: 10,
  };
}

describe("TrainerService — cache phân tích Game (game_analysis)", () => {
  let dir: string;
  let service: TrainerService;
  let gameId: number;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chess-game-analysis-"));
    service = createTrainerService(join(dir, "chess.db"));
    gameId = service.saveGame({
      pgn: '[Event "T"]\n\n1. e4 *',
      result: "*",
      userColor: "w",
      engineStrength: 4,
      finalFen: AFTER_E4_FEN,
    }).id;
  });

  afterEach(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("chưa phân tích → isGameAnalysed=false, getGameAnalysis=null", () => {
    expect(service.isGameAnalysed(gameId)).toBe(false);
    expect(service.getGameAnalysis(gameId)).toBeNull();
  });

  it("saveGameAnalysis → getGameAnalysis đọc lại nguyên evals/flags/depth", () => {
    const saved = service.saveGameAnalysis(sampleInput(gameId));
    expect(saved.gameId).toBe(gameId);
    expect(saved.depth).toBe(10);
    expect(saved.analysedAt).toBeTypeOf("string");

    const loaded = service.getGameAnalysis(gameId);
    expect(loaded).not.toBeNull();
    expect(loaded!.evals).toEqual(sampleInput(gameId).evals);
    expect(loaded!.flags).toEqual(sampleInput(gameId).flags);
    expect(loaded!.depth).toBe(10);
    expect(loaded!.analysedAt).toBe(saved.analysedAt);
    expect(service.isGameAnalysed(gameId)).toBe(true);
  });

  it("upsert theo game_id: lưu lần 2 thay thế (không nhân bản), dữ liệu mới nhất thắng", () => {
    service.saveGameAnalysis(sampleInput(gameId));
    const updated = service.saveGameAnalysis({
      gameId,
      evals: [{ fen: START_FEN, evalCp: 5, mate: null }],
      flags: [],
      depth: 12,
    });

    const loaded = service.getGameAnalysis(gameId);
    expect(loaded).not.toBeNull();
    expect(loaded!.depth).toBe(12);
    expect(loaded!.evals).toEqual(updated.evals);
    expect(loaded!.flags).toEqual([]);
    expect(loaded!.analysedAt).toBe(updated.analysedAt);
    expect(service.isGameAnalysed(gameId)).toBe(true);
    // Ván gốc không bị đụng tới.
    expect(service.listGames().total).toBe(1);
  });

  it("phân tích gắn sai game (không tồn tại) → ném lỗi", () => {
    expect(() => service.saveGameAnalysis(sampleInput(4242))).toThrowError(
      /Game/,
    );
    expect(service.isGameAnalysed(4242)).toBe(false);
  });

  it("từ chối depth không nguyên dương và evals rỗng", () => {
    expect(() =>
      service.saveGameAnalysis({ ...sampleInput(gameId), depth: 0 }),
    ).toThrowError(/Độ sâu/);
    expect(() =>
      service.saveGameAnalysis({ ...sampleInput(gameId), depth: 2.5 }),
    ).toThrowError(/Độ sâu/);
    expect(() =>
      service.saveGameAnalysis({ ...sampleInput(gameId), evals: [] }),
    ).toThrowError(/eval/i);
  });

  it("cache còn nguyên sau khi mở lại service (restart app)", () => {
    service.saveGameAnalysis(sampleInput(gameId));
    service.close();

    const reopened = createTrainerService(join(dir, "chess.db"));
    try {
      expect(reopened.isGameAnalysed(gameId)).toBe(true);
      expect(reopened.getGameAnalysis(gameId)?.depth).toBe(10);
    } finally {
      reopened.close();
    }
  });
});
