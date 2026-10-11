CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pgn` text NOT NULL,
	`result` text NOT NULL CHECK (`result` IN ('1-0','0-1','1/2-1/2','*')),
	`user_color` text NOT NULL CHECK (`user_color` IN ('w','b')),
	`engine_strength` integer NOT NULL,
	`final_fen` text NOT NULL,
	`played_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `games_played_at_idx` ON `games` (`played_at`);
