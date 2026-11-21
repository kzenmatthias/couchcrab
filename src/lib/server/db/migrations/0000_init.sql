CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text NOT NULL,
	`actor_user_id` integer,
	`entity` text NOT NULL,
	`entity_id` integer NOT NULL,
	`before` text,
	`after` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reverted_by` integer,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reverted_by`) REFERENCES `audit_log`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL,
	`youtube_channel_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT 'main' NOT NULL,
	`sync_enabled` integer DEFAULT true NOT NULL,
	`last_synced_at` integer,
	`verified_at` integer,
	`verified_by_user_id` integer,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`verified_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_youtube_channel_id_unique` ON `channels` (`youtube_channel_id`);--> statement-breakpoint
CREATE INDEX `channels_creator_idx` ON `channels` (`creator_id`);--> statement-breakpoint
CREATE TABLE `claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`creator_id` integer,
	`youtube_channel_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reviewed_by` integer,
	`reviewed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `claims_user_idx` ON `claims` (`user_id`);--> statement-breakpoint
CREATE INDEX `claims_status_idx` ON `claims` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `creators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`avatar_url` text,
	`bio` text,
	`claimed_at` integer,
	`opted_out` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creators_slug_unique` ON `creators` (`slug`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`kind` text NOT NULL,
	`number` integer NOT NULL,
	`title` text,
	`starts_at` integer,
	`ends_at` integer,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_series_kind_number_idx` ON `groups` (`series_id`,`kind`,`number`);--> statement-breakpoint
CREATE TABLE `page_translations` (
	`page_id` integer NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`page_id`, `locale`),
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_slug_unique` ON `pages` (`slug`);--> statement-breakpoint
CREATE TABLE `progress` (
	`user_id` integer NOT NULL,
	`video_id` integer NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`watched_at` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `video_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'ongoing' NOT NULL,
	`grouping` text DEFAULT 'week' NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`poster` text,
	`parent_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_slug_unique` ON `series` (`slug`);--> statement-breakpoint
CREATE INDEX `series_parent_idx` ON `series` (`parent_id`);--> statement-breakpoint
CREATE TABLE `series_creators` (
	`series_id` integer NOT NULL,
	`creator_id` integer NOT NULL,
	PRIMARY KEY(`series_id`, `creator_id`),
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `series_translations` (
	`series_id` integer NOT NULL,
	`locale` text NOT NULL,
	`description` text NOT NULL,
	PRIMARY KEY(`series_id`, `locale`),
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`note` text,
	`is_creator_request` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reviewed_by` integer,
	`reviewed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `suggestions_queue_idx` ON `suggestions` (`status`,`is_creator_request`,`created_at`);--> statement-breakpoint
CREATE TABLE `title_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`channel_id` integer,
	`pattern` text NOT NULL,
	`match` text DEFAULT 'contains' NOT NULL,
	`target` text DEFAULT 'main' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `title_rules_series_idx` ON `title_rules` (`series_id`);--> statement-breakpoint
CREATE TABLE `user_creators` (
	`user_id` integer NOT NULL,
	`creator_id` integer NOT NULL,
	PRIMARY KEY(`user_id`, `creator_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_series_creators` (
	`user_id` integer NOT NULL,
	`series_id` integer NOT NULL,
	`creator_id` integer NOT NULL,
	PRIMARY KEY(`user_id`, `series_id`, `creator_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`settings` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discord_id` text,
	`google_sub` text,
	`name` text NOT NULL,
	`avatar_url` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`trust` integer DEFAULT 0 NOT NULL,
	`creator_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "users_login_check" CHECK("users"."discord_id" IS NOT NULL OR "users"."google_sub" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_id_unique` ON `users` (`discord_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE INDEX `users_creator_idx` ON `users` (`creator_id`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`youtube_video_id` text NOT NULL,
	`channel_id` integer NOT NULL,
	`title` text NOT NULL,
	`published_at` integer NOT NULL,
	`duration_s` integer DEFAULT 0 NOT NULL,
	`has_creator_captions` integer DEFAULT false NOT NULL,
	`is_live_vod` integer DEFAULT false NOT NULL,
	`is_short` integer DEFAULT false NOT NULL,
	`series_id` integer,
	`group_id` integer,
	`episode_number` integer,
	`status` text DEFAULT 'unsorted' NOT NULL,
	`placed_by` text,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `videos_youtube_video_id_unique` ON `videos` (`youtube_video_id`);--> statement-breakpoint
CREATE INDEX `videos_series_published_idx` ON `videos` (`series_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `videos_channel_published_idx` ON `videos` (`channel_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `videos_group_idx` ON `videos` (`group_id`);--> statement-breakpoint
CREATE INDEX `videos_status_idx` ON `videos` (`status`);