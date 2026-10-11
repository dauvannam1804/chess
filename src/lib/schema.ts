import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  type AnySQLiteColumn,
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

export const puzzleAttempts = sqliteTable(
  "puzzle_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    puzzleId: text("puzzle_id")
      .notNull()
      .references(() => puzzles.puzzleId, { onDelete: "cascade" }),
    attemptedAt: text("attempted_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    solved: integer("solved", { mode: "boolean" }).notNull(),
  },
  (table) => [index("puzzle_attempts_puzzle_id_idx").on(table.puzzleId)],
);

export const repertoireLines = sqliteTable("repertoire_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  startFen: text("start_fen").notNull(),
  userColor: text("user_color").notNull(),
  gameCommentsJson: text("game_comments_json").notNull().default("[]"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

export const lineMoves = sqliteTable("line_moves", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lineId: integer("line_id")
    .notNull()
    .references(() => repertoireLines.id, { onDelete: "cascade" }),
  parentId: integer("parent_id").references((): AnySQLiteColumn => lineMoves.id, {
    onDelete: "cascade",
  }),
  san: text("san").notNull(),
  uci: text("uci").notNull(),
  fenAfter: text("fen_after").notNull(),
  isUserMove: integer("is_user_move", { mode: "boolean" }).notNull(),
  siblingOrder: integer("sibling_order").notNull(),
  commentsJson: text("comments_json").notNull().default("[]"),
  startingCommentsJson: text("starting_comments_json").notNull().default("[]"),
  nagsJson: text("nags_json").notNull().default("[]"),
  annotation: text("annotation"),
});
