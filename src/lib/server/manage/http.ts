/** Glue between the management routes and the service layer. */
import { error, fail, redirect } from '@sveltejs/kit';
import { requireRole } from '../auth/guards.js';
import { type Actor, ForbiddenError, NotFoundError, ValidationError } from './core.js';

/**
 * The acting user for a management route. Signed out goes to the sign-in page; a signed-in user
 * without the role gets a 403. Every load and every action calls this on the server.
 */
export function actorFor(locals: App.Locals, role: 'editor' | 'admin'): Actor {
	if (!locals.user) redirect(303, '/signin');
	const user = requireRole(locals, role);
	return { id: user.id, role: user.role };
}

export type FormValues = Record<string, string | string[]>;

/** The submitted values, to fill the form again after an error. Repeated names become arrays. */
export function formValues(form: FormData): FormValues {
	const out: FormValues = {};
	for (const key of new Set(form.keys())) {
		const all = form.getAll(key).filter((v): v is string => typeof v === 'string');
		out[key] = all.length > 1 ? all : (all[0] ?? '');
	}
	return out;
}

/** A positive integer route parameter, or a 404. */
export function paramId(value: string | undefined): number {
	const n = Number(value);
	if (!Number.isInteger(n) || n <= 0) error(404, 'Not found');
	return n;
}

/** Turns service errors into HTTP answers: 400 with field errors, 403, 404. */
export function handleServiceError<E extends Record<string, unknown> = Record<never, never>>(
	err: unknown,
	form?: FormData,
	extra?: E
) {
	if (err instanceof ValidationError) {
		const values: FormValues = form ? formValues(form) : {};
		return fail(400, { errors: err.errors, values, ...(extra as E) });
	}
	if (err instanceof ForbiddenError) error(403, 'Not allowed');
	if (err instanceof NotFoundError) error(404, 'Not found');
	throw err;
}

/** Loads through the service layer: a ForbiddenError or NotFoundError becomes 403 or 404. */
export function load<T>(fn: () => T): T {
	try {
		return fn();
	} catch (err) {
		if (err instanceof ForbiddenError) error(403, 'Not allowed');
		if (err instanceof NotFoundError) error(404, 'Not found');
		throw err;
	}
}
