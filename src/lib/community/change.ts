/**
 * The shape of a change as the review queue, the history and the public series history show it:
 * a list of fields with a value before and after. Values are resolved on the server (names
 * instead of ids) and translated in the browser (`labels.ts`).
 */

export type ValCode =
	| 'video_status'
	| 'series_kind'
	| 'series_status'
	| 'grouping'
	| 'match'
	| 'target'
	| 'role'
	| 'channel_kind';

export type GroupRef = { kind: 'session' | 'week'; number: number; title: string | null };

export type Val =
	| null
	| { text: string }
	| { code: string; of: ValCode }
	| { group: GroupRef }
	| { list: string[] }
	| { date: string }
	| { bool: boolean }
	/** A change that a reviewer makes by hand, described in the note. */
	| { byHand: true }
	| { removed: true };

export interface FieldChange {
	/** A field key such as `series`, `group`, `title`, `participants` (see `fieldLabel`). */
	field: string;
	/** For translated fields (series descriptions). */
	locale?: string;
	before: Val;
	after: Val;
}

/** Who made a history entry, as the history page filters it. */
export type ActorType = 'person' | 'rule' | 'sync' | 'creator';
export const ACTOR_TYPES: readonly ActorType[] = ['person', 'rule', 'sync', 'creator'];

/** Entities the history lists, in the order of the filter. */
export const HISTORY_ENTITIES = [
	'video',
	'series',
	'group',
	'creator',
	'channel',
	'rule',
	'user',
	'claim',
	'page',
	'site_text'
] as const;
export type HistoryEntity = (typeof HISTORY_ENTITIES)[number];

/** Why a history entry cannot be reverted (or why a revert was refused). */
export type RevertBlock =
	| 'already_reverted'
	| 'not_revertible'
	| 'from_youtube'
	| 'admin_only'
	| 'conflict'
	| 'missing'
	| 'failed';
