import { describe, expect, it } from "vitest";
import { flagMistakes, formatEval } from "@/lib/review/flag-mistakes";

type EvalScore = { evalCp: number | null; mate: number | null };

const cp = (evalCp: number): EvalScore => ({ evalCp, mate: null });
const mate = (m: number): EvalScore => ({ evalCp: null, mate: m });

describe("flagMistakes — so sánh eval trước/sau theo POV bên đi", () => {
  const cases: {
    name: string;
    evals: EvalScore[];
    userColor: "w" | "b";
    expected: {
      ply: number;
      severity: "mistake" | "blunder";
      evalBefore: number;
      evalAfter: number;
    }[];
  }[] = [
    {
      name: "nước yên tĩnh (Trắng cải thiện nhẹ) → không flag",
      evals: [cp(0), cp(20)],
      userColor: "w",
      expected: [],
    },
    {
      name: "suy giảm đúng 100cp → mistake",
      evals: [cp(0), cp(-100)],
      userColor: "w",
      expected: [{ ply: 0, severity: "mistake", evalBefore: 0, evalAfter: -100 }],
    },
    {
      name: "suy giảm 99cp → không flag (dưới ngưỡng)",
      evals: [cp(0), cp(-99)],
      userColor: "w",
      expected: [],
    },
    {
      name: "suy giảm đúng 300cp → blunder",
      evals: [cp(50), cp(-250)],
      userColor: "w",
      expected: [{ ply: 0, severity: "blunder", evalBefore: 50, evalAfter: -250 }],
    },
    {
      name: "nước Trắng sai 250cp → mistake (flag cả hai bên)",
      evals: [cp(0), cp(-250), cp(-250)],
      userColor: "b",
      expected: [
        { ply: 0, severity: "mistake", evalBefore: 0, evalAfter: -250 },
      ],
    },
    {
      name: "nước Đen sai: eval White-POV tăng 250 → mistake với eval ĐÃ ĐẢO DẤU theo POV Đen",
      evals: [cp(0), cp(0), cp(250)],
      userColor: "b",
      expected: [
        { ply: 1, severity: "mistake", evalBefore: 0, evalAfter: -250 },
      ],
    },
    {
      name: "nước Đen hỏng 320cp → blunder theo POV Đen",
      evals: [cp(-20), cp(-20), cp(300)],
      userColor: "b",
      expected: [
        { ply: 1, severity: "blunder", evalBefore: 20, evalAfter: -300 },
      ],
    },
    {
      name: "mất thế mate-in-1 còn +150cp → blunder (mate swing)",
      evals: [mate(1), cp(150)],
      userColor: "w",
      expected: [
        { ply: 0, severity: "blunder", evalBefore: 10_000 - 1, evalAfter: 150 },
      ],
    },
    {
      name: "từ +80cp rơi vào bị mate-in-2 → blunder (mate swing)",
      evals: [cp(80), mate(-2)],
      userColor: "w",
      expected: [
        {
          ply: 0,
          severity: "blunder",
          evalBefore: 80,
          evalAfter: -(10_000 - 2),
        },
      ],
    },
    {
      name: "đối phương tiến gần mate hơn (Trắng vẫn thua) → không flag Trắng",
      evals: [mate(-5), mate(-4)],
      userColor: "w",
      expected: [],
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(flagMistakes(testCase.evals, testCase.userColor)).toEqual(
        testCase.expected,
      );
    });
  }

  it("ít hơn 2 eval → không có cặp trước/sau để so → rỗng", () => {
    expect(flagMistakes([], "w")).toEqual([]);
    expect(flagMistakes([cp(0)], "w")).toEqual([]);
  });

  it("nước cuối không có eval sau → không thể flag", () => {
    // evals[0] trước nước 0, evals[1] trước nước 1 (= sau nước 0):
    // nước 0 được flag blunder, nước 1 (cuối cùng) không có evalAfter.
    expect(flagMistakes([cp(0), cp(-500)], "w")).toEqual([
      { ply: 0, severity: "blunder", evalBefore: 0, evalAfter: -500 },
    ]);
  });

  it("từ chối userColor rác", () => {
    expect(() => flagMistakes([cp(0), cp(0)], "x" as "w")).toThrowError(
      /Màu/,
    );
  });
});

describe("formatEval — eval hiển thị (pawns, +Trắng/−Trắng, mate)", () => {
  it.each([
    [cp(35), "+0.35"],
    [cp(-120), "-1.20"],
    [cp(0), "+0.00"],
    [mate(3), "Mate trong 3 (Trắng)"],
    [mate(-2), "Mate trong 2 (Đen)"],
    [{ evalCp: null, mate: null }, "—"],
  ])("%j → %s", (input, expected) => {
    expect(formatEval(input)).toBe(expected);
  });
});
