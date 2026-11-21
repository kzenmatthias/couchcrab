import { redirect } from '@sveltejs/kit';
import { locales } from '#lib/paraglide/runtime.js';
import { ACTOR_TYPES, type ActorType, HISTORY_ENTITIES } from '#lib/community/change.js';
import { db } from '#lib/server/db/index.js';
import { getHistoryItem, listHistory, revertEntry } from '#lib/server/community/history.js';
import { id as parseId, NotFoundError, text } from '#lib/server/manage/core.js';
import { actorFor, handleServiceError, load as guarded } from '#lib/server/manage/http.js';
import type { Actions, PageServerLoad } from './$types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const day = (value: string | null) => {
	if (!value || !DATE_RE.test(value)) return null;
	const d = new Date(`${value}T00:00:00Z`);
	return Number.isNaN(d.getTime()) ? null : d;
};

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = actorFor(locals, 'editor');
	const q = url.searchParams;
	const entity = (HISTORY_ENTITIES as readonly string[]).includes(q.get('entity') ?? '')
		? q.get('entity')
		: null;
	const actorType = (ACTOR_TYPES as readonly string[]).includes(q.get('actor') ?? '')
		? (q.get('actor') as ActorType)
		: null;
	const from = day(q.get('from'));
	const toDay = day(q.get('to'));
	const to = toDay ? new Date(toDay.getTime() + 86_400_000) : null;
	const page = Math.max(0, Number.parseInt(q.get('page') ?? '0', 10) || 0);
	const confirmId = parseId(q.get('revert'));
	const history = guarded(() => listHistory(db, actor, { entity, actorType, from, to, page }));
	let confirm = null;
	if (confirmId !== null) {
		try {
			confirm = getHistoryItem(db, actor, confirmId);
		} catch (err) {
			if (!(err instanceof NotFoundError)) throw err;
		}
	}
	return {
		...history,
		filter: {
			entity: entity ?? '',
			actor: actorType ?? '',
			from: from ? q.get('from')! : '',
			to: toDay ? q.get('to')! : ''
		},
		confirm
	};
};

export const actions: Actions = {
	revert: async ({ locals, request, url }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		const entryId = parseId(text(form, 'entry_id'));
		try {
			if (entryId === null) throw new NotFoundError();
			revertEntry(db, actor, entryId, locales);
		} catch (err) {
			return handleServiceError(err, form, { entryId });
		}
		const back = new URLSearchParams(url.searchParams);
		back.delete('revert');
		back.delete('/revert');
		back.set('reverted', String(entryId));
		redirect(303, `/manage/history?${back.toString()}`);
	}
};
