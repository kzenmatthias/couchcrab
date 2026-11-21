/** Translated labels for the community pages: fields, values, actors, statuses and kinds. */
import { m } from '#lib/paraglide/messages.js';
import { kindLabel, type SeriesKind, type SeriesStatus, statusLabel } from '#lib/labels.js';
import { formatDate } from '#lib/i18n.js';
import type { ActorType, GroupRef, RevertBlock, Val } from './change.js';

const FIELDS: Record<string, () => string> = {
	series: m.community_field_series,
	group: m.community_field_group,
	status: m.community_field_status,
	captions: m.community_field_captions,
	live_vod: m.community_field_live_vod,
	title: m.community_field_title,
	slug: m.community_field_slug,
	kind: m.community_field_kind,
	grouping: m.community_field_grouping,
	started_at: m.community_field_started_at,
	ended_at: m.community_field_ended_at,
	starts_at: m.community_field_starts_at,
	ends_at: m.community_field_ends_at,
	poster: m.community_field_poster,
	parent: m.community_field_parent,
	participants: m.community_field_participants,
	creator: m.community_field_creator,
	channel: m.community_field_channel,
	name: m.community_field_name,
	color: m.community_field_color,
	avatar: m.community_field_avatar,
	bio: m.community_field_bio,
	opted_out: m.community_field_opted_out,
	pattern: m.community_field_pattern,
	match: m.community_field_match,
	target: m.community_field_target,
	priority: m.community_field_priority,
	enabled: m.community_field_enabled,
	sync: m.community_field_sync,
	role: m.community_field_role,
	number: m.community_field_number,
	youtube_channel: m.community_field_youtube_channel,
	youtube_video: m.community_field_youtube_video,
	claimed_at: m.community_field_claimed_at,
	verified_at: m.community_field_verified_at,
	note: m.community_field_note,
	request: m.community_field_request
};

export function fieldLabel(field: string, locale?: string): string {
	if (field === 'description') return m.community_field_description({ language: locale ?? '' });
	return FIELDS[field]?.() ?? field;
}

export function groupLabel(g: GroupRef): string {
	const base =
		g.kind === 'session'
			? m.manage_session_n({ number: g.number })
			: m.manage_week_n({ number: g.number });
	return g.title ? `${base}: ${g.title}` : base;
}

function codeLabel(code: string, of: string): string {
	switch (of) {
		case 'video_status':
			return code === 'placed'
				? m.manage_status_placed()
				: code === 'ignored'
					? m.manage_status_ignored()
					: m.manage_status_unsorted();
		case 'series_kind':
			return kindLabel(code as SeriesKind);
		case 'series_status':
			return statusLabel(code as SeriesStatus);
		case 'grouping':
			return code === 'session'
				? m.manage_grouping_session()
				: code === 'none'
					? m.manage_grouping_none()
					: m.manage_grouping_week();
		case 'match':
			return code === 'regex' ? m.community_val_match_regex() : m.community_val_match_contains();
		case 'target':
			return code === 'extras' ? m.manage_target_extras() : m.manage_target_main();
		case 'role':
			return code === 'admin'
				? m.manage_role_admin()
				: code === 'editor'
					? m.manage_role_editor()
					: m.manage_role_viewer();
		case 'channel_kind':
			return code === 'secondary'
				? m.community_val_channel_secondary()
				: m.community_val_channel_main();
		default:
			return code;
	}
}

/** A value as text. `null` is "nothing". */
export function valText(val: Val, locale: string): string {
	if (val === null) return m.community_val_empty();
	if ('text' in val) return val.text;
	if ('code' in val) return codeLabel(val.code, val.of);
	if ('group' in val) return groupLabel(val.group);
	if ('list' in val) return val.list.length ? val.list.join(', ') : m.community_val_empty();
	if ('date' in val) {
		const d = new Date(val.date);
		return Number.isNaN(d.getTime())
			? val.date
			: formatDate(d, locale, { dateStyle: 'medium', timeZone: 'UTC' });
	}
	if ('bool' in val) return val.bool ? m.community_val_yes() : m.community_val_no();
	if ('byHand' in val) return m.community_val_by_hand();
	return m.community_val_removed();
}

export function actorTypeLabel(type: ActorType): string {
	return type === 'rule'
		? m.community_actor_rule()
		: type === 'sync'
			? m.community_actor_sync()
			: type === 'creator'
				? m.community_actor_creator()
				: m.community_actor_person();
}

const ENTITIES: Record<string, () => string> = {
	video: m.community_entity_video,
	series: m.community_entity_series,
	group: m.community_entity_group,
	creator: m.community_entity_creator,
	channel: m.community_entity_channel,
	rule: m.community_entity_rule,
	user: m.community_entity_user,
	claim: m.community_entity_claim,
	page: m.community_entity_page,
	site_text: m.community_entity_site_text
};

export function entityLabel(entity: string): string {
	const key = entity.startsWith('site_text:')
		? 'site_text'
		: entity.startsWith('page:')
			? 'page'
			: entity;
	return ENTITIES[key]?.() ?? entity;
}

export type SuggestionStatus = 'open' | 'question' | 'approved' | 'rejected' | 'withdrawn';

export function suggestionStatusLabel(status: SuggestionStatus): string {
	switch (status) {
		case 'question':
			return m.community_status_question();
		case 'approved':
			return m.community_status_approved();
		case 'rejected':
			return m.community_status_rejected();
		case 'withdrawn':
			return m.community_status_withdrawn();
		default:
			return m.community_status_open();
	}
}

const TYPES: Record<string, () => string> = {
	video_series: m.community_type_video_series,
	video_group: m.community_type_video_group,
	video_live_vod: m.community_type_video_live_vod,
	video_captions: m.community_type_video_captions,
	video_ignore: m.community_type_video_ignore,
	series_field: m.community_type_series_field,
	creator_field: m.community_type_creator_field,
	rule: m.community_type_rule,
	other: m.community_type_other,
	creator_request: m.community_type_creator_request
};

/** The label of a kind of suggestion. `participant` depends on what it was suggested for. */
export function suggestionTypeLabel(type: string, targetType?: string): string {
	if (type === 'participant')
		return targetType === 'creator'
			? m.community_type_participant_creator()
			: m.community_type_participant_series();
	return TYPES[type]?.() ?? type;
}

export function blockLabel(block: RevertBlock): string {
	switch (block) {
		case 'already_reverted':
			return m.community_error_already_reverted();
		case 'from_youtube':
			return m.community_error_from_youtube();
		case 'admin_only':
			return m.community_error_admin_only();
		case 'conflict':
			return m.community_error_conflict();
		case 'missing':
			return m.community_error_missing();
		case 'failed':
			return m.community_error_failed();
		default:
			return m.community_error_not_revertible();
	}
}
