CREATE TABLE `game_analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`evals_json` text NOT NULL,
	`flags_json` text NOT NULL,
	`depth` integer NOT NULL,
	`analysed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_analysis_game_id_unique` ON `game_analysis` (`game_id`);