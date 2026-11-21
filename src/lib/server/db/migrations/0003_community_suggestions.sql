PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`target_type` text NOT NULL,
	`target_id` integer,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`note` text,
	`is_creator_request` integer DEFAULT false NOT NULL,
	`contact_email` text,
	`status` text DEFAULT 'open' NOT NULL,
	`review_message` text,
	`reviewed_by` integer,
	`reviewed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_suggestions`("id", "user_id", "target_type", "target_id", "kind", "payload", "note", "is_creator_request", "status", "reviewed_by", "reviewed_at", "created_at") SELECT "id", "user_id", "target_type", "target_id", "kind", "payload", "note", "is_creator_request", "status", "reviewed_by", "reviewed_at", "created_at" FROM `suggestions`;--> statement-breakpoint
DROP TABLE `suggestions`;--> statement-breakpoint
ALTER TABLE `__new_suggestions` RENAME TO `suggestions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `suggestions_queue_idx` ON `suggestions` (`status`,`is_creator_request`,`created_at`);--> statement-breakpoint
CREATE INDEX `suggestions_user_idx` ON `suggestions` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `audit_log` ADD `revert_of` integer REFERENCES audit_log(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `suggestion_id` integer REFERENCES suggestions(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);