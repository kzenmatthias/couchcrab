/**
 * Shared pieces of the management service layer: the acting user, role checks, errors,
 * form parsing and the audit helper. Every write in `src/lib/server/manage/` goes through
 * `assertRole` and `auditUser`, so the routes stay thin and the rules are unit tested.
 */
import { type Executor, writeAudit } from '../audit.js';

export type Role = 'viewer' | 'editor' | 'admin';
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

/** The person doing the change. Built from `locals.user`. */
export interface Actor {
	id: number;
	role: Role;
}

/** Codes for field errors. The management pages turn them into translated messages. */
export type ErrorCode =
	| 'required'
	| 'too_long'
	| 'invalid_slug'
	| 'slug_taken'
	| 'invalid_color'
	| 'invalid_url'
	| 'invalid_date'
	| 'date_order'
	| 'invalid_choice'
	| 'invalid_number'
	| 'invalid_regex'
	| 'pattern_too_long'
	| 'no_extras'
	| 'has_extras'
	| 'is_extras'
	| 'has_videos'
	| 'claimed_locked'
	| 'admin_only'
	| 'last_admin'
	| 'invalid_channel'
	| 'needs_channel_id'
	| 'channel_taken'
	| 'channel_not_found'
	| 'youtube_error'
	| 'number_taken'
	| 'group_mismatch'
	| 'claim_other_creator'
	| 'not_pending';

export type FieldErrors = Record<string, ErrorCode>;

export class ForbiddenError extends Error {
	readonly status = 403;
	constructor(message = 'Not allowed') {
		super(message);
		this.name = 'ForbiddenError';
	}
}

export class NotFoundError extends Error {
	readonly status = 404;
	constructor(message = 'Not found') {
		super(message);
		this.name = 'NotFoundError';
	}
}

/** Input that did not pass validation. `errors` maps a field name to an error code. */
export class ValidationError extends Error {
	constructor(readonly errors: FieldErrors) {
		super(`Invalid input: ${Object.keys(errors).join(', ')}`);
		this.name = 'ValidationError';
	}
}

export function hasRole(actor: Actor, role: 'editor' | 'admin'): boolean {
	return RANK[actor.role] >= RANK[role];
}

/** Throws `ForbiddenError` unless the actor has at least `role`. */
export function assertRole(actor: Actor, role: 'editor' | 'admin'): void {
	if (!hasRole(actor, role)) throw new ForbiddenError();
}

/** Writes an `audit_log` entry for a change by this person. */
export function auditUser(
	tx: Executor,
	actor: Actor,
	entity: string,
	entityId: number,
	before: Record<string, unknown> | null,
	after: Record<string, unknown> | null
): number {
	return writeAudit(tx, { actor: 'user', actorUserId: actor.id, entity, entityId, before, after });
}

/** Collects field errors while parsing a form. */
export class Checker {
	readonly errors: FieldErrors = {};

	fail(field: string, code: ErrorCode): void {
		if (!(field in this.errors)) this.errors[field] = code;
	}

	get ok(): boolean {
		return Object.keys(this.errors).length === 0;
	}

	/** Throws a `ValidationError` when any field failed. */
	done(): void {
		if (!this.ok) throw new ValidationError(this.errors);
	}
}

/** Form input as the routes pass it in: a FormData or a plain object (tests). */
export type Input = FormData | Record<string, unknown>;

/** A string, number or boolean as trimmed text; anything else (files, objects) is ''. */
function scalar(value: unknown): string {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return '';
}

/** One trimmed string value ('' when missing). */
export function text(input: Input, name: string): string {
	return scalar(input instanceof FormData ? input.get(name) : input[name]);
}

/** All values of a repeated field (checkboxes, multi-selects). */
export function texts(input: Input, name: string): string[] {
	const value: unknown = input instanceof FormData ? input.getAll(name) : input[name];
	return (Array.isArray(value) ? value : [value]).map(scalar).filter((v) => v !== '');
}

/** A checkbox: on when present with any value other than '', '0', 'false' or 'off'. */
export function flag(input: Input, name: string): boolean {
	const value = text(input, name);
	return value !== '' && value !== '0' && value !== 'false' && value !== 'off';
}

/** A positive integer id, or null. */
export function id(value: unknown): number | null {
	const n = typeof value === 'number' ? value : Number(scalar(value) || NaN);
	return Number.isInteger(n) && n > 0 ? n : null;
}

/** Required string with a maximum length. */
export function requiredText(c: Checker, input: Input, name: string, max: number): string {
	const value = text(input, name);
	if (!value) c.fail(name, 'required');
	else if (value.length > max) c.fail(name, 'too_long');
	return value;
}

/** Optional string (null when empty) with a maximum length. */
export function optionalText(c: Checker, input: Input, name: string, max: number): string | null {
	const value = text(input, name);
	if (value.length > max) c.fail(name, 'too_long');
	return value || null;
}

export function oneOf<T extends string>(
	c: Checker,
	input: Input,
	name: string,
	options: readonly T[],
	fallback?: T
): T {
	const value = text(input, name);
	if (!value && fallback !== undefined) return fallback;
	if ((options as readonly string[]).includes(value)) return value as T;
	c.fail(name, value ? 'invalid_choice' : 'required');
	return options[0];
}

/** An optional http(s) URL. */
export function optionalUrl(c: Checker, input: Input, name: string): string | null {
	const value = text(input, name);
	if (!value) return null;
	if (value.length > 500) {
		c.fail(name, 'too_long');
		return null;
	}
	try {
		const url = new URL(value);
		if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
	} catch {
		// fall through
	}
	c.fail(name, 'invalid_url');
	return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

/** An optional `YYYY-MM-DD` (date input) or `YYYY-MM-DDTHH:MM` (datetime-local), read as UTC. */
export function optionalDate(c: Checker, input: Input, name: string): Date | null {
	const value = text(input, name);
	if (!value) return null;
	if (!DATE_RE.test(value) && !DATETIME_RE.test(value)) {
		c.fail(name, 'invalid_date');
		return null;
	}
	const date = new Date(DATE_RE.test(value) ? `${value}T00:00:00Z` : `${value}Z`);
	if (Number.isNaN(date.getTime())) {
		c.fail(name, 'invalid_date');
		return null;
	}
	return date;
}

export function integerField(
	c: Checker,
	input: Input,
	name: string,
	{ min, max, fallback }: { min: number; max: number; fallback?: number }
): number {
	const value = text(input, name);
	if (!value && fallback !== undefined) return fallback;
	const n = Number(value);
	if (!value) c.fail(name, 'required');
	else if (!Number.isInteger(n) || n < min || n > max) c.fail(name, 'invalid_number');
	return Number.isInteger(n) ? n : (fallback ?? min);
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function colorField(c: Checker, input: Input, name: string): string {
	const value = text(input, name).toLowerCase();
	if (!value) c.fail(name, 'required');
	else if (!HEX_RE.test(value)) c.fail(name, 'invalid_color');
	return value;
}

/** Unix seconds as an ISO string for audit entries (null stays null). */
export const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);
