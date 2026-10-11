CREATE TABLE `line_moves` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`line_id` integer NOT NULL,
	`parent_id` integer,
	`san` text NOT NULL,
	`uci` text NOT NULL,
	`fen_after` text NOT NULL,
	`is_user_move` integer NOT NULL,
	`sibling_order` integer NOT NULL,
	`comments_json` text DEFAULT '[]' NOT NULL,
	`starting_comments_json` text DEFAULT '[]' NOT NULL,
	`nags_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`line_id`) REFERENCES `repertoire_lines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `line_moves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `repertoire_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`start_fen` text NOT NULL,
	`user_color` text NOT NULL,
	`game_comments_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
