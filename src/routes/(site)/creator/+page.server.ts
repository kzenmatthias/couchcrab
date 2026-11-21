import { db } from '#lib/server/db/index.js';
import { creatorActorFor } from '#lib/server/manage/creator-http.js';
import { getOwnProfile, setOwnOptOut, updateOwnProfile } from '#lib/server/manage/creator-self.js';
import { handleServiceError, load as guarded } from '#lib/server/manage/http.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const actor = creatorActorFor(locals);
	const { creator, unsorted } = guarded(() => getOwnProfile(db, actor));
	return {
		creator: {
			name: creator.name,
			slug: creator.slug,
			color: creator.color,
			avatarUrl: creator.avatarUrl,
			bio: creator.bio,
			links: creator.links,
			optedOut: creator.optedOut
		},
		unsorted
	};
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const actor = creatorActorFor(locals);
		const form = await request.formData();
		try {
			updateOwnProfile(db, actor, form);
		} catch (err) {
			return handleServiceError(err, form, { action: 'save' as const });
		}
		return { saved: 'profile' as const };
	},

	/** Step one of opting out: explain and ask to confirm. */
	askOptOut: ({ locals }) => {
		creatorActorFor(locals);
		return { confirm: 'optOut' as const };
	},

	optOut: ({ locals }) => {
		const actor = creatorActorFor(locals);
		try {
			setOwnOptOut(db, actor, true);
		} catch (err) {
			return handleServiceError(err);
		}
		return { saved: 'opted_out' as const };
	},

	optIn: ({ locals }) => {
		const actor = creatorActorFor(locals);
		try {
			setOwnOptOut(db, actor, false);
		} catch (err) {
			return handleServiceError(err);
		}
		return { saved: 'opted_in' as const };
	}
};
