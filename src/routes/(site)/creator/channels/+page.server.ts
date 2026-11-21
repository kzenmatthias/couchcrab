import { db } from '#lib/server/db/index.js';
import { id as parseId, NotFoundError, text } from '#lib/server/manage/core.js';
import { creatorActorFor } from '#lib/server/manage/creator-http.js';
import {
	listOwnChannels,
	listOwnPendingClaims,
	unlinkOwnChannel
} from '#lib/server/manage/creator-self.js';
import { handleServiceError, load as guarded } from '#lib/server/manage/http.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const actor = creatorActorFor(locals);
	return {
		channels: guarded(() => listOwnChannels(db, actor)),
		pending: guarded(() => listOwnPendingClaims(db, actor))
	};
};

export const actions: Actions = {
	/** Step one of unlinking: show what happens and ask to confirm. */
	askUnlink: async ({ locals, request }) => {
		creatorActorFor(locals);
		const form = await request.formData();
		return { confirm: 'unlink' as const, channelId: parseId(text(form, 'channel_id')) };
	},

	unlink: async ({ locals, request }) => {
		const actor = creatorActorFor(locals);
		const form = await request.formData();
		const channelId = parseId(text(form, 'channel_id'));
		try {
			if (channelId === null) throw new NotFoundError();
			unlinkOwnChannel(db, actor, channelId);
		} catch (err) {
			return handleServiceError(err, form);
		}
		return { saved: 'unlinked' as const };
	}
};
