import { db } from '#lib/server/db/index.js';
import { id as parseId, NotFoundError, text } from '#lib/server/manage/core.js';
import { actorFor, handleServiceError, load as guarded, paramId } from '#lib/server/manage/http.js';
import { createGroup, deleteGroup, listGroups, updateGroup } from '#lib/server/manage/series.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const actor = actorFor(locals, 'editor');
	return { groups: guarded(() => listGroups(db, actor, paramId(params.id))) };
};

const groupId = (form: FormData) => {
	const n = parseId(text(form, 'group_id'));
	if (n === null) throw new NotFoundError();
	return n;
};

export const actions: Actions = {
	create: async ({ locals, params, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			createGroup(db, actor, paramId(params.id), form);
		} catch (err) {
			return handleServiceError(err, form, { action: 'create' });
		}
		return { saved: 'created' as const };
	},
	update: async ({ locals, params, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			updateGroup(db, actor, paramId(params.id), groupId(form), form);
		} catch (err) {
			return handleServiceError(err, form, {
				action: 'update',
				groupId: parseId(text(form, 'group_id'))
			});
		}
		return { saved: 'updated' as const };
	},
	askDelete: async ({ locals, request }) => {
		actorFor(locals, 'editor');
		const form = await request.formData();
		return { confirm: parseId(text(form, 'group_id')) };
	},
	delete: async ({ locals, params, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			deleteGroup(db, actor, paramId(params.id), groupId(form));
		} catch (err) {
			return handleServiceError(err, form, { action: 'delete' });
		}
		return { saved: 'deleted' as const };
	}
};
