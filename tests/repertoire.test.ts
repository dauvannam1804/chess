import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTrainerService } from "@/lib/trainer-service";
import type { TrainerService } from "@/lib/trainer-service";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Italian with a nested variation, per cm-pgn round-trip research notes.
const ITALIAN_PGN =
  "1. e4 e5 {king pawn} 2. Nf3 (2. f4 exf4 (2... d5) 3. Nf3) (2. d4 exd4) 2... Nc6 3. Bb5";

describe("TrainerService — Repertoire Line", () => {
  let dir: string;
  let dbPath: string;
  let service: TrainerService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chess-repertoire-"));
    dbPath = join(dir, "chess.db");
    service = createTrainerService(dbPath);
  });

  afterEach(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("tạo line từ PGN rồi liệt kê qua listLines", () => {
    const line = service.createLineFromPgn("Ý", ITALIAN_PGN);

    expect(line.id).toBeTypeOf("number");
    expect(line.name).toBe("Ý");
    expect(line.startFen).toBe(START_FEN);

    const all = service.listLines();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Ý");
    expect(all[0].id).toBe(line.id);
  });

  it("getLineTree trả về cây nước theo đúng thứ tự main line", () => {
    const line = service.createLineFromPgn("Ý", ITALIAN_PGN);

    const tree = service.getLineTree(line.id);
    expect(tree).not.toBeNull();
    expect(tree?.id).toBeNull();
    expect(tree?.fenAfter).toBe(START_FEN);

    const e4 = tree?.children[0];
    const e5 = e4?.children[0];
    const nf3 = e5?.children[0];
    const nc6 = nf3?.children[0];
    const bb5 = nc6?.children[0];
    expect(tree?.children.map((node) => node.san)).toEqual(["e4"]);
    expect([e4?.san, e5?.san, nf3?.san, nc6?.san, bb5?.san]).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bb5",
    ]);
    expect(e4?.uci).toBe("e2e4");
    expect(e4?.fenAfter).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    );
    expect(e4?.isUserMove).toBe(true);
    expect(e5?.isUserMove).toBe(false);
  });

  it("lưu variations + comments + nags + game comment vào cây", () => {
    const richPgn =
      "{Gambit Ý} 1. e4 e5 {king pawn} 2. Nf3 $1 " +
      "(2. f4 exf4 (2... d5) 3. Nf3) " +
      "(2. d4 exd4 {phản đòn trung tâm}) " +
      "2... {chương phòng: Nc6} Nc6 3. Bb5";
    const line = service.createLineFromPgn("Ý đầy đủ", richPgn);

    const tree = service.getLineTree(line.id);
    expect(tree?.startingComments).toEqual(["Gambit Ý"]);

    const e4 = tree?.children[0];
    const e5 = e4?.children[0];
    expect(e5?.comments).toEqual(["king pawn"]);
    expect(e5?.isUserMove).toBe(false);

    const nf3 = e5?.children[0];
    expect(nf3?.nags).toEqual([1]);
    // Nhánh của e5: Nf3 (chính) + 2 nước thay thế f4, d4
    expect(e5?.children.map((child) => child.san)).toEqual([
      "Nf3",
      "f4",
      "d4",
    ]);

    const f4 = e5?.children[1];
    const exf4 = f4?.children[0];
    // Biến án lồng: (2... d5) thay thế exf4 → d5 là anh em của exf4 (con của f4)
    expect(f4?.children.map((child) => child.san)).toEqual(["exf4", "d5"]);
    expect(exf4?.children.map((child) => child.san)).toEqual(["Nf3"]);

    const d4 = e5?.children[2];
    expect(d4?.children[0]?.comments).toEqual(["phản đòn trung tâm"]);

    const nc6 = nf3?.children[0];
    expect(nc6?.startingComments).toEqual(["chương phòng: Nc6"]);
  });

  it("round-trip: create → export → create lại cho cây giống hệt (bỏ id)", () => {
    const richPgn =
      "{Gambit Ý} 1. e4 e5 {king pawn} 2. Nf3 $1 " +
      "(2. f4 exf4 (2... d5) 3. Nf3) " +
      "(2. d4 exd4 {phản đòn trung tâm}) " +
      "2... {chương phòng: Nc6} Nc6 3. Bb5";
    for (const [ten, pgn] of [
      ["Ý round-trip", ITALIAN_PGN],
      ["Ý đầy đủ round-trip", richPgn],
    ] as const) {
      const line = service.createLineFromPgn(ten, pgn);

      const exported = service.exportLinePgn(line.id);
      expect(exported).toContain("(");
      expect(exported).toContain("{");

      const reimported = service.createLineFromPgn(`${ten} nhập lại`, exported);
      const stripIds = (node: ReturnType<TrainerService["getLineTree"]> & object) => {
        return JSON.parse(
          JSON.stringify(node, (_key, value) =>
            _key === "id" ? undefined : value,
          ),
        );
      };
      expect(stripIds(service.getLineTree(reimported.id)!)).toEqual(
        stripIds(service.getLineTree(line.id)!),
      );
    }
  });

  it("exportLinePgn ném lỗi với line không tồn tại, getLineTree trả về null", () => {
    expect(service.getLineTree(999)).toBeNull();
    expect(() => service.exportLinePgn(999)).toThrowError(/không tìm thấy/i);
  });

  it("addBranchAndMove: thêm nước tại thế bắt đầu, lặp lại nước cũ không tạo nhánh trùng", () => {
    const line = service.createLineFromPgn("Line tay", "");
    const tree0 = service.getLineTree(line.id);
    expect(tree0?.children).toHaveLength(0);

    const e4 = service.addBranchAndMove(line.id, null, "e4");
    expect(e4.san).toBe("e4");
    expect(e4.id).not.toBeNull();
    expect(e4.isUserMove).toBe(true);
    expect(e4.fenAfter).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    );

    const e4Again = service.addBranchAndMove(line.id, null, "e4");
    expect(e4Again.id).toBe(e4.id);

    const d4 = service.addBranchAndMove(line.id, null, "d4");
    expect(d4.id).not.toBe(e4.id);

    const tree = service.getLineTree(line.id);
    expect(tree?.children.map((child) => child.san)).toEqual(["e4", "d4"]);
  });

  it("addBranchAndMove: bắc nhánh tại một thế cờ giữa line (phản ứng nước lệ)", () => {
    const line = service.createLineFromPgn("Sicilian", "1. e4 c5 2. Nf3 d6");
    const tree = service.getLineTree(line.id);
    const e4 = tree?.children[0];
    const c5 = e4?.children[0];

    // Tại thế sau 1...c5, thêm nước lệ 2.Nc3 thay vì 2.Nf3
    const nc3 = service.addBranchAndMove(line.id, c5?.id ?? null, "Nc3");
    expect(nc3.san).toBe("Nc3");
    expect(nc3.isUserMove).toBe(true);

    const c5After = service.getLineTree(line.id)?.children[0]?.children[0];
    expect(c5After?.children.map((child) => child.san)).toEqual([
      "Nf3",
      "Nc3",
    ]);
    // Cây con của nhánh mới có thế cờ đúng
    expect(nc3.fenAfter).toBe(
      "rnbqkbnr/pp1ppppp/8/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2",
    );
  });

  it("addBranchAndMove: từ chối nước không hợp lệ, cây không đổi", () => {
    const line = service.createLineFromPgn("Sicilian", "1. e4 c5 2. Nf3 d6");
    const c5Id =
      service.getLineTree(line.id)?.children[0]?.children[0]?.id ?? null;

    expect(() => service.addBranchAndMove(line.id, c5Id, "Ke5")).toThrowError(
      /không hợp lệ/,
    );
    expect(() =>
      service.addBranchAndMove(999, null, "e4"),
    ).toThrowError(/không tìm thấy/i);

    const tree = service.getLineTree(line.id);
    expect(
      tree?.children[0]?.children[0]?.children[0]?.children.map((c) => c.san),
    ).toEqual(["d6"]);
  });

  it("deleteLine: xóa line khỏi danh sách", () => {
    const line = service.createLineFromPgn("Tạm", ITALIAN_PGN);
    service.deleteLine(line.id);

    expect(service.listLines()).toHaveLength(0);
    expect(service.getLineTree(line.id)).toBeNull();
  });
});

describe("TrainerService — Annotation (Giải thích)", () => {
  let dir: string;
  let dbPath: string;
  let service: TrainerService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chess-annotation-"));
    dbPath = join(dir, "chess.db");
    service = createTrainerService(dbPath);
  });

  afterEach(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** Node e5 của Italian PGN — mang PGN comment "king pawn". */
  function e5NodeIdOf(lineId: number): number {
    const tree = service.getLineTree(lineId);
    const e5 = tree?.children[0]?.children[0];
    if (!e5?.id) throw new Error("fixture hỏng: không tìm thấy node e5");
    return e5.id;
  }

  it("getAnnotation trả về null lúc đầu dù node có PGN comment", () => {
    const line = service.createLineFromPgn("Ý", ITALIAN_PGN);
    const e5Id = e5NodeIdOf(line.id);

    expect(service.getAnnotation(line.id, e5Id)).toBeNull();
  });

  it("setAnnotation lưu ngay và getAnnotation đọc lại đúng", () => {
    const line = service.createLineFromPgn("Ý", ITALIAN_PGN);
    const e5Id = e5NodeIdOf(line.id);

    service.setAnnotation(line.id, e5Id, "Chiếm trung tâm, mở đường cho Tượng C4.");

    expect(service.getAnnotation(line.id, e5Id)).toBe(
      "Chiếm trung tâm, mở đường cho Tượng C4.",
    );
  });

  it("setAnnotation(null) xóa giải thích", () => {
    const line = service.createLineFromPgn("Ý", ITALIAN_PGN);
    const e5Id = e5NodeIdOf(line.id);
    service.setAnnotation(line.id, e5Id, "bản nháp");

    service.setAnnotation(line.id, e5Id, null);

    expect(service.getAnnotation(line.id, e5Id)).toBeNull();
  });

  it("annotation còn nguyên sau khi mở lại service (persist vĩnh viễn)", () => {
    const line = service.createLineFromPgn("Ý", ITALIAN_PGN);
    const e5Id = e5NodeIdOf(line.id);
    service.setAnnotation(line.id, e5Id, "Nước này giữpawn để phản e4.");

    service.close();
    const reopened = createTrainerService(dbPath);
    try {
      expect(reopened.getAnnotation(line.id, e5Id)).toBe(
        "Nước này giữpawn để phản e4.",
      );
    } finally {
      reopened.close();
    }
  });

  it("annotation riêng biệt theo từng node của cùng line", () => {
    const line = service.createLineFromPgn("Ý", ITALIAN_PGN);
    const tree = service.getLineTree(line.id);
    const e4Id = tree?.children[0]?.id;
    const e5Id = e5NodeIdOf(line.id);
    if (!e4Id) throw new Error("fixture hỏng: không tìm thấy node e4");

    service.setAnnotation(line.id, e4Id, "Nước của tôi.");
    service.setAnnotation(line.id, e5Id, "Nước của đối phương.");

    expect(service.getAnnotation(line.id, e4Id)).toBe("Nước của tôi.");
    expect(service.getAnnotation(line.id, e5Id)).toBe("Nước của đối phương.");
  });

  it("từ chối node không thuộc line hoặc không tồn tại", () => {
    const line = service.createLineFromPgn("Ý", ITALIAN_PGN);
    const e5Id = e5NodeIdOf(line.id);
    service.setAnnotation(line.id, e5Id, "abc");

    expect(() => service.setAnnotation(999, e5Id, "x")).toThrowError(
      /không tìm thấy/i,
    );
    expect(() => service.setAnnotation(line.id, 424242, "x")).toThrowError(
      /không tìm thấy/i,
    );
    expect(() => service.getAnnotation(999, e5Id)).toThrowError(
      /không tìm thấy/i,
    );
    // Node thử ở line khác của cùng DB cũng bị từ chối
    const other = service.createLineFromPgn("Khác", "1. d4 d5");
    const treeOther = service.getLineTree(other.id);
    expect(() =>
      service.getAnnotation(line.id, treeOther?.children[0]?.id ?? 0),
    ).toThrowError(/không tìm thấy/i);
    expect(service.getAnnotation(line.id, e5Id)).toBe("abc");
  });
});
