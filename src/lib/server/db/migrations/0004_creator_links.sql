ALTER TABLE `channels` ADD `unlinked_at` integer;--> statement-breakpoint
ALTER TABLE `channels` ADD `unlinked_by_user_id` integer REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `creators` ADD `links` text DEFAULT '[]' NOT NULL;