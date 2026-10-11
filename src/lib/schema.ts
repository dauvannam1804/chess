import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const positions = sqliteTable("positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fen: text("fen").notNull(),
  name: text("name"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

export const puzzles = sqliteTable(
  "puzzles",
  {
    puzzleId: text("puzzle_id").primaryKey(),
    fen: text("fen").notNull(),
    moves: text("moves").notNull(),
    rating: integer("rating").notNull(),
    ratingDeviation: integer("rating_deviation").notNull(),
    popularity: integer("popularity").notNull(),
    nbPlays: integer("nb_plays").notNull(),
    themes: text("themes", { mode: "json" }).$type<string[]>().notNull(),
    gameUrl: text("game_url").notNull(),
    openingTags: text("opening_tags", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    insertedAt: text("inserted_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [index("puzzles_rating_idx").on(table.rating)],
);

export const puzzleThemes = sqliteTable(
  "puzzle_themes",
  {
    puzzleId: text("puzzle_id")
      .notNull()
      .references(() => puzzles.puzzleId, { onDelete: "cascade" }),
    theme: text("theme").notNull(),
  },
  (table) => [
    index("puzzle_themes_theme_idx").on(table.theme),
    primaryKey({ columns: [table.puzzleId, table.theme] }),
  ],
);
