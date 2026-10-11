CREATE TABLE `puzzle_themes` (
	`puzzle_id` text NOT NULL,
	`theme` text NOT NULL,
	PRIMARY KEY(`puzzle_id`, `theme`),
	FOREIGN KEY (`puzzle_id`) REFERENCES `puzzles`(`puzzle_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `puzzle_themes_theme_idx` ON `puzzle_themes` (`theme`);--> statement-breakpoint
CREATE TABLE `puzzles` (
	`puzzle_id` text PRIMARY KEY NOT NULL,
	`fen` text NOT NULL,
	`moves` text NOT NULL,
	`rating` integer NOT NULL,
	`rating_deviation` integer NOT NULL,
	`popularity` integer NOT NULL,
	`nb_plays` integer NOT NULL,
	`themes` text NOT NULL,
	`game_url` text NOT NULL,
	`opening_tags` text NOT NULL,
	`inserted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `puzzles_rating_idx` ON `puzzles` (`rating`);