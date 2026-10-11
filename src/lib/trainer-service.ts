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
  getTableColumns,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  alias,
  type SQLiteColumn,
  type SQLiteTable,
} from "drizzle-orm/sqlite-core";
import { Chess } from "chess.js";
import { Pgn, type PgnMove } from "cm-pgn";
import {
  drillSchedule,
  endgamePositions,
  endgameSchedule,
  gameAnalysis,
  games,
  lineMoves,
  positions,
  puzzleAttempts,
  puzzleThemes,
  puzzles,
  repertoireLines,
} from "./schema";
import {
  ENDGAME_CATALOG,
  type SeededEndgamePosition,
} from "./endgame/catalog";
import {
  DEFAULT_MAX_ENDGAME_MOVES,
  type EndgameGoal,
  type EndgameSource,
  type EndgameUserColor,
} from "./endgame/outcome";
import { parsePuzzleCsv, type ParsedPuzzle } from "./puzzle-csv";
import { uciToMove } from "./uci-move";
import { STANDARD_START_FEN } from "./chess-constants";
import type { MoveFlag } from "./review/flag-mistakes";
import {
  MAX_ENGINE_STRENGTH,
  MIN_ENGINE_STRENGTH,
} from "./engine/strength";
import { GAME_RESULTS, type GameResult } from "./play/game-result";

export { STANDARD_START_FEN };

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

export type PuzzleAttempt = {
  id: number;
  puzzleId: string;
  attemptedAt: string;
  solved: boolean;
};

export type ThemeStat = { theme: string; solved: number; attempted: number };

export type { GameResult };

export type SaveGameInput = {
  pgn: string;
  result: GameResult;
  userColor: string;
  engineStrength: number;
  finalFen: string;
};

export type SavedGame = {
  id: number;
  pgn: string;
  result: GameResult;
  userColor: string;
  engineStrength: number;
  finalFen: string;
  playedAt: string;
};

export type GamePage = { total: number; items: SavedGame[] };

export type ListGamesOptions = {
  limit?: number;
  offset?: number;
};

/** Eval một thế TRƯỚC mỗi nước (White-POV — xem hợp đồng `Engine`). */
export type PositionEval = {
  fen: string;
  evalCp: number | null;
  mate: number | null;
};

export type GameAnalysis = {
  gameId: number;
  evals: PositionEval[];
  flags: MoveFlag[];
  depth: number;
  analysedAt: string;
};

export type SaveGameAnalysisInput = {
  gameId: number;
  evals: PositionEval[];
  flags: MoveFlag[];
  depth: number;
};

export type RandomBatchFilter = {
  theme?: string;
  ratingMin?: number;
  ratingMax?: number;
};

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

/**
 * Một mục trong Daily Review Queue (TT-07).
 *
 * Ngữ nghĩa node drillable (TT-10 tàn cuộc sẽ tái dùng pattern này):
 * một Drill item gắn với MỘT node `line_moves` có `is_user_move = 1` — chính
 * là nước trả lời của người dùng. Thế cờ để luyện là FEN SAU node CHA của
 * node đó (hoặc `start_fen` nếu cha là root ảo), vì "nước trả lời" thuộc về
 * thế cờ TRƯỚC nó. Các nước chấp nhận được tại thế cờ đó = toàn bộ con của
 * node cha (bắc nhánh được tính — so theo SAN), theo thứ tự sibling_order.
 * `lineTree` kèm theo để UI tự đi tiếp line sau khi đối phương phản hồi.
 */
export type DrillItem = {
  nodeId: number;
  parentNodeId: number | null;
  lineId: number;
  lineName: string;
  userColor: string;
  box: number;
  dueAt: string;
  parentFen: string;
  expectedSans: string[];
  lineTree: LineNode;
};

export type DrillScheduleState = {
  nodeId: number;
  box: number;
  dueAt: string;
  masteredAt: string | null;
  updatedAt: string;
};

export type DrillSummary = { due: number; mastered: number; learning: number };

/**
 * Mức thuộc của một Dòng khai cuộc (US-21) suy từ node con: line "Thuộc"
 * khi TOÀN BỘ node user-move của nó đã Mastered (xem `isLineMastered`).
 */
export type LineMastery = {
  lineId: number;
  /** Tổng số node user-move trong line. */
  userMoveCount: number;
  /** Số node user-move đã Mastered. */
  masteredCount: number;
};

/** Line "Thuộc": có ít nhất một node user-move và tất cả đã Mastered. */
export function isLineMastered(mastery: LineMastery): boolean {
  return (
    mastery.userMoveCount > 0 && mastery.masteredCount === mastery.userMoveCount
  );
}

export type { EndgameGoal, EndgameSource, EndgameUserColor };

/**
 * Một Thế tàn cuộc (TT-10) kèm trạng thái SRS Leitner của nó. Trạng thái
 * lịch nullable vì lịch tạo LƯỜI — thế chưa luyện lần nào thì chưa có row
 * `endgame_schedule`.
 */
export type EndgamePosition = {
  id: number;
  name: string;
  fen: string;
  goal: EndgameGoal;
  userColor: EndgameUserColor;
  maxMoves: number;
  source: EndgameSource;
  createdAt: string;
  box: number | null;
  dueAt: string | null;
  masteredAt: string | null;
};

export type EndgameScheduleState = {
  positionId: number;
  box: number;
  dueAt: string;
  masteredAt: string | null;
  updatedAt: string;
};

/** Mục trong hàng đợi ôn tàn cuộc: do đã trả lời nên lịch luôn tồn tại. */
export type EndgameQueueItem = {
  positionId: number;
  name: string;
  fen: string;
  goal: EndgameGoal;
  userColor: EndgameUserColor;
  maxMoves: number;
  box: number;
  dueAt: string;
};

export type AddEndgamePositionInput = {
  name: string;
  fen: string;
  goal: EndgameGoal;
  userColor: EndgameUserColor;
  maxMoves?: number;
};

export const LEITNER_INTERVALS_DAYS = { 1: 1, 2: 3, 3: 7 } as const;

/**
 * Một bước Leitner thuần (không DB) để test bảng: đúng thì thăng hộp
 * (1 → +1 ngày, 2 → +3 ngày, 3 → +7 ngày, 4 → Mastered); SAI thì tụt về
 * hộp 1, hết Mastered, đến hạn ngay. `dueAt` của item Mastered không còn
 * ý nghĩa (hàng đợi lọc theo `mastered_at IS NULL`) nên đặt = now.
 */
export function nextLeitnerState(
  box: number,
  correct: boolean,
  now: Date,
): { box: number; dueAt: Date; masteredAt: Date | null } {
  if (!correct) {
    return { box: 1, dueAt: now, masteredAt: null };
  }
  const currentBox = Math.min(4, Math.max(1, Math.floor(box)));
  if (currentBox >= 4) {
    return { box: 4, dueAt: now, masteredAt: now };
  }
  return {
    box: currentBox + 1,
    dueAt: addDays(now, LEITNER_INTERVALS_DAYS[currentBox as 1 | 2 | 3]),
    masteredAt: null,
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

type LeitnerNext = ReturnType<typeof nextLeitnerState>;

type LeitnerRow = {
  box: number;
  dueAt: Date;
  masteredAt: Date | null;
  updatedAt: Date;
};

/**
 * Hình dạng upsert Leitner dùng chung cho `drill_schedule` (TT-07) và
 * `endgame_schedule` (TT-10): hai bảng khác nhau ở khóa lịch nhưng cùng bộ
 * cột + cùng phép toán `nextLeitnerState` (hộp khởi đầu 1 nếu chưa có lịch).
 */
function leitnerUpsertParts(
  existingBox: number | undefined,
  correct: boolean,
  now: Date,
): { next: LeitnerNext; row: LeitnerRow } {
  const next = nextLeitnerState(existingBox ?? 1, correct, now);
  return {
    next,
    row: {
      box: next.box,
      dueAt: next.dueAt,
      masteredAt: next.masteredAt,
      updatedAt: now,
    },
  };
}

/** Phần ISO chung của DrillScheduleState / EndgameScheduleState trả client. */
function scheduleStateFields(next: LeitnerNext, now: Date) {
  return {
    box: next.box,
    dueAt: next.dueAt.toISOString(),
    masteredAt: next.masteredAt ? next.masteredAt.toISOString() : null,
    updatedAt: now.toISOString(),
  };
}

const IMPORT_BATCH_SIZE = 1000;

/** Bảng NỘI DUNG không xuất kèm backup — nhập lại từ Lichess dump (ADR-0002). */
export const BACKUP_EXCLUDED_TABLES = ["puzzles", "puzzle_themes"] as const;

export type BackupPosition = {
  id: number;
  fen: string;
  name: string | null;
  createdAt: string;
};

export type BackupPuzzleAttempt = {
  id: number;
  puzzleId: string;
  attemptedAt: string;
  solved: boolean;
};

export type BackupRepertoireLine = {
  id: number;
  name: string;
  startFen: string;
  userColor: string;
  gameCommentsJson: string;
  createdAt: string;
};

export type BackupLineMove = {
  id: number;
  lineId: number;
  parentId: number | null;
  san: string;
  uci: string;
  fenAfter: string;
  isUserMove: boolean;
  siblingOrder: number;
  commentsJson: string;
  startingCommentsJson: string;
  nagsJson: string;
  annotation: string | null;
};

export type BackupGame = {
  id: number;
  pgn: string;
  result: GameResult;
  userColor: string;
  engineStrength: number;
  finalFen: string;
  playedAt: string;
};

export type BackupGameAnalysis = {
  id: number;
  gameId: number;
  evalsJson: string;
  flagsJson: string;
  depth: number;
  analysedAt: string;
};

export type BackupDrillSchedule = {
  id: number;
  nodeId: number;
  lineId: number;
  box: number;
  dueAt: string;
  masteredAt: string | null;
  updatedAt: string;
};

export type BackupEndgamePosition = {
  id: number;
  name: string;
  fen: string;
  goal: EndgameGoal;
  userColor: EndgameUserColor;
  maxMoves: number;
  source: EndgameSource;
  createdAt: string;
};

export type BackupEndgameSchedule = {
  id: number;
  positionId: number;
  box: number;
  dueAt: string;
  masteredAt: string | null;
  updatedAt: string;
};

export type BackupTables = {
  positions: BackupPosition[];
  puzzleAttempts: BackupPuzzleAttempt[];
  repertoireLines: BackupRepertoireLine[];
  lineMoves: BackupLineMove[];
  drillSchedule: BackupDrillSchedule[];
  games: BackupGame[];
  gameAnalysis: BackupGameAnalysis[];
  endgamePositions: BackupEndgamePosition[];
  endgameSchedule: BackupEndgameSchedule[];
};

/** File backup JSON (US-35) — payload thuần JSON, truyền mạng/ghi file được. */
export type BackupFile = {
  format: "chess-trainer-backup";
  version: 1;
  exportedAt: string;
  excluded: {
    tables: readonly string[];
    reason: string;
  };
  tables: BackupTables;
};

const BACKUP_EXCLUDED_REASON =
  "Nội dung Puzzle (bảng puzzles + puzzle_themes) không xuất kèm — nhập lại từ Lichess dump theo ADR-0002, không phải dữ liệu người dùng.";

export interface TrainerService {
  savePosition(fen: string, name?: string): SavedPosition;
  listPositions(): SavedPosition[];
  importPuzzlesFromCsv(
    source: PuzzleCsvSource,
    options?: ImportPuzzlesOptions,
  ): Promise<number>;
  countByTheme(): ThemeCount[];
  listPuzzles(filter?: PuzzleFilter): PagedPuzzles;
  recordAttempt(puzzleId: string, solved: boolean): PuzzleAttempt;
  getThemeStats(): ThemeStat[];
  getRandomBatch(filter?: RandomBatchFilter, n?: number): StoredPuzzle[];
  saveGame(input: SaveGameInput): SavedGame;
  listGames(options?: ListGamesOptions): GamePage;
  getGame(id: number): SavedGame | null;
  saveGameAnalysis(input: SaveGameAnalysisInput): GameAnalysis;
  getGameAnalysis(gameId: number): GameAnalysis | null;
  isGameAnalysed(gameId: number): boolean;
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
  getDrillQueue(now?: Date): DrillItem[];
  answerDrillItem(nodeId: number, correct: boolean, now?: Date): DrillScheduleState;
  getDrillSummary(now?: Date): DrillSummary;
  getLineMastery(): LineMastery[];
  seedEndgameCatalog(): number;
  exportBackup(): BackupFile;
  importBackup(data: unknown): Promise<{ imported: Record<string, number> }>;
  listEndgamePositions(): EndgamePosition[];
  addEndgamePosition(input: AddEndgamePositionInput): EndgamePosition;
  answerEndgameItem(
    positionId: number,
    correct: boolean,
    now?: Date,
  ): EndgameScheduleState;
  getEndgameQueue(now?: Date): EndgameQueueItem[];
  deleteEndgamePosition(id: number): void;
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
      const where = puzzleFilterWhere(db, { theme, ratingMin, ratingMax });
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
    recordAttempt(puzzleId: string, solved: boolean): PuzzleAttempt {
      const puzzle = db
        .select({ puzzleId: puzzles.puzzleId })
        .from(puzzles)
        .where(eq(puzzles.puzzleId, puzzleId))
        .get();
      if (!puzzle) {
        throw new Error(`Puzzle "${puzzleId}" không tồn tại trong database.`);
      }
      return db
        .insert(puzzleAttempts)
        .values({ puzzleId, solved })
        .returning()
        .get();
    },
    getThemeStats(): ThemeStat[] {
      const rows = db
        .select({
          theme: puzzleThemes.theme,
          solved: sql<string>`SUM(CASE WHEN ${puzzleAttempts.solved} THEN 1 ELSE 0 END)`,
          attempted: count(),
        })
        .from(puzzleAttempts)
        .innerJoin(puzzleThemes, eq(puzzleAttempts.puzzleId, puzzleThemes.puzzleId))
        .groupBy(puzzleThemes.theme)
        .orderBy(desc(count()), asc(puzzleThemes.theme))
        .all();
      return rows.map((row) => ({
        theme: row.theme,
        solved: Number(row.solved ?? 0),
        attempted: Number(row.attempted),
      }));
    },
    getRandomBatch(filter: RandomBatchFilter = {}, n = 10): StoredPuzzle[] {
      const where = puzzleFilterWhere(db, filter);
      return db
        .select()
        .from(puzzles)
        .where(where)
        .orderBy(sql`RANDOM()`)
        .limit(Math.max(0, Math.floor(n)))
        .all();
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
    /**
     * Daily Review Queue (US-13): mọi node user-move CHƯA CÓ lịch (cold-start
     * — line mới nhập phải vào vòng quay ngay) hoặc đã đến hạn mà chưa
     * Mastered. Lịch là LEFT JOIN nên node chưa trả lời lần nào vẫn vào được
     * hàng đợi; node đã lịch thì theo phép Leitner như cũ.
     */
    getDrillQueue(now: Date = new Date()): DrillItem[] {
      const parentMoves = alias(lineMoves, "parent_move");
      const rows = db
        .select({
          nodeId: lineMoves.id,
          parentNodeId: lineMoves.parentId,
          lineId: lineMoves.lineId,
          lineName: repertoireLines.name,
          userColor: repertoireLines.userColor,
          startFen: repertoireLines.startFen,
          parentFen: sql<string>`COALESCE(${parentMoves.fenAfter}, ${repertoireLines.startFen})`,
          box: drillSchedule.box,
          dueAt: drillSchedule.dueAt,
        })
        .from(lineMoves)
        .leftJoin(drillSchedule, eq(drillSchedule.nodeId, lineMoves.id))
        .innerJoin(repertoireLines, eq(repertoireLines.id, lineMoves.lineId))
        .leftJoin(parentMoves, eq(parentMoves.id, lineMoves.parentId))
        .where(
          and(
            eq(lineMoves.isUserMove, true),
            or(
              isNull(drillSchedule.nodeId),
              and(
                isNull(drillSchedule.masteredAt),
                lte(drillSchedule.dueAt, now),
              ),
            ),
          ),
        )
        .orderBy(asc(drillSchedule.dueAt), asc(drillSchedule.box), asc(lineMoves.id))
        .all();

      if (rows.length === 0) return [];

      // Nước chấp nhận được = toàn bộ con của node cha (hoặc con của root
      // ảo khi parentNodeId null), theo sibling_order — nhánh được tính.
      const branchParentIds = [
        ...new Set(
          rows.flatMap((row) => (row.parentNodeId === null ? [] : [row.parentNodeId])),
        ),
      ];
      const rootLineIds = [
        ...new Set(rows.flatMap((row) => (row.parentNodeId === null ? [row.lineId] : []))),
      ];
      const children = db
        .select({
          lineId: lineMoves.lineId,
          parentId: lineMoves.parentId,
          san: lineMoves.san,
          siblingOrder: lineMoves.siblingOrder,
        })
        .from(lineMoves)
        .where(
          or(
            branchParentIds.length > 0 ? inArray(lineMoves.parentId, branchParentIds) : undefined,
            rootLineIds.length > 0
              ? and(isNull(lineMoves.parentId), inArray(lineMoves.lineId, rootLineIds))
              : undefined,
          ),
        )
        .orderBy(asc(lineMoves.siblingOrder), asc(lineMoves.id))
        .all();

      const expectedByParent = new Map<string, string[]>();
      for (const child of children) {
        const key = `${child.lineId}:${child.parentId ?? "root"}`;
        const sans = expectedByParent.get(key) ?? [];
        sans.push(child.san);
        expectedByParent.set(key, sans);
      }

      const treesByLine = new Map<number, LineNode>();
      for (const lineId of new Set(rows.map((row) => row.lineId))) {
        const tree = this.getLineTree(lineId);
        if (tree) treesByLine.set(lineId, tree);
      }

      return rows.map((row) => ({
        nodeId: row.nodeId,
        parentNodeId: row.parentNodeId,
        lineId: row.lineId,
        lineName: row.lineName,
        userColor: row.userColor,
        // Node chưa có lịch hiển thị như hộp 1, đến hạn ngay (US-13).
        box: row.box ?? 1,
        dueAt: row.dueAt ? row.dueAt.toISOString() : now.toISOString(),
        parentFen: row.parentFen,
        expectedSans:
          expectedByParent.get(`${row.lineId}:${row.parentNodeId ?? "root"}`) ?? [],
        lineTree: treesByLine.get(row.lineId) ?? {
          id: null,
          san: null,
          uci: null,
          fenAfter: row.startFen,
          isUserMove: false,
          comments: [],
          startingComments: [],
          nags: [],
          children: [],
        },
      }));
    },
    /**
     * Một lượt trả lời Drill (Leitner). Lịch tạo LƯỜI: lần đầu node được
     * trả lời sẽ upsert row `drill_schedule` (box khởi đầu 1 nếu chưa có).
     */
    answerDrillItem(
      nodeId: number,
      correct: boolean,
      now: Date = new Date(),
    ): DrillScheduleState {
      const node = db
        .select({ id: lineMoves.id, lineId: lineMoves.lineId })
        .from(lineMoves)
        .where(eq(lineMoves.id, nodeId))
        .get();
      if (!node) {
        throw new Error(`Không tìm thấy node #${nodeId} trong line_moves.`);
      }
      const existing = db
        .select({ box: drillSchedule.box })
        .from(drillSchedule)
        .where(eq(drillSchedule.nodeId, nodeId))
        .get();
      const { next, row } = leitnerUpsertParts(existing?.box, correct, now);
      db.insert(drillSchedule)
        .values({ nodeId, lineId: node.lineId, ...row })
        .onConflictDoUpdate({
          target: drillSchedule.nodeId,
          set: row,
        })
        .run();
      return { nodeId, ...scheduleStateFields(next, now) };
    },
    getDrillSummary(now: Date = new Date()): DrillSummary {
      // Đếm trong JS để khỏi viết tay mệnh đề so sánh timestamp (cột integer
      // mode "timestamp") — số node lịch là nhỏ với app local. Đếm trên toàn
      // bộ node user-move (LEFT JOIN lịch): node CHƯA CÓ lịch là cold-start
      // chưa luyện lần nào (US-13) → tính là đến hạn.
      const rows = db
        .select({
          nodeId: lineMoves.id,
          dueAt: drillSchedule.dueAt,
          masteredAt: drillSchedule.masteredAt,
        })
        .from(lineMoves)
        .leftJoin(drillSchedule, eq(drillSchedule.nodeId, lineMoves.id))
        .where(eq(lineMoves.isUserMove, true))
        .all();
      let due = 0;
      let mastered = 0;
      let learning = 0;
      for (const row of rows) {
        if (row.masteredAt !== null) {
          mastered += 1;
        } else if (row.dueAt === null || row.dueAt.getTime() <= now.getTime()) {
          due += 1;
        } else {
          learning += 1;
        }
      }
      return { due, mastered, learning };
    },
    /**
     * Mức thuộc từng line (US-21): đếm node user-move + node đã Mastered
     * (LEFT JOIN drill_schedule, count trong JS — dữ liệu nhỏ với app local).
     * Trả về một entry cho mỗi line có node; xếp theo lineId như listLines.
     */
    getLineMastery(): LineMastery[] {
      const rows = db
        .select({
          lineId: lineMoves.lineId,
          isUserMove: lineMoves.isUserMove,
          masteredAt: drillSchedule.masteredAt,
        })
        .from(lineMoves)
        .leftJoin(drillSchedule, eq(drillSchedule.nodeId, lineMoves.id))
        .orderBy(asc(lineMoves.lineId))
        .all();
      const byLine = new Map<number, LineMastery>();
      for (const row of rows) {
        const entry =
          byLine.get(row.lineId) ??
          { lineId: row.lineId, userMoveCount: 0, masteredCount: 0 };
        if (row.isUserMove) {
          entry.userMoveCount += 1;
          if (row.masteredAt !== null) entry.masteredCount += 1;
        }
        byLine.set(row.lineId, entry);
      }
      return [...byLine.values()];
    },
    /**
     * Nạp catalog Thế tàn cuộc kinh điển (TT-10). Idempotent theo `name`:
     * chỉ chèn những thế còn thiếu, không đụng gì đã có (kể cả lịch đã tạo).
     * Trả về số thế mới được chèn.
     */
    seedEndgameCatalog(): number {
      const existingNames = new Set(
        db
          .select({ name: endgamePositions.name })
          .from(endgamePositions)
          .all()
          .map((row) => row.name),
      );
      const missing: SeededEndgamePosition[] = ENDGAME_CATALOG.filter(
        (entry) => !existingNames.has(entry.name),
      );
      if (missing.length === 0) return 0;
      db.insert(endgamePositions)
        .values(
          missing.map((entry) => ({
            name: entry.name,
            fen: entry.fen,
            goal: entry.goal,
            userColor: entry.userColor,
            maxMoves: DEFAULT_MAX_ENDGAME_MOVES,
            source: "catalog" as const,
          })),
        )
        .run();
      return missing.length;
    },
    exportBackup(): BackupFile {
      return {
        format: "chess-trainer-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        excluded: {
          tables: BACKUP_EXCLUDED_TABLES,
          reason: BACKUP_EXCLUDED_REASON,
        },
        tables: {
          positions: db.select().from(positions).orderBy(asc(positions.id)).all(),
          puzzleAttempts: db
            .select()
            .from(puzzleAttempts)
            .orderBy(asc(puzzleAttempts.id))
            .all(),
          repertoireLines: db
            .select()
            .from(repertoireLines)
            .orderBy(asc(repertoireLines.id))
            .all(),
          lineMoves: db.select().from(lineMoves).orderBy(asc(lineMoves.id)).all(),
          drillSchedule: db
            .select()
            .from(drillSchedule)
            .orderBy(asc(drillSchedule.id))
            .all()
            .map(toBackupScheduleRow),
          games: db.select().from(games).orderBy(asc(games.id)).all(),
          gameAnalysis: db
            .select()
            .from(gameAnalysis)
            .orderBy(asc(gameAnalysis.id))
            .all(),
          endgamePositions: db
            .select()
            .from(endgamePositions)
            .orderBy(asc(endgamePositions.id))
            .all(),
          endgameSchedule: db
            .select()
            .from(endgameSchedule)
            .orderBy(asc(endgameSchedule.id))
            .all()
            .map(toBackupScheduleRow),
        },
      };
    },
    /**
     * Phục hồi từ file backup (US-35): chèn lại row VỚI id gốc theo thứ tự
     * phụ thuộc FK, GỘP trong đúng một giao dịch — hỏng giữa chừng thì DB
     * nguyên vẹn. Upsert theo id nên import lại cùng file không nhân bản.
     *
     * FK tắt trong lúc import: `puzzle_attempts` tham chiếu bảng NỘI DUNG
     * `puzzles` (không xuất kèm — ADR-0002), nên phục hồi vào DB chưa nạp
     * lại dump vẫn hợp lệ; các row treo sẽ nối lại khi dump được nhập.
     */
    async importBackup(
      data: unknown,
    ): Promise<{ imported: Record<string, number> }> {
      const backup = parseBackupFile(data);
      const t = backup.tables;
      sqlite.pragma("foreign_keys = OFF");
      try {
        db.transaction((tx) => {
          insertBackupRows(tx, positions, t.positions);
          insertBackupRows(
            tx,
            puzzleAttempts,
            t.puzzleAttempts.map(toDbPuzzleAttempt),
          );
          insertBackupRows(tx, repertoireLines, t.repertoireLines);
          insertBackupRows(tx, lineMoves, t.lineMoves);
          insertBackupRows(tx, games, t.games.map(toDbGame));
          insertBackupRows(tx, gameAnalysis, t.gameAnalysis);
          insertBackupRows(tx, drillSchedule, t.drillSchedule.map(toDbSchedule));
          insertBackupRows(tx, endgamePositions, t.endgamePositions);
          insertBackupRows(
            tx,
            endgameSchedule,
            t.endgameSchedule.map(toDbSchedule),
          );
        });
      } finally {
        sqlite.pragma("foreign_keys = ON");
      }
      return {
        imported: {
          positions: t.positions.length,
          puzzleAttempts: t.puzzleAttempts.length,
          repertoireLines: t.repertoireLines.length,
          lineMoves: t.lineMoves.length,
          drillSchedule: t.drillSchedule.length,
          games: t.games.length,
          gameAnalysis: t.gameAnalysis.length,
          endgamePositions: t.endgamePositions.length,
          endgameSchedule: t.endgameSchedule.length,
        },
      };
    },
    listEndgamePositions(): EndgamePosition[] {
      const rows = db
        .select({
          id: endgamePositions.id,
          name: endgamePositions.name,
          fen: endgamePositions.fen,
          goal: endgamePositions.goal,
          userColor: endgamePositions.userColor,
          maxMoves: endgamePositions.maxMoves,
          source: endgamePositions.source,
          createdAt: endgamePositions.createdAt,
          box: endgameSchedule.box,
          dueAt: endgameSchedule.dueAt,
          masteredAt: endgameSchedule.masteredAt,
        })
        .from(endgamePositions)
        .leftJoin(
          endgameSchedule,
          eq(endgameSchedule.positionId, endgamePositions.id),
        )
        .orderBy(asc(endgamePositions.id))
        .all();
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        fen: row.fen,
        goal: row.goal,
        userColor: row.userColor,
        maxMoves: row.maxMoves,
        source: row.source,
        createdAt: row.createdAt,
        box: row.box ?? null,
        dueAt: row.dueAt ? row.dueAt.toISOString() : null,
        masteredAt: row.masteredAt ? row.masteredAt.toISOString() : null,
      }));
    },
    addEndgamePosition(input: AddEndgamePositionInput): EndgamePosition {
      const name = assertNonEmpty(input.name, "Tên thế tàn cuộc");
      assertValidFen(input.fen);
      const goal = assertEndgameGoal(input.goal);
      const userColor = assertUserColor(input.userColor) as EndgameUserColor;
      const maxMoves = assertMaxMoves(input.maxMoves);
      const inserted = db
        .insert(endgamePositions)
        .values({ name, fen: input.fen, goal, userColor, maxMoves, source: "import" })
        .returning()
        .get();
      return {
        id: inserted.id,
        name: inserted.name,
        fen: inserted.fen,
        goal: inserted.goal,
        userColor: inserted.userColor,
        maxMoves: inserted.maxMoves,
        source: inserted.source,
        createdAt: inserted.createdAt,
        box: null,
        dueAt: null,
        masteredAt: null,
      };
    },
    /**
     * Một lượt trả lời Drill tàn cuộc (Leitner). Dùng lại đúng phép toán
     * `nextLeitnerState` của drill khai cuộc; lịch tạo LƯỜI trên bảng
     * `endgame_schedule` (upsert theo `position_id`) — tách riêng khỏi
     * `drill_schedule` của TT-07.
     */
    answerEndgameItem(
      positionId: number,
      correct: boolean,
      now: Date = new Date(),
    ): EndgameScheduleState {
      const position = db
        .select({ id: endgamePositions.id })
        .from(endgamePositions)
        .where(eq(endgamePositions.id, positionId))
        .get();
      if (!position) {
        throw new Error(
          `Không tìm thấy Thế tàn cuộc #${positionId} trong endgame_positions.`,
        );
      }
      const existing = db
        .select({ box: endgameSchedule.box })
        .from(endgameSchedule)
        .where(eq(endgameSchedule.positionId, positionId))
        .get();
      const { next, row } = leitnerUpsertParts(existing?.box, correct, now);
      db.insert(endgameSchedule)
        .values({ positionId, ...row })
        .onConflictDoUpdate({
          target: endgameSchedule.positionId,
          set: row,
        })
        .run();
      return { positionId, ...scheduleStateFields(next, now) };
    },
    /** Hàng đợi ôn tàn cuộc: đến hạn, chưa Mastered — xếp theo due_at. */
    getEndgameQueue(now: Date = new Date()): EndgameQueueItem[] {
      return db
        .select({
          positionId: endgamePositions.id,
          name: endgamePositions.name,
          fen: endgamePositions.fen,
          goal: endgamePositions.goal,
          userColor: endgamePositions.userColor,
          maxMoves: endgamePositions.maxMoves,
          box: endgameSchedule.box,
          dueAt: endgameSchedule.dueAt,
        })
        .from(endgameSchedule)
        .innerJoin(
          endgamePositions,
          eq(endgamePositions.id, endgameSchedule.positionId),
        )
        .where(
          and(
            isNull(endgameSchedule.masteredAt),
            lte(endgameSchedule.dueAt, now),
          ),
        )
        .orderBy(asc(endgameSchedule.dueAt), asc(endgameSchedule.box), asc(endgamePositions.id))
        .all()
        .map((row) => ({
          ...row,
          dueAt: row.dueAt.toISOString(),
        }));
    },
    deleteEndgamePosition(id: number): void {
      const result = db
        .delete(endgamePositions)
        .where(eq(endgamePositions.id, id))
        .run();
      if (result.changes === 0) {
        throw new Error(
          `Không tìm thấy Thế tàn cuộc #${id} trong endgame_positions.`,
        );
      }
    },
    saveGame(input: SaveGameInput): SavedGame {
      const result = assertGameResult(input.result);
      const userColor = assertUserColor(input.userColor);
      const engineStrength = assertEngineStrength(input.engineStrength);
      const pgn = assertNonEmpty(input.pgn, "PGN");
      assertValidFen(input.finalFen);
      return db
        .insert(games)
        .values({ pgn, result, userColor, engineStrength, finalFen: input.finalFen })
        .returning()
        .get();
    },
    listGames(options: ListGamesOptions = {}): GamePage {
      const { limit = 50, offset = 0 } = options;
      const total =
        db.select({ value: count() }).from(games).get()?.value ?? 0;
      const items = db
        .select()
        .from(games)
        .orderBy(desc(games.playedAt), desc(games.id))
        .limit(Math.max(0, Math.floor(limit)))
        .offset(Math.max(0, Math.floor(offset)))
        .all();
      return { total, items };
    },
    getGame(id: number): SavedGame | null {
      return (
        db
          .select()
          .from(games)
          .where(eq(games.id, id))
          .get() ?? null
      );
    },
    /**
     * Lưu cache phân tích Game Review (TT-09), upsert theo `game_id` —
     * mở lại ván đã review đọc thẳng row này, không chạy engine lần nữa.
     */
    saveGameAnalysis(input: SaveGameAnalysisInput): GameAnalysis {
      const game = db
        .select({ id: games.id })
        .from(games)
        .where(eq(games.id, input.gameId))
        .get();
      if (!game) {
        throw new Error(`Không tìm thấy Game #${input.gameId}.`);
      }
      if (!Number.isInteger(input.depth) || input.depth < 1) {
        throw new Error(
          `Độ sâu phân tích phải là số nguyên ≥ 1, nhận: ${input.depth}`,
        );
      }
      if (!Array.isArray(input.evals) || input.evals.length === 0) {
        throw new Error("evals phải là mảng khác rỗng (eval từng thế trước mỗi nước).");
      }
      if (!Array.isArray(input.flags)) {
        throw new Error("flags phải là mảng (có thể rỗng).");
      }
      const row = db
        .insert(gameAnalysis)
        .values({
          gameId: input.gameId,
          evalsJson: JSON.stringify(input.evals),
          flagsJson: JSON.stringify(input.flags),
          depth: input.depth,
        })
        .onConflictDoUpdate({
          target: gameAnalysis.gameId,
          set: {
            evalsJson: sql`excluded.evals_json`,
            flagsJson: sql`excluded.flags_json`,
            depth: sql`excluded.depth`,
            analysedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
          },
        })
        .returning()
        .get();
      return toGameAnalysis(row);
    },
    getGameAnalysis(gameId: number): GameAnalysis | null {
      const row = db
        .select()
        .from(gameAnalysis)
        .where(eq(gameAnalysis.gameId, gameId))
        .get();
      return row ? toGameAnalysis(row) : null;
    },
    isGameAnalysed(gameId: number): boolean {
      return (
        db
          .select({ gameId: gameAnalysis.gameId })
          .from(gameAnalysis)
          .where(eq(gameAnalysis.gameId, gameId))
          .get() !== undefined
      );
    },
    close(): void {
      sqlite.close();
    },
  };
}

type DrizzleDb = ReturnType<typeof drizzle>;

const BACKUP_FORMAT = "chess-trainer-backup";
const BACKUP_VERSION = 1;
const BACKUP_TABLE_KEYS = [
  "positions",
  "puzzleAttempts",
  "repertoireLines",
  "lineMoves",
  "drillSchedule",
  "games",
  "gameAnalysis",
  "endgamePositions",
  "endgameSchedule",
] as const;

/** Chèn tối đa bao nhiêu row mỗi câu INSERT (tránh trần bind param SQLite). */
const BACKUP_INSERT_CHUNK = 500;

/**
 * Kiểm tra shape file backup: đúng format, đúng phiên bản, đủ 9 bảng dạng
 * mảng row có id nguyên. Lỗi thì ném thông điệp tiếng Việt rõ ràng.
 */
function parseBackupFile(data: unknown): BackupFile {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(
      `File backup phải là một đối tượng JSON, nhận được: ${describeJsonType(data)}.`,
    );
  }
  const raw = data as Record<string, unknown>;
  if (raw.format !== BACKUP_FORMAT) {
    throw new Error(
      `Tệp không phải backup của Chess Trainer — thiếu/không đúng "format": ${describeJsonValue(raw.format)} (kỳ vọng "${BACKUP_FORMAT}").`,
    );
  }
  if (raw.version !== BACKUP_VERSION) {
    throw new Error(
      `Phiên bản backup không được hỗ trợ: ${describeJsonValue(raw.version)} — ứng dụng đọc được phiên bản ${BACKUP_VERSION}.`,
    );
  }
  const rawTables = raw.tables;
  if (
    typeof rawTables !== "object" ||
    rawTables === null ||
    Array.isArray(rawTables)
  ) {
    throw new Error(
      "File backup thiếu trường \"tables\" (đối tượng chứa các bảng dữ liệu).",
    );
  }
  const tables: Partial<BackupTables> = {};
  for (const key of BACKUP_TABLE_KEYS) {
    const rows = (rawTables as Record<string, unknown>)[key];
    if (!Array.isArray(rows)) {
      throw new Error(
        `File backup thiếu hoặc sai bảng "${key}" — phải là mảng các row.`,
      );
    }
    for (const row of rows) {
      if (typeof row !== "object" || row === null || Array.isArray(row)) {
        throw new Error(
          `Bảng "${key}" có row không phải đối tượng JSON: ${describeJsonValue(row)}.`,
        );
      }
      const id = (row as Record<string, unknown>).id;
      if (typeof id !== "number" || !Number.isInteger(id)) {
        throw new Error(
          `Bảng "${key}" có row thiếu "id" nguyên — backup phải giữ nguyên id gốc.`,
        );
      }
    }
    // `key` là hợp của 9 khóa nên TS ép intersection khi gán — row đã được
    // kiểm shape phía trên; `never` an toàn theo nghĩa không thể là giá trị sai.
    tables[key] = rows as never;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
    excluded:
      typeof raw.excluded === "object" && raw.excluded !== null
        ? (raw.excluded as BackupFile["excluded"])
        : { tables: BACKUP_EXCLUDED_TABLES, reason: BACKUP_EXCLUDED_REASON },
    tables: tables as BackupTables,
  };
}

function describeJsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "mảng";
  return typeof value;
}

function describeJsonValue(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/**
 * Chèn batch row backup (đã đúng shape) vào một bảng, upsert theo `id`:
 * row có sẵn thì cập nhật cả các cột — import lại cùng file không nhân bản.
 */
function insertBackupRows(
  tx: Tx,
  table: SQLiteTable,
  rows: Record<string, unknown>[],
): void {
  if (rows.length === 0) return;
  const columns = getTableColumns(table);
  const set: Record<string, SQL> = {};
  for (const [key, column] of Object.entries(columns)) {
    if (key === "id") continue;
    set[key] = sql`excluded.${sql.identifier(column.name)}`;
  }
  for (let start = 0; start < rows.length; start += BACKUP_INSERT_CHUNK) {
    tx
      .insert(table)
      .values(rows.slice(start, start + BACKUP_INSERT_CHUNK) as never)
      .onConflictDoUpdate({
        target: (table as unknown as { id: SQLiteColumn }).id,
        set: set as never,
      })
      .run();
  }
}

function toDbPuzzleAttempt(
  row: Record<string, unknown>,
): typeof puzzleAttempts.$inferInsert {
  return {
    id: row.id as number,
    puzzleId: row.puzzleId as string,
    attemptedAt: row.attemptedAt as string,
    solved: Boolean(row.solved),
  };
}

function toDbGame(
  row: Record<string, unknown>,
): typeof games.$inferInsert {
  return {
    id: row.id as number,
    pgn: row.pgn as string,
    result: row.result as GameResult,
    userColor: row.userColor as string,
    engineStrength: row.engineStrength as number,
    finalFen: row.finalFen as string,
    playedAt: row.playedAt as string,
  };
}

/** ISO string của file backup → Date cho cột timestamp (mode "timestamp"). */
function toDbSchedule<TRow extends Record<string, unknown>>(
  row: TRow,
): Omit<TRow, keyof ScheduleIsoTimestamps> & ScheduleTimestamps {
  return {
    ...row,
    dueAt: new Date(row.dueAt as string),
    masteredAt:
      row.masteredAt === null || row.masteredAt === undefined
        ? null
        : new Date(row.masteredAt as string),
    updatedAt: new Date(row.updatedAt as string),
  };
}

/** Mệnh đề WHERE dùng chung cho listPuzzles / getRandomBatch. */
function puzzleFilterWhere(
  db: DrizzleDb,
  filter: {
    theme?: string;
    ratingMin?: number;
    ratingMax?: number;
  },
) {
  const conditions = [];
  if (filter.theme !== undefined) {
    conditions.push(
      inArray(
        puzzles.puzzleId,
        db
          .select({ id: puzzleThemes.puzzleId })
          .from(puzzleThemes)
          .where(eq(puzzleThemes.theme, filter.theme)),
      ),
    );
  }
  if (filter.ratingMin !== undefined) {
    conditions.push(gte(puzzles.rating, filter.ratingMin));
  }
  if (filter.ratingMax !== undefined) {
    conditions.push(lte(puzzles.rating, filter.ratingMax));
  }
  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

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

function assertGameResult(result: string): GameResult {
  if (!(GAME_RESULTS as readonly string[]).includes(result)) {
    throw new Error(
      `Result không hợp lệ: "${result}" — phải là ${GAME_RESULTS.join(" | ")}.`,
    );
  }
  return result as GameResult;
}

function assertUserColor(userColor: string): string {
  if (userColor !== "w" && userColor !== "b") {
    throw new Error(`Màu quân của bạn không hợp lệ: "${userColor}" — phải là 'w' | 'b'.`);
  }
  return userColor;
}

function assertEndgameGoal(goal: string): EndgameGoal {
  if (goal !== "win" && goal !== "draw") {
    throw new Error(
      `Mục tiêu của thế tàn cuộc không hợp lệ: "${goal}" — phải là 'win' | 'draw'.`,
    );
  }
  return goal;
}

function assertMaxMoves(maxMoves: number | undefined): number {
  const resolved = maxMoves ?? DEFAULT_MAX_ENDGAME_MOVES;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error(
      `Số nước tối đa phải là số nguyên ≥ 1, nhận: ${maxMoves}`,
    );
  }
  return resolved;
}

function assertEngineStrength(engineStrength: number): number {
  if (
    !Number.isInteger(engineStrength) ||
    engineStrength < MIN_ENGINE_STRENGTH ||
    engineStrength > MAX_ENGINE_STRENGTH
  ) {
    throw new Error(
      `Độ mạnh engine phải là số nguyên ${MIN_ENGINE_STRENGTH}..${MAX_ENGINE_STRENGTH}, nhận: ${engineStrength}`,
    );
  }
  return engineStrength;
}

function assertNonEmpty(value: string, label: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${label} không được để trống.`);
  }
  return value;
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

function toGameAnalysis(row: typeof gameAnalysis.$inferSelect): GameAnalysis {
  return {
    gameId: row.gameId,
    evals: JSON.parse(row.evalsJson) as PositionEval[],
    flags: JSON.parse(row.flagsJson) as MoveFlag[],
    depth: row.depth,
    analysedAt: row.analysedAt,
  };
}

type ScheduleTimestamps = {
  dueAt: Date;
  masteredAt: Date | null;
  updatedAt: Date;
};
type ScheduleIsoTimestamps = {
  dueAt: string;
  masteredAt: string | null;
  updatedAt: string;
};

/** Cột timestamp (Date → epoch trong SQLite) xuất ra ISO string cho JSON. */
function toBackupScheduleRow<TRow extends ScheduleTimestamps>(
  row: TRow,
): Omit<TRow, keyof ScheduleTimestamps> & ScheduleIsoTimestamps {
  return {
    ...row,
    dueAt: row.dueAt.toISOString(),
    masteredAt: row.masteredAt ? row.masteredAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
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
      ...uciToMove(extra.uci),
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
