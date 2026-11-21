CREATE TABLE `site_texts` (
	`key` text NOT NULL,
	`locale` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`key`, `locale`)
);
