import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { desc } from "drizzle-orm";
import { Chess } from "chess.js";
import { positions } from "./schema";

export type SavedPosition = {
  id: number;
  fen: string;
  name: string | null;
  createdAt: string;
};

export interface TrainerService {
  savePosition(fen: string, name?: string): SavedPosition;
  listPositions(): SavedPosition[];
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
    close(): void {
      sqlite.close();
    },
  };
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
