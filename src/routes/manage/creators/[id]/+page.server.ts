import { redirect } from '@sveltejs/kit';
import { YOUTUBE_API_KEY } from '$app/env/private';
import { db } from '#lib/server/db/index.js';
import {
	addChannel,
	deleteChannel,
	deleteCreator,
	getCreator,
	resolveChannel,
	restoreChannel,
	updateChannel,
	updateCreator
} from '#lib/server/manage/creators.js';
import { hasRole, NotFoundError, id as parseId, text } from '#lib/server/manage/core.js';
import {
	actorFor,
	formValues,
	handleServiceError,
	load as guarded,
	paramId
} from '#lib/server/manage/http.js';
import { youtubeClientFor } from '#lib/server/manage/sync.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const actor = actorFor(locals, 'editor');
	const creatorId = paramId(params.id);
	const detail = guarded(() => getCreator(db, actor, creatorId));
	return {
		...detail,
		hasApiKey: Boolean(YOUTUBE_API_KEY),
		canEditClaimed: hasRole(actor, 'admin'),
		saved: url.searchParams.get('saved') === '1'
	};
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			updateCreator(db, actor, paramId(params.id), form);
		} catch (err) {
			return handleServiceError(err, form, { action: 'save' });
		}
		return { saved: 'creator' as const };
	},

	/** Step one of deleting: show the confirmation. */
	askDelete: ({ locals }) => {
		actorFor(locals, 'editor');
		return { confirm: 'creator' as const };
	},

	delete: ({ locals, params }) => {
		const actor = actorFor(locals, 'editor');
		try {
			deleteCreator(db, actor, paramId(params.id));
		} catch (err) {
			return handleServiceError(err, undefined, { action: 'delete' });
		}
		redirect(303, '/manage/creators?deleted=1');
	},

	/** Step one of adding a channel: resolve what was typed and show it for confirmation. */
	lookup: async ({ locals, request }) => {
		actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			const found = await resolveChannel(youtubeClientFor(YOUTUBE_API_KEY), text(form, 'channel'));
			return { lookup: found, values: formValues(form) };
		} catch (err) {
			return handleServiceError(err, form, { action: 'lookup' });
		}
	},

	addChannel: async ({ locals, params, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			addChannel(db, actor, paramId(params.id), form);
		} catch (err) {
			return handleServiceError(err, form, { action: 'addChannel' });
		}
		return { saved: 'channel_added' as const };
	},

	updateChannel: async ({ locals, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		const channelId = parseId(text(form, 'channel_id'));
		try {
			if (channelId === null) throw new NotFoundError();
			updateChannel(db, actor, channelId, form);
		} catch (err) {
			return handleServiceError(err, form, { action: 'updateChannel', channelId });
		}
		return { saved: 'channel' as const };
	},

	askDeleteChannel: async ({ locals, request }) => {
		actorFor(locals, 'editor');
		const form = await request.formData();
		return { confirm: 'channel' as const, channelId: parseId(text(form, 'channel_id')) };
	},

	deleteChannel: async ({ locals, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		const channelId = parseId(text(form, 'channel_id'));
		try {
			if (channelId === null) throw new NotFoundError();
			deleteChannel(db, actor, channelId);
		} catch (err) {
			return handleServiceError(err, form, { action: 'deleteChannel' });
		}
		return { saved: 'channel_deleted' as const };
	},

	/** Admins link a channel the creator unlinked back to the profile. */
	restoreChannel: async ({ locals, request }) => {
		const actor = actorFor(locals, 'admin');
		const form = await request.formData();
		const channelId = parseId(text(form, 'channel_id'));
		try {
			if (channelId === null) throw new NotFoundError();
			restoreChannel(db, actor, channelId);
		} catch (err) {
			return handleServiceError(err, form, { action: 'restoreChannel' });
		}
		return { saved: 'channel_restored' as const };
	}
};
