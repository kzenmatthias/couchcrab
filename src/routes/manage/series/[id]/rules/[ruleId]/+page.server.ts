import { redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import {
	actorFor,
	formValues,
	handleServiceError,
	load as guarded,
	paramId
} from '#lib/server/manage/http.js';
import { deleteRule, getRule, testRule, updateRule } from '#lib/server/manage/rules.js';
import { ruleContext } from '../../../rules-shared.server.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const actor = actorFor(locals, 'editor');
	const seriesId = paramId(params.id);
	return {
		rule: guarded(() => getRule(db, actor, seriesId, paramId(params.ruleId))),
		...ruleContext(seriesId),
		saved: url.searchParams.get('saved') === '1'
	};
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			updateRule(db, actor, paramId(params.id), paramId(params.ruleId), form);
		} catch (err) {
			return handleServiceError(err, form);
		}
		return { saved: true };
	},
	test: async ({ locals, params, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			return { test: testRule(db, actor, paramId(params.id), form), values: formValues(form) };
		} catch (err) {
			return handleServiceError(err, form);
		}
	},
	askDelete: ({ locals }) => {
		actorFor(locals, 'editor');
		return { confirm: true };
	},
	delete: ({ locals, params }) => {
		const actor = actorFor(locals, 'editor');
		try {
			deleteRule(db, actor, paramId(params.id), paramId(params.ruleId));
		} catch (err) {
			return handleServiceError(err);
		}
		redirect(303, `/manage/series/${params.id}/rules?deleted=1`);
	}
};
