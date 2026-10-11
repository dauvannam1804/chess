import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  createTrainerService,
  type TrainerService,
} from "@/lib/trainer-service";

/**
 * Giá trị vật chất sơ khai để đối chiếu mục tiêu của từng Thế tàn cuộc:
 * goal "win" bắt buộc bên user mạnh hơn hẳn; goal "draw" thì không.
 */
const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function materialOf(fen: string, color: "w" | "b"): number {
  const chess = new Chess(fen);
  return chess
    .board()
    .flat()
    .reduce(
      (sum, square) =>
        square && square.color === color
          ? sum + PIECE_VALUES[square.type]
          : sum,
      0,
    );
}

describe("TrainerService — Endgame catalog (seed + import)", () => {
  let dir: string;
  let dbPath: string;
  let service: TrainerService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chess-endgame-"));
    dbPath = join(dir, "chess.db");
    service = createTrainerService(dbPath);
  });

  afterEach(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("seedEndgameCatalog nạp ~10 thế kinh điển và idempotent — count ổn định qua 2 lần chạy", () => {
    const first = service.seedEndgameCatalog();
    const positions = service.listEndgamePositions();
    expect(first).toBe(positions.length);
    expect(positions.length).toBeGreaterThanOrEqual(10);
    expect(positions.every((p) => p.source === "catalog")).toBe(true);

    // Lần 2: không chèn thêm gì — cùng tên là bỏ qua.
    const second = service.seedEndgameCatalog();
    expect(second).toBe(0);
    expect(service.listEndgamePositions()).toHaveLength(positions.length);
  });

  it("mọi FEN catalog đều hợp lệ qua chess.js và vật chất phù hợp mục tiêu", () => {
    service.seedEndgameCatalog();
    const positions = service.listEndgamePositions();

    // Trùng tên là lỗi seed (tên là khóa idempotency).
    const names = positions.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);

    for (const position of positions) {
      const chess = new Chess(position.fen); // throw nếu FEN hỏng
      expect(chess.turn()).toBe(position.userColor === "w" ? "w" : "b");

      const userMaterial = materialOf(position.fen, position.userColor);
      const opponentColor = position.userColor === "w" ? "b" : "w";
      const opponentMaterial = materialOf(position.fen, opponentColor);

      if (position.goal === "win") {
        // "≥": đua Tốt thắng nhờ tempo (vật chất ngang) — nhưng bắt buộc
        // user phải còn quân để theo đuổi thắng (Vua trần là vô nghĩa).
        expect(
          userMaterial,
          `${position.name}: user phải đủ quân để theo đuổi thắng`,
        ).toBeGreaterThanOrEqual(opponentMaterial);
        expect(userMaterial, `${position.name}: user không được chỉ còn Vua`).toBeGreaterThan(0);
      } else {
        expect(
          userMaterial,
          `${position.name}: mục tiêu hòa thì user không được mạnh hơn`,
        ).toBeLessThanOrEqual(opponentMaterial);
      }

      expect(position.maxMoves).toBeGreaterThanOrEqual(1);
      expect(["win", "draw"]).toContain(position.goal);
      expect(["w", "b"]).toContain(position.userColor);
    }

    // Catalog phủ đúng các nhóm thế bắt buộc bởi ticket.
    expect(names.some((n) => /Hậu.*Vua vs Vua/.test(n))).toBe(true);
    expect(names.some((n) => /Xe.*Vua vs Vua/.test(n))).toBe(true);
    expect(names.some((n) => /Hai Tượng/.test(n))).toBe(true);
    expect(names.some((n) => /Tượng.*Mã/.test(n))).toBe(true);
    expect(names.some((n) => /Hậu vs Xe/.test(n))).toBe(true);
    expect(names.some((n) => /Tốt \+ Vua vs Vua/.test(n))).toBe(true);
    expect(names.some((n) => /Xe \+ Vua vs Tốt/.test(n))).toBe(true);
    expect(names.some((n) => /Lucena/i.test(n))).toBe(true);
    expect(names.some((n) => /Philidor/i.test(n))).toBe(true);
    expect(names.some((n) => /Đua Tốt/.test(n))).toBe(true);
  });
});

describe("TrainerService — Endgame drill (Leitner + hàng đợi + import)", () => {
  let dir: string;
  let dbPath: string;
  let service: TrainerService;

  const T0 = new Date("2026-10-11T08:00:00.000Z");
  const NGAY = 86_400_000;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chess-endgame-"));
    dbPath = join(dir, "chess.db");
    service = createTrainerService(dbPath);
    service.seedEndgameCatalog();
  });

  afterEach(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function positionByName(name: string) {
    const found = service
      .listEndgamePositions()
      .find((p) => p.name === name);
    if (!found) throw new Error(`fixture hỏng: không tìm thấy thế "${name}"`);
    return found;
  }

  it("trước lần trả lời đầu: lịch chưa tồn tại (tạo lười)", () => {
    const position = positionByName("Hậu + Vua vs Vua");
    expect(position.box).toBeNull();
    expect(position.dueAt).toBeNull();
    expect(position.masteredAt).toBeNull();
  });

  it.each([
    {
      name: "đúng lần 1: hộp 1 → 2, đến hạn +1 ngày",
      answers: [{ correct: true, expectBox: 2, dueInDays: 1 }],
    },
    {
      name: "đúng 2 lần liên tiếp: hộp 2 → 3, đến hạn +3 ngày",
      answers: [
        { correct: true, expectBox: 2, dueInDays: 1 },
        { correct: true, expectBox: 3, dueInDays: 3 },
      ],
    },
    {
      name: "sau 2 lần đúng, trả lời SAI: tụt về hộp 1, đến hạn ngay",
      answers: [
        { correct: true, expectBox: 2, dueInDays: 1 },
        { correct: true, expectBox: 3, dueInDays: 3 },
        { correct: false, expectBox: 1, dueInDays: 0 },
      ],
    },
  ])(
    "answerEndgameItem tái dùng phép toán Leitner — $name",
    ({ answers }) => {
      const position = positionByName("Hậu + Vua vs Vua");
      let state = null;
      for (const answer of answers) {
        state = service.answerEndgameItem(position.id, answer.correct, T0);
        expect(state.box).toBe(answer.expectBox);
        expect(Date.parse(state.dueAt)).toBe(
          T0.getTime() + answer.dueInDays * NGAY,
        );
        expect(state.updatedAt).toBe(T0.toISOString());
      }
      // Trạng thái trong danh sách khớp với lần trả lời cuối.
      const after = positionByName("Hậu + Vua vs Vua");
      expect(after.box).toBe(answers[answers.length - 1].expectBox);
    },
  );

  it("answerEndgameItem từ chối thế không tồn tại", () => {
    expect(() => service.answerEndgameItem(424242, true, T0)).toThrowError(
      /không tìm thấy/i,
    );
  });

  it("hàng đợi: sai → đến hạn ngay; đúng → ra khỏi hàng đợi tới hạn; Mastered → loại vĩnh viễn", () => {
    const position = positionByName("Philidor — phòng ngự hòa");

    // SAI: vào hàng đợi ngay.
    service.answerEndgameItem(position.id, false, T0);
    expect(
      service.getEndgameQueue(T0).map((item) => item.positionId),
    ).toContain(position.id);

    // ĐÚNG: due +1 ngày — không còn trong hàng đợi hôm nay, có vào ngày mai.
    service.answerEndgameItem(position.id, true, T0);
    expect(service.getEndgameQueue(T0).map((item) => item.positionId)).not.toContain(
      position.id,
    );
    const tomorrow = new Date(T0.getTime() + NGAY);
    expect(
      service.getEndgameQueue(tomorrow).map((item) => item.positionId),
    ).toContain(position.id);

    // ĐÚNG đến hộp 4 → Mastered: loại khỏi hàng đợi kể cả rất xa trong tương lai.
    let now = tomorrow;
    while (now.getTime() < T0.getTime() + 30 * NGAY) {
      const state = service.answerEndgameItem(position.id, true, now);
      if (state.masteredAt) break;
      now = new Date(Date.parse(state.dueAt));
    }
    const finalState = service.answerEndgameItem(position.id, true, now);
    expect(finalState.box).toBe(4);
    expect(finalState.masteredAt).not.toBeNull();

    const farFuture = new Date(T0.getTime() + 365 * NGAY);
    expect(
      service.getEndgameQueue(farFuture).map((item) => item.positionId),
    ).not.toContain(position.id);
    const listed = positionByName("Philidor — phòng ngự hòa");
    expect(listed.masteredAt).not.toBeNull();
    expect(listed.box).toBe(4);
  });

  it("getEndgameQueue trả đủ ngữ cảnh luyện (fen/goal/user_color/max_moves)", () => {
    const position = positionByName("Lucena — kỹ thuật xây cầu");
    service.answerEndgameItem(position.id, false, T0);
    const item = service
      .getEndgameQueue(T0)
      .find((entry) => entry.positionId === position.id);
    expect(item).toMatchObject({
      name: "Lucena — kỹ thuật xây cầu",
      fen: position.fen,
      goal: "win",
      userColor: "w",
      maxMoves: 50,
      box: 1,
    });
  });

  describe("addEndgamePosition — import FEN", () => {
    const VALID_FEN = "6k1/8/6K1/8/8/8/8/7Q w - - 0 1";

    it("FEN hợp lệ → thế mới source 'import' và drill được như catalog", () => {
      const created = service.addEndgamePosition({
        name: "Thế tự nhập",
        fen: VALID_FEN,
        goal: "win",
        userColor: "w",
      });

      expect(created.source).toBe("import");
      expect(created.maxMoves).toBe(50);

      // Drill như catalog: sai → vào hàng đợi, đúng → Leitner.
      service.answerEndgameItem(created.id, false, T0);
      expect(service.getEndgameQueue(T0).map((i) => i.positionId)).toContain(
        created.id,
      );
      const state = service.answerEndgameItem(created.id, true, T0);
      expect(state.box).toBe(2);
    });

    it("maxMoves tùy chỉnh được ghi nhận", () => {
      const created = service.addEndgamePosition({
        name: "Thế 20 nước",
        fen: VALID_FEN,
        goal: "draw",
        userColor: "b",
        maxMoves: 20,
      });
      expect(created.maxMoves).toBe(20);
      expect(created.goal).toBe("draw");
      expect(created.userColor).toBe("b");
    });

    it.each([
      { label: "FEN rác", fen: "khong-phai-fen", goal: "win", userColor: "w" },
      {
        // Hợp đồng validation là chess.js: chặn rác cấu trúc (sai số ô,
        // sai số vua, thiếu vua). chess.js 1.4 tính "legal position" lỏng
        // hơn (vua kề nhau vẫn nhận) — ngoài phạm vi ticket.
        label: "FEN rác cấu trúc (hàng 9 ô)",
        fen: "9/8/8/8/8/8/8/8 w - - 0 1",
        goal: "win",
        userColor: "w",
      },
      {
        label: "goal lạ",
        fen: VALID_FEN,
        goal: "lose",
        userColor: "w",
      },
      {
        label: "màu lạ",
        fen: VALID_FEN,
        goal: "win",
        userColor: "green",
      },
      {
        label: "maxMoves bằng 0",
        fen: VALID_FEN,
        goal: "win",
        userColor: "w",
        maxMoves: 0,
      },
      {
        label: "maxMoves lẻ",
        fen: VALID_FEN,
        goal: "win",
        userColor: "w",
        maxMoves: 12.5,
      },
    ] as const)("$label → bị chặn", (input) => {
      // Chủ động nạp dữ liệu xấu qua biên API — ép kiểu như caller thật.
      const bad = input as unknown as Parameters<
        TrainerService["addEndgamePosition"]
      >[0];
      expect(() => service.addEndgamePosition(bad)).toThrowError();
      // Không có rác nào lọt vào danh sách.
      expect(
        service.listEndgamePositions().filter((p) => p.source === "import"),
      ).toHaveLength(0);
    });
  });

  it("deleteEndgamePosition xóa thế + lịch (FK cascade), khỏi hàng đợi", () => {
    const position = positionByName("Đua Tốt hai bên");
    service.answerEndgameItem(position.id, false, T0);
    expect(service.getEndgameQueue(T0).map((i) => i.positionId)).toContain(
      position.id,
    );

    service.deleteEndgamePosition(position.id);

    expect(
      service.listEndgamePositions().map((p) => p.id),
    ).not.toContain(position.id);
    expect(service.getEndgameQueue(T0).map((i) => i.positionId)).not.toContain(
      position.id,
    );
  });

  it("deleteEndgamePosition từ chối id không tồn tại", () => {
    expect(() => service.deleteEndgamePosition(424242)).toThrowError(
      /không tìm thấy/i,
    );
  });
});
