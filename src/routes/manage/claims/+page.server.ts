import { db } from '#lib/server/db/index.js';
import { approveClaim, listPendingClaims, rejectClaim } from '#lib/server/manage/claims.js';
import { id as parseId, NotFoundError, text } from '#lib/server/manage/core.js';
import { listCreators } from '#lib/server/manage/creators.js';
import { actorFor, handleServiceError, load as guarded } from '#lib/server/manage/http.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const actor = actorFor(locals, 'admin');
	return guarded(() => ({
		claims: listPendingClaims(db, actor),
		creators: listCreators(db, actor).map((c) => ({ id: c.id, name: c.name }))
	}));
};

const claimId = (form: FormData) => {
	const n = parseId(text(form, 'claim_id'));
	if (n === null) throw new NotFoundError();
	return n;
};

export const actions: Actions = {
	approve: async ({ locals, request }) => {
		const actor = actorFor(locals, 'admin');
		const form = await request.formData();
		try {
			approveClaim(db, actor, claimId(form), form);
		} catch (err) {
			return handleServiceError(err, form, { claimId: parseId(text(form, 'claim_id')) });
		}
		return { done: 'approved' as const };
	},
	askReject: async ({ locals, request }) => {
		actorFor(locals, 'admin');
		const form = await request.formData();
		return { confirm: parseId(text(form, 'claim_id')) };
	},
	reject: async ({ locals, request }) => {
		const actor = actorFor(locals, 'admin');
		const form = await request.formData();
		try {
			rejectClaim(db, actor, claimId(form));
		} catch (err) {
			return handleServiceError(err, form);
		}
		return { done: 'rejected' as const };
	}
};
