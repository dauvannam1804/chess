import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import type { GameResult } from "./play/game-result";
import {
  DEFAULT_MAX_ENDGAME_MOVES,
  type EndgameGoal,
  type EndgameSource,
  type EndgameUserColor,
} from "./endgame/outcome";

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

/**
 * Lịch SRS Leitner của Drill (TT-07). Tạo row LƯỜI: lần đầu một node
 * drillable (is_user_move = 1) được trả lời mới có lịch.
 * `node_id` là node NƯỚC CỦA NGƯỜI DÙNG; thế cờ để luyện là FEN SAU node cha
 * (hoặc start_fen nếu node cha là root) — xem getDrillQueue.
 */
export const drillSchedule = sqliteTable(
  "drill_schedule",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nodeId: integer("node_id")
      .notNull()
      .unique()
      .references(() => lineMoves.id, { onDelete: "cascade" }),
    lineId: integer("line_id")
      .notNull()
      .references(() => repertoireLines.id, { onDelete: "cascade" }),
    box: integer("box").notNull().default(1),
    dueAt: integer("due_at", { mode: "timestamp" }).notNull(),
    masteredAt: integer("mastered_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    check("drill_schedule_box_range", sql`${table.box} between 1 and 4`),
  ],
);

export const games = sqliteTable(
  "games",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pgn: text("pgn").notNull(),
    result: text("result").$type<GameResult>().notNull(),
    userColor: text("user_color").notNull(),
    engineStrength: integer("engine_strength").notNull(),
    finalFen: text("final_fen").notNull(),
    playedAt: text("played_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [index("games_played_at_idx").on(table.playedAt)],
);

/**
 * Cache phân tích Game Review (TT-09) — MỘT row cho MỘT game (upsert theo
 * `game_id`). `evals_json` là mảng eval của các thế TRƯỚC mỗi nước, đánh chỉ
 * số theo ply (White-POV, xem hợp đồng `Engine`); `flags_json` là mảng nước
 * lỗi/blunder do `flagMistakes` tính. Mở lại ván đã phân tích đọc row này
 * thay vì chạy engine.
 */
export const gameAnalysis = sqliteTable("game_analysis", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id")
    .notNull()
    .unique()
    .references(() => games.id, { onDelete: "cascade" }),
  evalsJson: text("evals_json").notNull(),
  flagsJson: text("flags_json").notNull(),
  depth: integer("depth").notNull(),
  analysedAt: text("analysed_at")
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

/**
 * Một Thế tàn cuộc (Endgame Position) — từ catalog cứng hoặc FEN người dùng
 * nhập tay (TT-10). `user_color` là màu MẠNH mà người dùng cầm trong drill;
 * `goal` định hình thắng/thua của phiên (chiếu hết vs hòa/phòng ngự).
 */
export const endgamePositions = sqliteTable(
  "endgame_positions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    fen: text("fen").notNull(),
    goal: text("goal").$type<EndgameGoal>().notNull(),
    userColor: text("user_color").$type<EndgameUserColor>().notNull(),
    maxMoves: integer("max_moves").notNull().default(DEFAULT_MAX_ENDGAME_MOVES),
    source: text("source").$type<EndgameSource>().notNull().default("catalog"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    check("endgame_positions_goal_check", sql`${table.goal} in ('win','draw')`),
    check(
      "endgame_positions_user_color_check",
      sql`${table.userColor} in ('w','b')`,
    ),
    check(
      "endgame_positions_source_check",
      sql`${table.source} in ('catalog','import')`,
    ),
  ],
);

/**
 * Lịch SRS Leitner của tàn cuộc — bảng RIÊNG, không đụng `drill_schedule`
 * (TT-07). Cột giống hệt, khóa lịch là `position_id` (unique). Tạo row LƯỜI:
 * lần đầu một thế được trả lời mới có lịch — xem answerEndgameItem.
 */
export const endgameSchedule = sqliteTable(
  "endgame_schedule",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    positionId: integer("position_id")
      .notNull()
      .unique()
      .references(() => endgamePositions.id, { onDelete: "cascade" }),
    box: integer("box").notNull().default(1),
    dueAt: integer("due_at", { mode: "timestamp" }).notNull(),
    masteredAt: integer("mastered_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    check("endgame_schedule_box_range", sql`${table.box} between 1 and 4`),
  ],
);
