import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const positions = sqliteTable("positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fen: text("fen").notNull(),
  name: text("name"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

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
});
