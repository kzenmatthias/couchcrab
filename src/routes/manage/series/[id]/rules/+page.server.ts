import { redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { actorFor, handleServiceError, load as guarded, paramId } from '#lib/server/manage/http.js';
import { createRule, listRules, testRule } from '#lib/server/manage/rules.js';
import { formValues } from '#lib/server/manage/http.js';
import { ruleContext } from '../../rules-shared.server.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const actor = actorFor(locals, 'editor');
	const seriesId = paramId(params.id);
	return {
		rules: guarded(() => listRules(db, actor, seriesId)),
		...ruleContext(seriesId),
		deleted: url.searchParams.get('deleted') === '1'
	};
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		let ruleId: number;
		try {
			ruleId = createRule(db, actor, paramId(params.id), form).id;
		} catch (err) {
			return handleServiceError(err, form);
		}
		redirect(303, `/manage/series/${params.id}/rules/${ruleId}?saved=1`);
	},
	test: async ({ locals, params, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			return { test: testRule(db, actor, paramId(params.id), form), values: formValues(form) };
		} catch (err) {
			return handleServiceError(err, form);
		}
	}
};
