import { describe, expect, it } from "vitest";
import { NAG_SYMBOLS, nagLabel } from "@/lib/nag";

describe("NAG_SYMBOLS — bảng NAG chuẩn PGN", () => {
  it("các NAG 1..6 khớp bảng chuẩn ($6 là '±', không trùng $3 '!!')", () => {
    expect(NAG_SYMBOLS[1]).toBe("!");
    expect(NAG_SYMBOLS[2]).toBe("?");
    expect(NAG_SYMBOLS[3]).toBe("!!");
    expect(NAG_SYMBOLS[4]).toBe("?!");
    expect(NAG_SYMBOLS[5]).toBe("!?");
    expect(NAG_SYMBOLS[6]).toBe("±");
  });

  it("nagLabel: ghép ký hiệu; ngoài bảng giữ nguyên $n", () => {
    expect(nagLabel([1])).toBe("!");
    expect(nagLabel([3])).toBe("!!");
    expect(nagLabel([6])).toBe("±");
    expect(nagLabel([1, 1])).toBe("!!");
    expect(nagLabel([42])).toBe("$42");
    expect(nagLabel([])).toBe("");
  });
});
