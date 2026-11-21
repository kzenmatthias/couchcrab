import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { claimCreator, classifyOwnedChannels, loadClaimCheck } from '#lib/server/auth/claims.js';
import { requireUser } from '#lib/server/auth/guards.js';
import { deleteSessionCookie, invalidateSession } from '#lib/server/auth/session.js';
import { db } from '#lib/server/db/index.js';
import { creators } from '#lib/server/db/schema.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user || !locals.sessionId) redirect(303, '/signin');
	const user = locals.user;
	const owned = loadClaimCheck(db, locals.sessionId, user.id);
	const claimedCreator =
		user.creatorId === null
			? null
			: (db
					.select({ name: creators.name, slug: creators.slug, optedOut: creators.optedOut })
					.from(creators)
					.where(eq(creators.id, user.creatorId))
					.get() ?? null);
	return {
		check: owned ? classifyOwnedChannels(db, owned, user) : null,
		claimedCreator
	};
};

export const actions: Actions = {
	claim: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const creatorId = Number(form.get('creator_id'));
		if (!Number.isInteger(creatorId) || creatorId <= 0 || !locals.sessionId) {
			return fail(400, { error: 'not_claimable' as const });
		}
		const result = claimCreator(db, { sessionId: locals.sessionId, userId: user.id, creatorId });
		if (!result.ok) return fail(result.reason === 'expired' ? 410 : 409, { error: result.reason });
		const creator = db
			.select({ name: creators.name })
			.from(creators)
			.where(eq(creators.id, creatorId))
			.get();
		return { claimed: creator?.name ?? '' };
	},

	/** "This isn't me": sign out (which also drops the channel check). */
	notme: ({ locals, cookies, url }) => {
		if (locals.sessionId) invalidateSession(db, locals.sessionId);
		deleteSessionCookie(cookies, url);
		redirect(303, '/');
	}
};
