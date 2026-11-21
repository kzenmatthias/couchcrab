/** Translated messages for the error codes of the management service layer. */
import { m } from '#lib/paraglide/messages.js';
import type { ErrorCode } from '#lib/server/manage/core.js';

const MESSAGES: Record<ErrorCode, () => string> = {
	required: m.manage_error_required,
	too_long: m.manage_error_too_long,
	invalid_slug: m.manage_error_invalid_slug,
	slug_taken: m.manage_error_slug_taken,
	invalid_color: m.manage_error_invalid_color,
	invalid_url: m.manage_error_invalid_url,
	invalid_date: m.manage_error_invalid_date,
	date_order: m.manage_error_date_order,
	invalid_choice: m.manage_error_invalid_choice,
	invalid_number: m.manage_error_invalid_number,
	invalid_regex: m.manage_error_invalid_regex,
	pattern_too_long: m.manage_error_pattern_too_long,
	no_extras: m.manage_error_no_extras,
	has_extras: m.manage_error_has_extras,
	is_extras: m.manage_error_is_extras,
	has_videos: m.manage_error_has_videos,
	claimed_locked: m.manage_error_claimed_locked,
	admin_only: m.manage_error_admin_only,
	last_admin: m.manage_error_last_admin,
	invalid_channel: m.manage_error_invalid_channel,
	needs_channel_id: m.manage_error_needs_channel_id,
	channel_taken: m.manage_error_channel_taken,
	channel_not_found: m.manage_error_channel_not_found,
	youtube_error: m.manage_error_youtube_error,
	number_taken: m.manage_error_number_taken,
	group_mismatch: m.manage_error_group_mismatch,
	claim_other_creator: m.manage_error_claim_other_creator,
	not_pending: m.manage_error_not_pending,
	channel_unlinked: m.manage_error_channel_unlinked
};

export function errorMessage(code: string): string {
	return (MESSAGES as Record<string, () => string>)[code]?.() ?? m.manage_error_invalid_choice();
}

export type Errors = Record<string, string> | undefined | null;

/** The id of a form field and of its error message. */
export const fieldId = (name: string) => `f-${name}`;
export const errorId = (name: string) => `f-${name}-error`;
