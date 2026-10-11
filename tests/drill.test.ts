import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTrainerService,
  nextLeitnerState,
  type LineNode,
  type TrainerService,
} from "@/lib/trainer-service";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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

describe("nextLeitnerState — phép toán lịch Leitner", () => {
  const NGAY = 86_400_000;
  const now = new Date("2026-10-11T08:00:00.000Z");

  const cases = [
    { box: 1, correct: true, expectBox: 2, dueInDays: 1, mastered: false },
    { box: 2, correct: true, expectBox: 3, dueInDays: 3, mastered: false },
    { box: 3, correct: true, expectBox: 4, dueInDays: 7, mastered: false },
    { box: 4, correct: true, expectBox: 4, dueInDays: 0, mastered: true },
    { box: 1, correct: false, expectBox: 1, dueInDays: 0, mastered: false },
    { box: 2, correct: false, expectBox: 1, dueInDays: 0, mastered: false },
    { box: 3, correct: false, expectBox: 1, dueInDays: 0, mastered: false },
    { box: 4, correct: false, expectBox: 1, dueInDays: 0, mastered: false },
  ];

  it.each(cases)(
    "hộp $box + ${$correct ? 'đúng' : 'sai'} → hộp $expectBox, due +$dueInDays ngày${$mastered ? ', Mastered' : ''}",
    ({ box, correct, expectBox, dueInDays, mastered }) => {
      const next = nextLeitnerState(box, correct, now);

      expect(next.box).toBe(expectBox);
      expect(next.dueAt.getTime()).toBe(now.getTime() + dueInDays * NGAY);
      if (mastered) {
        expect(next.masteredAt?.getTime()).toBe(now.getTime());
      } else {
        expect(next.masteredAt).toBeNull();
      }
    },
  );
});

describe("TrainerService — Drill (lịch Leitner + hàng đợi ôn)", () => {
  let dir: string;
  let dbPath: string;
  let service: TrainerService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chess-drill-"));
    dbPath = join(dir, "chess.db");
    service = createTrainerService(dbPath);
  });

  afterEach(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("cold-start (US-13): line mới chưa có lịch nào → node user-move vẫn vào hàng đợi", () => {
    const line = service.createLineFromPgn("Ý", "1. e4 e5 2. Nf3 Nc6");
    const e4 = nodeAtPath(service, line.id, ["e4"]);
    const e5 = nodeAtPath(service, line.id, ["e4", "e5"]);
    const nf3 = nodeAtPath(service, line.id, ["e4", "e5", "Nf3"]);

    const queue = service.getDrillQueue();

    // Cả hai node user-move chưa từng trả lời → do lịch tạo lười, hàng đợi
    // phải nối vào bằng LEFT JOIN thay vì chỉ đọc drill_schedule.
    expect(queue.map((item) => item.nodeId)).toEqual([e4.id, nf3.id]);
    expect(e4.nodeId).not.toBeNull();
    const e4Item = queue[0];
    expect(e4Item.lineId).toBe(line.id);
    expect(e4Item.lineName).toBe("Ý");
    expect(e4Item.userColor).toBe("w");
    expect(e4Item.parentFen).toBe(START_FEN);
    expect(e4Item.expectedSans).toEqual(["e4"]);
    // Node chưa có lịch hiển thị như hộp 1, đến hạn ngay.
    expect(e4Item.box).toBe(1);
    expect(Date.parse(e4Item.dueAt)).toBeLessThanOrEqual(Date.now());
    // Nút node thứ hai: thế luyện = sau 1.e4 e5, nước chấp nhận là Nf3.
    const nf3Item = queue[1];
    expect(nf3Item.parentNodeId).toBe(e5.id);
    expect(nf3Item.parentFen).toBe(e5.fenAfter);
    expect(nf3Item.expectedSans).toEqual(["Nf3"]);

    // Trả lời xong thì chuyển sang Leitner thường (không còn "chưa lịch").
    const state = service.answerDrillItem(e4.id!, true);
    expect(state.box).toBe(2);
    expect(service.getDrillSummary()).toEqual({
      due: 1,
      mastered: 0,
      learning: 1,
    });
  });

  it("summary: node user-move chưa có lịch tính là đến hạn (cold-start)", () => {
    service.createLineFromPgn("Ý", "1. e4 e5 2. Nf3 Nc6");

    expect(service.getDrillSummary()).toEqual({
      due: 2,
      mastered: 0,
      learning: 0,
    });
  });

  it("trả lời SAI khi chưa có lịch (lazy upsert) → hộp 1, đến hạn ngay, đúng ngữ cảnh line", () => {
    const line = service.createLineFromPgn("Ý", "1. e4 e5 2. Nf3 Nc6");
    const e4 = nodeAtPath(service, line.id, ["e4"]);
    const nf3 = nodeAtPath(service, line.id, ["e4", "e5", "Nf3"]);

    const state = service.answerDrillItem(e4.id!, false);

    expect(state.box).toBe(1);
    expect(state.masteredAt).toBeNull();
    expect(Date.parse(state.dueAt)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(state.updatedAt)).toBeLessThanOrEqual(Date.now());

    // e4 vừa trả lời SAI (hộp 1, đến hạn) + Nf3 chưa từng có lịch — cả hai due.
    // SQLite ASC xếp NULL (chưa lịch) trước, nên Nf3 đứng đầu.
    const queue = service.getDrillQueue();
    expect(queue.map((item) => item.nodeId)).toEqual([nf3.id, e4.id]);
    const e4Item = queue[1];
    expect(e4Item.lineId).toBe(line.id);
    expect(e4Item.lineName).toBe("Ý");
    expect(e4Item.userColor).toBe("w");
    expect(e4Item.parentFen).toBe(START_FEN);
    expect(e4Item.expectedSans).toEqual(["e4"]);
    expect(e4Item.box).toBe(1);
    expect(service.getDrillSummary()).toEqual({
      due: 2,
      mastered: 0,
      learning: 0,
    });
  });

  it("trả lời ĐÚNG: hộp 1→2 (+1 ngày) — chưa due hôm nay; node chưa lịch vẫn due", () => {
    const line = service.createLineFromPgn("Ý", "1. e4 e5 2. Nf3 Nc6");
    const e4 = nodeAtPath(service, line.id, ["e4"]);
    const nf3 = nodeAtPath(service, line.id, ["e4", "e5", "Nf3"]);
    const now = new Date("2026-10-11T08:00:00.000Z");

    const state = service.answerDrillItem(e4.id!, true, now);

    expect(state.box).toBe(2);
    expect(state.dueAt).toBe("2026-10-12T08:00:00.000Z");
    // e4 có lịch chưa due hôm nay; Nf3 chưa lịch vẫn nằm hàng đợi.
    expect(service.getDrillQueue(now).map((item) => item.nodeId)).toEqual([
      nf3.id,
    ]);
    expect(service.getDrillSummary(now)).toEqual({
      due: 1,
      mastered: 0,
      learning: 1,
    });

    const mai = new Date(now.getTime() + 26 * 3_600_000);
    // Chưa-lich (NULL due) xếp trước, rồi đến e4 đúng hạn ngày mai.
    expect(service.getDrillQueue(mai).map((item) => item.nodeId)).toEqual([
      nf3.id,
      e4.id,
    ]);
    expect(service.getDrillSummary(mai).due).toBe(2);
  });

  it("đúng 4 lần liên tiếp → Mastered, node đó rời vòng quay vĩnh viễn", () => {
    const line = service.createLineFromPgn("Ý", "1. e4 e5 2. Nf3 Nc6");
    const e4 = nodeAtPath(service, line.id, ["e4"]);
    const nf3 = nodeAtPath(service, line.id, ["e4", "e5", "Nf3"]);
    let now = new Date("2026-10-11T08:00:00.000Z");

    const boxes: number[] = [];
    for (let turn = 0; turn < 4; turn += 1) {
      const state = service.answerDrillItem(e4.id!, true, now);
      boxes.push(state.box);
      now = state.dueAt ? new Date(Date.parse(state.dueAt)) : now;
    }
    expect(boxes).toEqual([2, 3, 4, 4]);

    const state = service.answerDrillItem(e4.id!, true, now);
    expect(state.box).toBe(4);
    expect(state.masteredAt).not.toBeNull();

    const xa = new Date(now.getTime() + 365 * 86_400_000);
    // e4 đã Mastered rời hàng đợi; Nf3 chưa từng trả lời vẫn due.
    expect(service.getDrillQueue(xa).map((item) => item.nodeId)).toEqual([
      nf3.id,
    ]);
    expect(service.getDrillSummary(xa)).toEqual({
      due: 1,
      mastered: 1,
      learning: 0,
    });
  });

  it("item đã Mastered trả lời SAI → tụt về hộp 1, quay lại hàng đợi", () => {
    const line = service.createLineFromPgn("Ý", "1. e4 e5 2. Nf3 Nc6");
    const e4 = nodeAtPath(service, line.id, ["e4"]);
    const nf3 = nodeAtPath(service, line.id, ["e4", "e5", "Nf3"]);
    let now = new Date("2026-10-11T08:00:00.000Z");
    for (let turn = 0; turn < 4; turn += 1) {
      now = new Date(Date.parse(service.answerDrillItem(e4.id!, true, now).dueAt));
    }

    const state = service.answerDrillItem(e4.id!, false, now);

    expect(state.box).toBe(1);
    expect(state.masteredAt).toBeNull();
    expect(state.dueAt).toBe(now.toISOString());
    // Chưa-lich (NULL due) trước, rồi item vừa tụt hộp.
    expect(service.getDrillQueue(now).map((item) => item.nodeId)).toEqual([
      nf3.id,
      e4.id,
    ]);
  });

  it("hàng đợi phủ nhiều line và nhánh; nhánh cùng vị trí được tính nước chấp nhận", () => {
    const sicilian = service.createLineFromPgn("Sicilian", "1. e4 c5 2. Nf3 d6");
    const sicE4 = nodeAtPath(service, sicilian.id, ["e4"]);
    const c5 = nodeAtPath(service, sicilian.id, ["e4", "c5"]);
    // Bắc nhánh sau 1...c5: 2.Nc3 song song 2.Nf3 — cả hai là nước người dùng.
    service.addBranchAndMove(sicilian.id, c5.id, "Nc3");
    const phap = service.createLineFromPgn("Pháp", "1. e4 e6 2. d4 d5");
    const e6 = nodeAtPath(service, phap.id, ["e4", "e6"]);
    const d4 = nodeAtPath(service, phap.id, ["e4", "e6", "d4"]);

    const now = new Date("2026-10-11T08:00:00.000Z");
    service.answerDrillItem(d4.id!, false, now);

    const queue = service.getDrillQueue(now);
    // Nước đối phương (e6) không bao giờ là mục drill — dù lịch tồn tại hay không.
    expect(queue.map((item) => item.nodeId)).not.toContain(e6.id);

    const e4Item = queue.find((item) => item.nodeId === sicE4.id);
    expect(e4Item?.parentFen).toBe(START_FEN);
    expect(e4Item?.expectedSans).toEqual(["e4"]);

    // Item node d4: thế cờ luyện = sau 1.e4 e6 (của line Pháp); nước chấp nhận gồm cả nhánh.
    const d4Item = queue.find((item) => item.nodeId === d4.id);
    expect(d4Item?.parentNodeId).toBe(e6.id);
    expect(d4Item?.parentFen).toBe(e6.fenAfter);
    expect(d4Item?.expectedSans).toEqual(["d4"]);
    expect(
      d4Item?.lineTree.children[0]?.children[0]?.children.map((child) => child.san),
    ).toEqual(["d4"]);

    // Node nhánh Nf3 (sau 1...c5) sai → expectedSans gồm cả Nc3 (nhánh được tính).
    const nf3 = nodeAtPath(service, sicilian.id, ["e4", "c5", "Nf3"]);
    service.answerDrillItem(nf3.id!, false, now);
    const nf3Item = service.getDrillQueue(now).find((item) => item.nodeId === nf3.id);
    expect(nf3Item?.parentFen).toBe(c5.fenAfter);
    expect(nf3Item?.expectedSans).toEqual(["Nf3", "Nc3"]);
    // Sicilian: e4, Nf3, Nc3 (3) + Pháp: e4, d4 (2) — tất cả đều do/sau khi trả lời sai.
    expect(service.getDrillSummary(now)).toEqual({
      due: 5,
      mastered: 0,
      learning: 0,
    });
  });

  it("answerDrillItem từ chối node không tồn tại", () => {
    expect(() => service.answerDrillItem(424242, true)).toThrowError(
      /không tìm thấy/i,
    );
  });

  it("deleteLine xóa luôn lịch drill của line (FK cascade)", () => {
    const line = service.createLineFromPgn("Tạm", "1. e4 e5");
    const e4 = nodeAtPath(service, line.id, ["e4"]);
    service.answerDrillItem(e4.id!, false);
    expect(service.getDrillQueue()).toHaveLength(1);

    service.deleteLine(line.id);

    expect(service.getDrillQueue()).toEqual([]);
    expect(service.getDrillSummary()).toEqual({
      due: 0,
      mastered: 0,
      learning: 0,
    });
  });
});
