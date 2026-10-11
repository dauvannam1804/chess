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
  lte,
  sql,
} from "drizzle-orm";
import { Chess } from "chess.js";
import { positions, puzzleThemes, puzzles } from "./schema";
import { parsePuzzleCsv, type ParsedPuzzle } from "./puzzle-csv";

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
  close(): void;
}

export function createTrainerService(dbPath: string): TrainerService {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
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
