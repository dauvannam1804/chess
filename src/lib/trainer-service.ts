import { createReadStream, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Readable } from "node:stream";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { Chess } from "chess.js";
import { Pgn, type PgnMove } from "cm-pgn";
import {
  lineMoves,
  positions,
  puzzleThemes,
  puzzles,
  repertoireLines,
} from "./schema";
import { parsePuzzleCsv, type ParsedPuzzle } from "./puzzle-csv";

export const STANDARD_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type SavedPosition = {
  id: number;
  fen: string;
  name: string | null;
  createdAt: string;
};

export type ThemeCount = { theme: string; count: number };

export type StoredPuzzle = {
  puzzleId: string;
  fen: string;
  moves: string;
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string[];
  gameUrl: string;
  openingTags: string[];
  insertedAt: string;
};

export type PuzzleFilter = {
  theme?: string;
  ratingMin?: number;
  ratingMax?: number;
  limit?: number;
  offset?: number;
};

export type PagedPuzzles = { total: number; items: StoredPuzzle[] };

export type PuzzleCsvSource = string | Readable | AsyncIterable<string>;

export type ImportPuzzlesOptions = {
  onProgress?: (processed: number) => void;
};

export type RepertoireLine = {
  id: number;
  name: string;
  startFen: string;
  userColor: string;
  createdAt: string;
};

export type LineNode = {
  id: number | null;
  san: string | null;
  uci: string | null;
  fenAfter: string | null;
  isUserMove: boolean;
  comments: string[];
  startingComments: string[];
  nags: number[];
  children: LineNode[];
};

const IMPORT_BATCH_SIZE = 1000;

export interface TrainerService {
  savePosition(fen: string, name?: string): SavedPosition;
  listPositions(): SavedPosition[];
  importPuzzlesFromCsv(
    source: PuzzleCsvSource,
    options?: ImportPuzzlesOptions,
  ): Promise<number>;
  countByTheme(): ThemeCount[];
  listPuzzles(filter?: PuzzleFilter): PagedPuzzles;
  createLineFromPgn(name: string, pgnText: string): RepertoireLine;
  listLines(): RepertoireLine[];
  getLineTree(lineId: number): LineNode | null;
  exportLinePgn(lineId: number): string;
  addBranchAndMove(
    lineId: number,
    parentNodeId: number | null,
    san: string,
  ): LineNode;
  getAnnotation(lineId: number, nodeId: number): string | null;
  setAnnotation(lineId: number, nodeId: number, text: string | null): void;
  deleteLine(lineId: number): void;
  close(): void;
}

export function createTrainerService(dbPath: string): TrainerService {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);

  migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });

  return {
    savePosition(fen: string, name?: string): SavedPosition {
      assertValidFen(fen);
      const result = db
        .insert(positions)
        .values({ fen, name: name ?? null })
        .returning()
        .get();
      return result;
    },
    listPositions(): SavedPosition[] {
      return db.select().from(positions).orderBy(desc(positions.id)).all();
    },
    async importPuzzlesFromCsv(
      source: PuzzleCsvSource,
      options?: ImportPuzzlesOptions,
    ): Promise<number> {
      const chunks =
        typeof source === "string"
          ? (createReadStream(source, {
              encoding: "utf8",
            }) as unknown as AsyncIterable<string>)
          : source;
      let processed = 0;
      let batch: ParsedPuzzle[] = [];
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        for await (const puzzle of parsePuzzleCsv(chunks)) {
          batch.push(puzzle);
          if (batch.length >= IMPORT_BATCH_SIZE) {
            insertPuzzleBatch(db, batch);
            processed += batch.length;
            batch = [];
            options?.onProgress?.(processed);
          }
        }
        if (batch.length > 0) {
          insertPuzzleBatch(db, batch);
          processed += batch.length;
          options?.onProgress?.(processed);
        }
        sqlite.exec("COMMIT");
      } catch (cause) {
        try {
          sqlite.exec("ROLLBACK");
        } catch {
          // giao dịch đã tự rollback — bỏ qua lỗi phụ
        }
        throw cause;
      }
      return processed;
    },
    countByTheme(): ThemeCount[] {
      return db
        .select({ theme: puzzleThemes.theme, count: count() })
        .from(puzzleThemes)
        .groupBy(puzzleThemes.theme)
        .orderBy(desc(count()), asc(puzzleThemes.theme))
        .all();
    },
    listPuzzles(filter: PuzzleFilter = {}): PagedPuzzles {
      const {
        theme,
        ratingMin,
        ratingMax,
        limit = 50,
        offset = 0,
      } = filter;
      const conditions = [];
      if (theme !== undefined) {
        conditions.push(
          inArray(
            puzzles.puzzleId,
            db
              .select({ id: puzzleThemes.puzzleId })
              .from(puzzleThemes)
              .where(eq(puzzleThemes.theme, theme)),
          ),
        );
      }
      if (ratingMin !== undefined) {
        conditions.push(gte(puzzles.rating, ratingMin));
      }
      if (ratingMax !== undefined) {
        conditions.push(lte(puzzles.rating, ratingMax));
      }
      const where = conditions.length
        ? conditions.length === 1
          ? conditions[0]
          : and(...conditions)
        : undefined;
      const total =
        db.select({ value: count() }).from(puzzles).where(where).get()?.value ??
        0;
      const items = db
        .select()
        .from(puzzles)
        .where(where)
        .orderBy(asc(puzzles.rating), asc(puzzles.puzzleId))
        .limit(limit)
        .offset(offset)
        .all();
      return { total, items };
    },
    createLineFromPgn(name: string, pgnText: string): RepertoireLine {
      const parsed = parsePgnOrThrow(pgnText);
      const startFen = pgnStartFen(parsed);
      const userColor = fenTurn(startFen);
      const gameComments = parsed.gameComment ?? [];
      const history = parsed.history;

      return db.transaction((tx) => {
        const line = tx
          .insert(repertoireLines)
          .values({
            name,
            startFen,
            userColor,
            gameCommentsJson: JSON.stringify(gameComments),
          })
          .returning()
          .get();
        persistMoveArray(tx, line.id, history.moves, null, 1, userColor);
        return toRepertoireLine(line);
      });
    },
    listLines(): RepertoireLine[] {
      return db
        .select()
        .from(repertoireLines)
        .orderBy(asc(repertoireLines.id))
        .all()
        .map(toRepertoireLine);
    },
    getLineTree(lineId: number): LineNode | null {
      const line = db
        .select()
        .from(repertoireLines)
        .where(eq(repertoireLines.id, lineId))
        .get();
      if (!line) return null;

      const rows = db
        .select()
        .from(lineMoves)
        .where(eq(lineMoves.lineId, lineId))
        .all();

      const nodesById = new Map<number, LineNode>();
      const siblingOrderById = new Map<number, number>();
      for (const row of rows) {
        nodesById.set(row.id, toLineNode(row));
        siblingOrderById.set(row.id, row.siblingOrder);
      }

      const root: LineNode = {
        id: null,
        san: null,
        uci: null,
        fenAfter: line.startFen,
        isUserMove: false,
        comments: [],
        startingComments: JSON.parse(line.gameCommentsJson) as string[],
        nags: [],
        children: [],
      };
      for (const row of rows) {
        const node = nodesById.get(row.id);
        if (!node) continue;
        const parent = row.parentId === null ? root : nodesById.get(row.parentId);
        parent?.children.push(node);
      }
      for (const node of [root, ...nodesById.values()]) {
        node.children.sort(
          (a, b) =>
            (a.id !== null ? (siblingOrderById.get(a.id) ?? 0) : 0) -
            (b.id !== null ? (siblingOrderById.get(b.id) ?? 0) : 0),
        );
      }
      return root;
    },
    exportLinePgn(lineId: number): string {
      const line = db
        .select()
        .from(repertoireLines)
        .where(eq(repertoireLines.id, lineId))
        .get();
      if (!line) {
        throw new Error(`Không tìm thấy Dòng khai cuộc #${lineId}.`);
      }
      const tree = this.getLineTree(lineId);
      if (!tree) {
        throw new Error(`Không tìm thấy Dòng khai cuộc #${lineId}.`);
      }

      const pgn = new Pgn("");
      pgn.header.tags["Event"] = line.name;
      if (line.startFen !== STANDARD_START_FEN) {
        pgn.header.tags["SetUp"] = "1";
        pgn.header.tags["FEN"] = line.startFen;
      }
      if (tree.startingComments.length > 0) {
        pgn.history.gameComment = tree.startingComments;
      }
      attachChildrenToHistory(pgn.history, tree.children, null, rootPlyBase(line.startFen));
      return pgn.render(true, true, true);
    },
    addBranchAndMove(
      lineId: number,
      parentNodeId: number | null,
      san: string,
    ): LineNode {
      const line = db
        .select()
        .from(repertoireLines)
        .where(eq(repertoireLines.id, lineId))
        .get();
      if (!line) {
        throw new Error(`Không tìm thấy Dòng khai cuộc #${lineId}.`);
      }

      let parentFen = line.startFen;
      if (parentNodeId !== null) {
        const parent = db
          .select({ fenAfter: lineMoves.fenAfter })
          .from(lineMoves)
          .where(and(eq(lineMoves.id, parentNodeId), eq(lineMoves.lineId, lineId)))
          .get();
        if (!parent) {
          throw new Error(
            `Không tìm thấy node #${parentNodeId} trong Dòng khai cuộc #${lineId}.`,
          );
        }
        parentFen = parent.fenAfter;
      }

      const chess = new Chess(parentFen);
      let move;
      try {
        move = chess.move(san);
      } catch (cause) {
        throw new Error(
          `Nước đi không hợp lệ từ thế cờ ${parentFen}: ${san}`,
          { cause },
        );
      }
      const fenAfter = fenAfterMoveNormalized(chess);

      const children = db
        .select()
        .from(lineMoves)
        .where(
          parentNodeId === null
            ? and(eq(lineMoves.lineId, lineId), isNull(lineMoves.parentId))
            : and(eq(lineMoves.lineId, lineId), eq(lineMoves.parentId, parentNodeId)),
        )
        .all();
      const existing = children.find((child) => child.san === move.san);
      if (existing) return toLineNode(existing);

      const maxOrder = children.reduce((max, child) => Math.max(max, child.siblingOrder), 0);
      const inserted = db
        .insert(lineMoves)
        .values({
          lineId,
          parentId: parentNodeId,
          san: move.san,
          uci: move.lan,
          fenAfter,
          isUserMove: moverOfFenAfter(fenAfter) === line.userColor,
          siblingOrder: maxOrder + 1,
        } satisfies InsertableLineMove)
        .returning()
        .get();
      return toLineNode(inserted);
    },
    getAnnotation(lineId: number, nodeId: number): string | null {
      const row = db
        .select({ annotation: lineMoves.annotation })
        .from(lineMoves)
        .where(and(eq(lineMoves.id, nodeId), eq(lineMoves.lineId, lineId)))
        .get();
      if (!row) {
        throw new Error(
          `Không tìm thấy node #${nodeId} trong Dòng khai cuộc #${lineId}.`,
        );
      }
      return row.annotation;
    },
    setAnnotation(lineId: number, nodeId: number, text: string | null): void {
      const result = db
        .update(lineMoves)
        .set({ annotation: text })
        .where(and(eq(lineMoves.id, nodeId), eq(lineMoves.lineId, lineId)))
        .run();
      if (result.changes === 0) {
        throw new Error(
          `Không tìm thấy node #${nodeId} trong Dòng khai cuộc #${lineId}.`,
        );
      }
    },
    deleteLine(lineId: number): void {
      db.transaction((tx) => {
        tx.delete(lineMoves).where(eq(lineMoves.lineId, lineId)).run();
        tx.delete(repertoireLines).where(eq(repertoireLines.id, lineId)).run();
      });
    },
    close(): void {
      sqlite.close();
    },
  };
}

type DrizzleDb = ReturnType<typeof drizzle>;

function insertPuzzleBatch(db: DrizzleDb, batch: ParsedPuzzle[]): void {
  db.insert(puzzles)
    .values(batch)
    .onConflictDoUpdate({
      target: puzzles.puzzleId,
      set: {
        fen: sql`excluded.fen`,
        moves: sql`excluded.moves`,
        rating: sql`excluded.rating`,
        ratingDeviation: sql`excluded.rating_deviation`,
        popularity: sql`excluded.popularity`,
        nbPlays: sql`excluded.nb_plays`,
        themes: sql`excluded.themes`,
        gameUrl: sql`excluded.game_url`,
        openingTags: sql`excluded.opening_tags`,
      },
    })
    .run();
  const themeRows = batch.flatMap((puzzle) =>
    puzzle.themes.map((theme) => ({ puzzleId: puzzle.puzzleId, theme })),
  );
  if (themeRows.length > 0) {
    db.insert(puzzleThemes)
      .values(themeRows)
      .onConflictDoNothing({
        target: [puzzleThemes.puzzleId, puzzleThemes.theme],
      })
      .run();
  }
}

export function getDefaultDbPath(): string {
  return process.env.CHESS_DB_PATH ?? join(process.cwd(), "data", "chess.db");
}

function assertValidFen(fen: string): void {
  try {
    new Chess(fen);
  } catch (cause) {
    throw new Error(`FEN không hợp lệ: ${fen}`, { cause });
  }
}

function parsePgnOrThrow(pgnText: string): Pgn {
  try {
    return new Pgn(pgnText);
  } catch (cause) {
    throw new Error(
      "PGN không hợp lệ — không phân tích được chuỗi PGN này.",
      { cause },
    );
  }
}

function pgnStartFen(parsed: Pgn): string {
  if (parsed.header.tags["SetUp"] === "1" && parsed.header.tags["FEN"]) {
    return parsed.header.tags["FEN"];
  }
  return STANDARD_START_FEN;
}

function fenTurn(fen: string): string {
  const turn = fen.split(" ")[1];
  if (turn !== "w" && turn !== "b") {
    throw new Error(`FEN không hợp lệ: ${fen}`);
  }
  return turn;
}

function moverOfFenAfter(fenAfter: string): string {
  const turn = fenTurn(fenAfter);
  return turn === "w" ? "b" : "w";
}

/**
 * chess.js chỉ ghi ô en-passant khi nước ăn qua đường là hợp lệ, còn
 * chess.mjs (dùng bởi cm-pgn) luôn ghi sau nước tốt 2 ô. Chuẩn hóa về
 * kiểu chess.mjs để FEN nhất quán giữa line import PGN và line soạn tay.
 */
function fenAfterMoveNormalized(chess: Chess): string {
  const fen = chess.fen();
  const last = chess.history({ verbose: true }).at(-1);
  if (!last || last.piece !== "p") return fen;
  const fromRank = Number(last.from[1]);
  const toRank = Number(last.to[1]);
  if (Math.abs(toRank - fromRank) !== 2) return fen;
  const parts = fen.split(" ");
  if (parts[3] !== "-") return fen;
  parts[3] = `${last.to[0]}${(fromRank + toRank) / 2}`;
  return parts.join(" ");
}

type InsertableLineMove = typeof lineMoves.$inferInsert;
type Tx = Parameters<Parameters<ReturnType<typeof drizzle>["transaction"]>[0]>[0];

/**
 * Lưu một chuỗi nước cm-pgn (một biến án) thành chuỗi node trong DB.
 * Conventions: node cha = thế cờ TRƯỚC nước; các con của một node = các nước
 * có thể đi sau node đó. Trong cm-pgn, `M.variations` là các nước THAY THẾ M
 * (bắt đầu từ thế cờ trước M) — nên chúng thành anh em của M trong DB.
 */
function persistMoveArray(
  tx: Tx,
  lineId: number,
  moves: PgnMove[],
  parentNodeId: number | null,
  firstSiblingOrder: number,
  userColor: string,
): void {
  let previousNodeId = parentNodeId;
  for (const [index, move] of moves.entries()) {
    const myParentNodeId = index === 0 ? parentNodeId : previousNodeId;
    const mySiblingOrder = index === 0 ? firstSiblingOrder : 1;
    move.variations.forEach((variation, variationIndex) => {
      persistMoveArray(
        tx,
        lineId,
        variation,
        myParentNodeId,
        mySiblingOrder + 1 + variationIndex,
        userColor,
      );
    });
    const inserted = tx
      .insert(lineMoves)
      .values({
        lineId,
        parentId: myParentNodeId,
        san: move.san,
        uci: move.uci,
        fenAfter: move.fen,
        isUserMove: moverOfFenAfter(move.fen) === userColor,
        siblingOrder: mySiblingOrder,
        commentsJson: JSON.stringify(move.comments ?? []),
        startingCommentsJson: JSON.stringify(move.startingComments ?? []),
        nagsJson: JSON.stringify(move.nags ?? []),
      } satisfies InsertableLineMove)
      .returning()
      .get();
    previousNodeId = inserted.id;
  }
}

function toRepertoireLine(row: typeof repertoireLines.$inferSelect): RepertoireLine {
  return {
    id: row.id,
    name: row.name,
    startFen: row.startFen,
    userColor: row.userColor,
    createdAt: row.createdAt,
  };
}

function toLineNode(row: typeof lineMoves.$inferSelect): LineNode {
  return {
    id: row.id,
    san: row.san,
    uci: row.uci,
    fenAfter: row.fenAfter,
    isUserMove: row.isUserMove,
    comments: JSON.parse(row.commentsJson) as string[],
    startingComments: JSON.parse(row.startingCommentsJson) as string[],
    nags: JSON.parse(row.nagsJson) as number[],
    children: [],
  };
}

type MoveLineNode = LineNode & { san: string; uci: string; fenAfter: string };

function assertMoveNode(node: LineNode): asserts node is MoveLineNode {
  if (node.san === null || node.uci === null || node.fenAfter === null) {
    throw new Error("Node nước đi thiếu san/uci/fenAfter (dữ liệu DB hỏng).");
  }
}

/**
 * Dựng lại cây cm-pgn từ cây DB để render ra PGN.
 * Chiều ngược lại của persistMoveArray: con đầu của node X là nước chính,
 * các con sau là nước thay thế con đầu — cm-pgn muốn chúng trong
 * `variations` của NƯỚC CHÍNH (render ra "(...)" ngay sau nước chính).
 */
function attachChildrenToHistory(
  history: Pgn["history"],
  children: LineNode[],
  cmParent: PgnMove | null,
  parentPly: number,
): void {
  if (children.length === 0) return;
  const [first, ...extras] = children;
  assertMoveNode(first);

  const cmFirst = history.addMove(first.san, cmParent);
  cmFirst.ply = parentPly + 1;
  decorateCmMove(cmFirst, first);
  attachChildrenToHistory(history, first.children, cmFirst, parentPly + 1);

  for (const extra of extras) {
    assertMoveNode(extra);
    const variationArray: PgnMove[] = [];
    cmFirst.variations.push(variationArray);
    const cmExtra: PgnMove = {
      san: extra.san,
      uci: extra.uci,
      from: extra.uci.slice(0, 2),
      to: extra.uci.slice(2, 4),
      promotion: extra.uci.length > 4 ? extra.uci.slice(4) : undefined,
      fen: extra.fenAfter,
      ply: parentPly + 1,
      previous: cmParent,
      next: null,
      variation: variationArray,
      variations: [],
    };
    decorateCmMove(cmExtra, extra);
    variationArray.push(cmExtra);
    attachChildrenToHistory(history, extra.children, cmExtra, parentPly + 1);
  }
}

function decorateCmMove(cmMove: PgnMove, node: LineNode): void {
  if (node.comments.length > 0) cmMove.comments = node.comments;
  if (node.startingComments.length > 0) cmMove.startingComments = node.startingComments;
  if (node.nags.length > 0) cmMove.nags = node.nags;
}

function rootPlyBase(startFen: string): number {
  const parts = startFen.split(" ");
  const fullmove = Number.parseInt(parts[5] ?? "1", 10);
  return (Number.isNaN(fullmove) ? 1 : fullmove - 1) * 2 + (parts[1] === "b" ? 1 : 0);
}
