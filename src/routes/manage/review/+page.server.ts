import { locales } from '#lib/paraglide/runtime.js';
import { db } from '#lib/server/db/index.js';
import {
	approveSuggestion,
	askQuestion,
	listReviewQueue,
	REVIEW_MESSAGE_MAX,
	rejectSuggestion
} from '#lib/server/community/review.js';
import { id as parseId, NotFoundError, text } from '#lib/server/manage/core.js';
import { actorFor, handleServiceError, load as guarded } from '#lib/server/manage/http.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const actor = actorFor(locals, 'editor');
	return {
		items: guarded(() => listReviewQueue(db, actor)),
		messageMax: REVIEW_MESSAGE_MAX
	};
};

const suggestionId = (form: FormData) => {
	const n = parseId(text(form, 'suggestion_id'));
	if (n === null) throw new NotFoundError();
	return n;
};
const extra = (form: FormData) => ({ suggestionId: parseId(text(form, 'suggestion_id')) });

export const actions: Actions = {
	approve: async ({ locals, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			approveSuggestion(db, actor, suggestionId(form), locales);
		} catch (err) {
			return handleServiceError(err, form, extra(form));
		}
		return { done: 'approved' as const, title: text(form, 'title') };
	},
	reject: async ({ locals, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			rejectSuggestion(db, actor, suggestionId(form), form);
		} catch (err) {
			return handleServiceError(err, form, extra(form));
		}
		return { done: 'rejected' as const, title: text(form, 'title') };
	},
	ask: async ({ locals, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			askQuestion(db, actor, suggestionId(form), form);
		} catch (err) {
			return handleServiceError(err, form, extra(form));
		}
		return { done: 'asked' as const, title: text(form, 'title') };
	}
};
