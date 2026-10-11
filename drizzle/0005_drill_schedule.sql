CREATE TABLE `drill_schedule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`node_id` integer NOT NULL,
	`line_id` integer NOT NULL,
	`box` integer DEFAULT 1 NOT NULL,
	`due_at` integer NOT NULL,
	`mastered_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `line_moves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`line_id`) REFERENCES `repertoire_lines`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "drill_schedule_box_range" CHECK("drill_schedule"."box" between 1 and 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drill_schedule_node_id_unique` ON `drill_schedule` (`node_id`);