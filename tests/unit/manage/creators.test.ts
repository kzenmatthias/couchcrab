import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '#lib/server/db/schema.js';
import { ForbiddenError, ValidationError } from '#lib/server/manage/core.js';
import {
	addChannel,
	createCreator,
	deleteCreator,
	parseChannelInput,
	resolveChannel,
	updateCreator
} from '#lib/server/manage/creators.js';
import { createYouTubeClient } from '#lib/server/youtube/client.js';
import { fakeFetch, json } from '../auth/helpers.js';
import { auditRows, creatorBySlug, lastAudit, seeded } from './fixtures.js';

let env: ReturnType<typeof seeded>;
beforeEach(() => {
	env = seeded();
});

const fields = { name: 'Mossy Lantern', color: '#4a7c59', bio: 'Builds lanterns.' };

const errorsOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (err) {
		if (err instanceof ValidationError) return err.errors;
		throw err;
	}
	throw new Error('Expected a ValidationError');
};

describe('creators', () => {
	it('creates a creator with a slug from the name and an audit entry', () => {
		const row = createCreator(env.db, env.editor, fields);
		expect(row).toMatchObject({ slug: 'mossy-lantern', name: 'Mossy Lantern', optedOut: false });
		expect(lastAudit(env.db)).toMatchObject({
			actor: 'user',
			actorUserId: env.editor.id,
			entity: 'creator',
			entityId: row.id,
			before: null,
			after: { slug: 'mossy-lantern', color: '#4a7c59', bio: 'Builds lanterns.' }
		});
	});

	it('makes a generated slug unique and rejects a taken one', () => {
		expect(createCreator(env.db, env.editor, { ...fields, name: 'Pebblewick' }).slug).toBe(
			'pebblewick-2'
		);
		expect(
			errorsOf(() => createCreator(env.db, env.editor, { ...fields, slug: 'pebblewick' }))
		).toEqual({ slug: 'slug_taken' });
	});

	it('validates the fields', () => {
		expect(
			errorsOf(() =>
				createCreator(env.db, env.editor, { name: '', color: 'red', avatar_url: 'ftp://x' })
			)
		).toEqual({ name: 'required', color: 'invalid_color', avatar_url: 'invalid_url' });
	});

	it('needs an editor', () => {
		expect(() => createCreator(env.db, env.viewer, fields)).toThrow(ForbiddenError);
		expect(auditRows(env.db)).toHaveLength(0);
	});

	it('lets only admins set the opt-out flag', () => {
		expect(
			errorsOf(() => createCreator(env.db, env.editor, { ...fields, opted_out: '1' }))
		).toEqual({ opted_out: 'admin_only' });
		expect(createCreator(env.db, env.admin, { ...fields, opted_out: '1' }).optedOut).toBe(true);
	});

	it("keeps a claimed creator's bio, avatar and colour from editors, not from admins", () => {
		const juno = creatorBySlug(env.db, 'tidecaller-juno');
		const base = { name: juno.name, slug: juno.slug, color: juno.color, bio: juno.bio ?? '' };
		expect(
			errorsOf(() => updateCreator(env.db, env.editor, juno.id, { ...base, bio: 'Hacked' }))
		).toEqual({ bio: 'claimed_locked' });
		// Unchanged values (or the fields left out) are fine; the name is the editors' to fix.
		expect(updateCreator(env.db, env.editor, juno.id, { ...base, name: 'Juno' }).name).toBe('Juno');
		expect(
			updateCreator(env.db, env.editor, juno.id, { name: 'Juno T', slug: juno.slug }).bio
		).toBe(juno.bio);
		const row = updateCreator(env.db, env.admin, juno.id, { ...base, bio: 'New bio' });
		expect(row.bio).toBe('New bio');
		expect(lastAudit(env.db)).toMatchObject({
			entity: 'creator',
			before: { bio: juno.bio },
			after: { bio: 'New bio' }
		});
	});

	it('deletes only creators without videos', () => {
		const juno = creatorBySlug(env.db, 'tidecaller-juno');
		expect(errorsOf(() => deleteCreator(env.db, env.admin, juno.id))).toEqual({
			creator: 'has_videos'
		});
		const fresh = createCreator(env.db, env.editor, fields);
		deleteCreator(env.db, env.editor, fresh.id);
		expect(
			env.db.select().from(t.creators).where(eq(t.creators.id, fresh.id)).get()
		).toBeUndefined();
		expect(lastAudit(env.db)).toMatchObject({ entity: 'creator', entityId: fresh.id, after: null });
	});
});

describe('channels', () => {
	const ID = 'UCabcdefghijklmnopqrstuv';

	it('reads ids, handles and channel URLs', () => {
		expect(parseChannelInput(ID)).toEqual({ type: 'id', id: ID });
		expect(parseChannelInput('@MossyLantern')).toEqual({ type: 'handle', handle: '@MossyLantern' });
		expect(parseChannelInput(`https://www.youtube.com/channel/${ID}`)).toEqual({
			type: 'id',
			id: ID
		});
		expect(parseChannelInput('youtube.com/@mossy.lantern/videos')).toEqual({
			type: 'handle',
			handle: '@mossy.lantern'
		});
		expect(parseChannelInput('https://example.org/@mossy')).toBeNull();
		expect(parseChannelInput('mossy')).toBeNull();
	});

	it('accepts only a raw id without an API key', async () => {
		await expect(resolveChannel(null, ID)).resolves.toEqual({
			youtubeChannelId: ID,
			title: '',
			checked: false
		});
		await expect(resolveChannel(null, '@mossy')).rejects.toMatchObject({
			errors: { channel: 'needs_channel_id' }
		});
	});

	it('looks a handle up with channels.list and forHandle', async () => {
		const { fetch, calls } = fakeFetch({
			'https://www.googleapis.com/youtube/v3/channels': (url) =>
				json({
					items:
						url.searchParams.get('forHandle') === '@mossy'
							? [{ id: ID, snippet: { title: 'Mossy Lantern' } }]
							: []
				})
		});
		const client = createYouTubeClient({ apiKey: 'k', fetch });
		await expect(resolveChannel(client, '@mossy')).resolves.toEqual({
			youtubeChannelId: ID,
			title: 'Mossy Lantern',
			checked: true
		});
		await expect(resolveChannel(client, '@nobody')).rejects.toMatchObject({
			errors: { channel: 'channel_not_found' }
		});
		expect(calls).toHaveLength(2);
	});

	it('adds a channel once, with history', () => {
		const juno = creatorBySlug(env.db, 'tidecaller-juno');
		const row = addChannel(env.db, env.editor, juno.id, {
			youtube_channel_id: ID,
			title: 'Juno Extra',
			kind: 'secondary'
		});
		expect(row).toMatchObject({ kind: 'secondary', syncEnabled: true, creatorId: juno.id });
		expect(lastAudit(env.db)).toMatchObject({ entity: 'channel', entityId: row.id, before: null });
		expect(() => addChannel(env.db, env.editor, juno.id, { youtube_channel_id: ID })).toThrow(
			ValidationError
		);
	});
});
