import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { parseImportedGame, IMPORT_ENGINE_STRENGTH } from "@/lib/review/pgn-import";
import { replayGame } from "@/lib/review/replay-game";
import type { TrainerService } from "@/lib/trainer-service";
import { createTrainerService } from "@/lib/trainer-service";

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN =
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_E4_E5_FEN =
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

const PGN_SIMPLE = '[Event "Test"]\n\n1. e4 e5 2. Nf3 *';
const BACKRANK_FEN = "6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1";
const PGN_FEN_HEADER = `[SetUp "1"]\n[FEN "${BACKRANK_FEN}"]\n\n1. Re8#`;

describe("replayGame — PGN → chuỗi FEN trước mỗi nước", () => {
  it("PGN từ thế chuẩn: FEN trước từng nước, đúng thứ tự ply", () => {
    const steps = replayGame(PGN_SIMPLE);
    expect(steps.map((step) => step.fenBefore)).toEqual([
      START_FEN,
      AFTER_E4_FEN,
      AFTER_E4_E5_FEN,
    ]);
    expect(steps.map((step) => step.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(steps.map((step) => step.ply)).toEqual([0, 1, 2]);
  });

  it("PGN có header FEN: phát triển từ thế cờ đó, không phải thế chuẩn", () => {
    const steps = replayGame(PGN_FEN_HEADER);
    expect(steps).toHaveLength(1);
    expect(steps[0].san).toBe("Re8#");
    expect(steps[0].fenBefore).toBe(BACKRANK_FEN);
  });

  it("PGN chỉ có header không có nước → rỗng", () => {
    expect(replayGame('[Event "Trống"]\n\n*')).toEqual([]);
  });

  it("PGN rác → ném lỗi thân thiện", () => {
    expect(() => replayGame("đây không phải pgn")).toThrowError(/PGN/);
  });
});

describe("parseImportedGame — PGN import thành dữ liệu Game", () => {
  it("đọc Result từ header khi có", () => {
    const parsed = parseImportedGame('[Result "0-1"]\n\n1. e4 e5 0-1');
    expect(parsed.result).toBe("0-1");
    expect(parsed.pgn).toContain("1. e4 e5");
  });

  it("không có header Result → '*'", () => {
    expect(parseImportedGame(PGN_SIMPLE).result).toBe("*");
  });

  it("header Result rác → '*' (không sập)", () => {
    expect(parseImportedGame('[Result "2-1"]\n\n1. e4 *').result).toBe("*");
  });

  it("finalFen = thế cờ sau nước cuối (ván mate biên)", () => {
    const parsed = parseImportedGame(PGN_FEN_HEADER);
    const final = new Chess(parsed.finalFen);
    expect(final.isCheckmate()).toBe(true);
    expect(final.turn()).toBe("b");
  });

  it("PGN rác → ném lỗi", () => {
    expect(() => parseImportedGame("")).toThrowError(/PGN/);
  });
});

describe("PGN import → getGame round-trip qua TrainerService", () => {
  let dir: string;
  let service: TrainerService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chess-review-import-"));
    service = createTrainerService(join(dir, "chess.db"));
  });

  afterEach(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("parse → saveGame → getGame: đủ result/finalFen/pgn", () => {
    const parsed = parseImportedGame('[Result "0-1"]\n\n1. e4 e5 0-1');
    const saved = service.saveGame({
      pgn: parsed.pgn,
      result: parsed.result,
      userColor: "w",
      engineStrength: 1,
      finalFen: parsed.finalFen,
    });
    const game = service.getGame(saved.id);
    expect(game).not.toBeNull();
    expect(game!.result).toBe("0-1");
    expect(game!.pgn).toContain("1. e4 e5");
    expect(new Chess(game!.finalFen).fen()).toBe(new Chess(parsed.finalFen).fen());
    expect(service.listGames().total).toBe(1);
  });

  it("import ván header-only (0 nước) vẫn lưu được", () => {
    const parsed = parseImportedGame('[Event "Chưa đi"]\n\n*');
    const saved = service.saveGame({
      pgn: parsed.pgn,
      result: parsed.result,
      userColor: "b",
      engineStrength: 1,
      finalFen: parsed.finalFen,
    });
    expect(service.getGame(saved.id)?.result).toBe("*");
  });

  it("sentinel ván import: IMPORT_ENGINE_STRENGTH là một nguồn sự thật duy nhất", () => {
    // Ván import lưu đúng mức sentinel — trang archive so sánh game
    // engineStrength với chính hằng số này để hiện nhãn "import".
    expect(IMPORT_ENGINE_STRENGTH).toBe(1);
    const parsed = parseImportedGame('[Result "1-0"]\n\n1. e4 e5 1-0');
    const saved = service.saveGame({
      pgn: parsed.pgn,
      result: parsed.result,
      userColor: "w",
      engineStrength: IMPORT_ENGINE_STRENGTH,
      finalFen: parsed.finalFen,
    });
    expect(service.getGame(saved.id)?.engineStrength).toBe(
      IMPORT_ENGINE_STRENGTH,
    );

    // Ván chơi thật ở mức ≠ sentinel thì không bị nhận nhầm là import.
    const played = service.saveGame({
      pgn: parsed.pgn,
      result: parsed.result,
      userColor: "w",
      engineStrength: 4,
      finalFen: parsed.finalFen,
    });
    expect(service.getGame(played.id)?.engineStrength).not.toBe(
      IMPORT_ENGINE_STRENGTH,
    );
  });
});
