CREATE TABLE `endgame_positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`fen` text NOT NULL,
	`goal` text NOT NULL CHECK (`goal` IN ('win','draw')),
	`user_color` text NOT NULL CHECK (`user_color` IN ('w','b')),
	`max_moves` integer DEFAULT 50 NOT NULL,
	`source` text DEFAULT 'catalog' NOT NULL CHECK (`source` IN ('catalog','import')),
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `endgame_schedule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`position_id` integer NOT NULL,
	`box` integer DEFAULT 1 NOT NULL,
	`due_at` integer NOT NULL,
	`mastered_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`position_id`) REFERENCES `endgame_positions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "endgame_schedule_box_range" CHECK("endgame_schedule"."box" between 1 and 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `endgame_schedule_position_id_unique` ON `endgame_schedule` (`position_id`);
