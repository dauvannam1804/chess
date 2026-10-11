import { describe, expect, it } from "vitest";
import {
  parseBestMoveLine,
  parseInfoLine,
  toWhitePointOfView,
  type UciScore,
} from "@/lib/engine/uci";

describe("parseInfoLine", () => {
  it("parses a centipawn score + pv from a recorded Stockfish info line", () => {
    // Ghi lại thật từ stockfish-19-lite-single (depth 10, thế bắt đầu).
    const line =
      "info depth 10 seldepth 12 multipv 1 score cp 31 nodes 9492 nps 296625 hashfull 2 time 32 pv e2e4 c7c5 g1f3 b8c6 b1c3 e7e6 d2d4 c5d4 f3d4";
    const parsed = parseInfoLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed?.score).toEqual({ kind: "cp", value: 31 });
    expect(parsed?.pv).toEqual([
      "e2e4",
      "c7c5",
      "g1f3",
      "b8c6",
      "b1c3",
      "e7e6",
      "d2d4",
      "c5d4",
      "f3d4",
    ]);
  });

  it("parses a mate score from an info line", () => {
    const line = "info depth 8 seldepth 8 multipv 1 score mate 1 time 10 pv e1e8";
    expect(parseInfoLine(line)?.score).toEqual({ kind: "mate", value: 1 });
  });

  it("parses negative cp and mate scores", () => {
    expect(parseInfoLine("info depth 5 score cp -34 pv e7e5")?.score).toEqual({
      kind: "cp",
      value: -34,
    });
    expect(parseInfoLine("info depth 5 score mate -2 pv a7a6")?.score).toEqual({
      kind: "mate",
      value: -2,
    });
  });

  it("returns empty result for an info line without score or pv", () => {
    const parsed = parseInfoLine("info depth 3 nodes 120 nps 40000 time 3");
    expect(parsed).toEqual({ score: null, pv: [] });
  });

  it("returns null for lines that are not info lines", () => {
    expect(parseInfoLine("uciok")).toBeNull();
    expect(parseInfoLine("bestmove e2e4 ponder e7e5")).toBeNull();
    expect(parseInfoLine("Stockfish 19 Lite WASM by the Stockfish developers")).toBeNull();
    expect(parseInfoLine("option name Skill Level type spin default 20 min 0 max 20")).toBeNull();
  });
});

describe("parseBestMoveLine", () => {
  it("extracts the best move and ignores the ponder move", () => {
    expect(parseBestMoveLine("bestmove e2e4 ponder e7e5")).toBe("e2e4");
  });

  it("extracts a bare bestmove", () => {
    expect(parseBestMoveLine("bestmove a7a8")).toBe("a7a8");
  });

  it("returns null for none or non-bestmove lines", () => {
    expect(parseBestMoveLine("bestmove (none)")).toBeNull();
    expect(parseBestMoveLine("uciok")).toBeNull();
  });
});

describe("toWhitePointOfView", () => {
  const cp = (value: number): UciScore => ({ kind: "cp", value });
  const mate = (value: number): UciScore => ({ kind: "mate", value });

  it("keeps the score as-is when White is to move", () => {
    expect(toWhitePointOfView(cp(31), "w")).toEqual(cp(31));
    expect(toWhitePointOfView(mate(2), "w")).toEqual(mate(2));
  });

  it("negates the score when Black is to move", () => {
    expect(toWhitePointOfView(cp(31), "b")).toEqual(cp(-31));
    expect(toWhitePointOfView(mate(1), "b")).toEqual(mate(-1));
    expect(toWhitePointOfView(cp(-40), "b")).toEqual(cp(40));
  });
});
