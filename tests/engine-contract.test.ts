import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeEngine, isNodeEngineAvailable } from "@/lib/engine/node-transport";
import type { Engine } from "@/lib/engine/engine";

/**
 * Contract test seam `Engine` — chạy ENGINE THẬT (stockfish npm, build
 * lite-single) như một tiến trình con trong Node. Dùng depth nhỏ để nhanh.
 */
const engineAvailable = isNodeEngineAvailable();

describe.skipIf(!engineAvailable)("StockfishEngine contract (real engine, Node)", () => {
  let engine: Engine;

  beforeAll(async () => {
    engine = await createNodeEngine();
  }, 60_000);

  afterAll(async () => {
    await engine?.dispose();
  }, 30_000);

  it("analyses the start position: reasonable best move, eval near 0 (White POV)", async () => {
    const analysis = await engine.analyse(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      10,
    );
    expect(analysis.bestLineUci[0]).toMatch(/^(e2e4|d2d4|g1f3|c2c4)$/);
    expect(analysis.bestLineSan[0]).toMatch(/^(e4|d4|Nf3|c4)$/);
    expect(analysis.bestLineUci.length).toBeGreaterThan(0);
    expect(analysis.bestLineSan.length).toBe(analysis.bestLineUci.length);
    expect(analysis.mate).toBeNull();
    expect(analysis.evalCp).not.toBeNull();
    expect(Math.abs(analysis.evalCp as number)).toBeLessThanOrEqual(100);
  }, 60_000);

  it("reports a mate-in-1 with the correct White-POV sign on a back-rank position", async () => {
    // Trắng đi, Re8# — thua chiếu biên của Đen.
    const analysis = await engine.analyse("6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1", 10);
    expect(analysis.bestLineUci[0]).toBe("e1e8");
    expect(analysis.bestLineSan[0]).toBe("Re8#");
    expect(analysis.mate).toBe(1);
    expect(analysis.evalCp).toBeNull();
  }, 60_000);

  it("setStrength is accepted and analysis keeps working afterwards", async () => {
    await engine.setStrength(1);
    const weak = await engine.analyse(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      8,
    );
    expect(weak.bestLineUci.length).toBeGreaterThan(0);
    expect(weak.bestLineSan.length).toBe(weak.bestLineUci.length);
    expect(weak.evalCp === null || Math.abs(weak.evalCp) <= 200).toBe(true);

    await engine.setStrength(8);
    const strong = await engine.analyse("6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1", 10);
    expect(strong.mate).toBe(1);
  }, 90_000);

  it("negates the eval when Black is to move (White POV contract)", async () => {
    // Sau 1.e4 — Đen đi; eval phản ánh góc nhìn Trắng (Trắng hơn nhẹ → dương).
    const analysis = await engine.analyse(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      10,
    );
    expect(analysis.evalCp).not.toBeNull();
    expect(Math.abs(analysis.evalCp as number)).toBeLessThanOrEqual(150);
    expect(analysis.bestLineUci[0]).toMatch(/^(e7e5|c7c5|e7e6|c7c6|g8f6|d7d5)$/);
  }, 60_000);
});
