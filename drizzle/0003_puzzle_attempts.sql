CREATE TABLE `puzzle_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`puzzle_id` text NOT NULL,
	`attempted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`solved` integer NOT NULL,
	FOREIGN KEY (`puzzle_id`) REFERENCES `puzzles`(`puzzle_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `puzzle_attempts_puzzle_id_idx` ON `puzzle_attempts` (`puzzle_id`);