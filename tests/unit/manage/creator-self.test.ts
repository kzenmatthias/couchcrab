import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '#lib/server/db/client.js';
import * as t from '#lib/server/db/schema.js';
import { ForbiddenError, ValidationError } from '#lib/server/manage/core.js';
import {
	assertOwnCreator,
	type CreatorActor,
	listOwnChannels,
	listOwnVideos,
	ownPlacementChoices,
	placeOwnVideo,
	relinkOwnChannel,
	setOwnOptOut,
	setOwnVideoStatus,
	unlinkOwnChannel,
	updateOwnProfile
} from '#lib/server/manage/creator-self.js';
import {
	channelSnapshot,
	getCreator,
	lastCreatorEdit,
	restoreChannel
} from '#lib/server/manage/creators.js';
import { creatorBySlug, lastAudit, seeded, seriesBySlug } from './fixtures.js';

const errorsOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (err) {
		if (err instanceof ValidationError) return err.errors;
		throw err;
	}
	return null;
};

const videoTitled = (db: DB, title: string) =>
	db.select().from(t.videos).where(eq(t.videos.title, title)).get()!;

/** The first video on a creator's main channel. */
const videoOf = (db: DB, slug: string) =>
	db
		.select({ id: t.videos.id })
		.from(t.videos)
		.innerJoin(t.channels, eq(t.channels.id, t.videos.channelId))
		.innerJoin(t.creators, eq(t.creators.id, t.channels.creatorId))
		.where(and(eq(t.creators.slug, slug), eq(t.channels.kind, 'main')))
		.get()!;

describe('creator dashboard service', () => {
	let env: ReturnType<typeof seeded>;
	let juno: CreatorActor;

	beforeEach(() => {
		env = seeded();
		const user = env.db.select().from(t.users).where(eq(t.users.name, 'Tidecaller Juno')).get()!;
		juno = { id: user.id, creatorId: user.creatorId! };
	});

	describe('own creator only', () => {
		it('accepts the user who claimed the profile', () => {
			expect(assertOwnCreator(env.db, juno).slug).toBe('tidecaller-juno');
		});

		it('refuses another creator, even when the session says so', () => {
			const other = creatorBySlug(env.db, 'pebblewick');
			expect(() => assertOwnCreator(env.db, { ...juno, creatorId: other.id })).toThrow(
				ForbiddenError
			);
			expect(() =>
				updateOwnProfile(env.db, { ...juno, creatorId: other.id }, { color: '#2ec4b6' })
			).toThrow(ForbiddenError);
			expect(creatorBySlug(env.db, 'pebblewick').color).toBe(other.color);
		});

		it('refuses users without a claimed profile, also editors and admins', () => {
			const creatorId = juno.creatorId;
			expect(() => assertOwnCreator(env.db, { id: env.viewer.id, creatorId })).toThrow(
				ForbiddenError
			);
			expect(() => setOwnOptOut(env.db, { id: env.admin.id, creatorId }, true)).toThrow(
				ForbiddenError
			);
		});
	});

	describe('profile', () => {
		it('saves bio, avatar, colour and links with actor creator', () => {
			const row = updateOwnProfile(env.db, juno, {
				bio: 'Tide pools and lighthouses.',
				avatar_url: 'https://example.org/juno.png',
				color: '#2EC4B6',
				links: 'https://example.org\n\n  https://example.org/shop  \nhttps://example.org'
			});
			expect(row).toMatchObject({
				bio: 'Tide pools and lighthouses.',
				avatarUrl: 'https://example.org/juno.png',
				color: '#2ec4b6',
				links: ['https://example.org/', 'https://example.org/shop']
			});
			expect(lastAudit(env.db)).toMatchObject({
				actor: 'creator',
				actorUserId: juno.id,
				entity: 'creator',
				entityId: juno.creatorId,
				after: { bio: 'Tide pools and lighthouses.', color: '#2ec4b6' }
			});
		});

		it('only accepts the colour choices or the colour the profile already has', () => {
			const current = creatorBySlug(env.db, 'tidecaller-juno').color;
			expect(errorsOf(() => updateOwnProfile(env.db, juno, { color: '#ffff00' }))).toEqual({
				color: 'invalid_choice'
			});
			expect(errorsOf(() => updateOwnProfile(env.db, juno, { color: '' }))).toEqual({
				color: 'required'
			});
			expect(updateOwnProfile(env.db, juno, { color: current }).color).toBe(current);
		});

		it('validates links and the avatar URL', () => {
			expect(
				errorsOf(() =>
					updateOwnProfile(env.db, juno, {
						color: '#2ec4b6',
						avatar_url: 'javascript:alert(1)',
						links: 'https://example.org\nnot a url'
					})
				)
			).toEqual({ avatar_url: 'invalid_url', links: 'invalid_url' });
			const six = Array.from({ length: 6 }, (_, i) => `https://example.org/${i}`).join('\n');
			expect(
				errorsOf(() => updateOwnProfile(env.db, juno, { color: '#2ec4b6', links: six }))
			).toEqual({ links: 'too_long' });
		});

		it('shows admins when the creator last edited their own profile', () => {
			expect(lastCreatorEdit(env.db, juno.creatorId)).toBeNull();
			updateOwnProfile(env.db, juno, { color: '#2ec4b6', bio: 'Hi' });
			expect(getCreator(env.db, env.admin, juno.creatorId).lastCreatorEdit).toBeInstanceOf(Date);
		});
	});

	describe('own videos only, participating series only', () => {
		it('lists own videos only, unsorted first', () => {
			const videos = listOwnVideos(env.db, juno);
			expect(videos.length).toBeGreaterThan(3);
			const ranks = videos.map((v) => ['unsorted', 'placed', 'ignored'].indexOf(v.status));
			expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
			expect(videos[0].status).toBe('unsorted');
			expect(listOwnVideos(env.db, juno, { status: 'placed' }).every((v) => v.seriesId)).toBe(true);
			const all = env.db.select({ id: t.videos.id }).from(t.videos).all().length;
			expect(videos.length).toBeLessThan(all);
		});

		it('offers the series the creator takes part in and their Extras', () => {
			const { series } = ownPlacementChoices(env.db, juno);
			const slugs = series.map((s) => s.title);
			expect(slugs).toContain('Lanternfall Season 3');
			expect(slugs).toContain('Lanternfall Season 3 Extras');
			expect(slugs).not.toContain(seriesBySlug(env.db, 'skyforge-games-2026').title);
		});

		it('places an own video with placed_by user and actor creator', () => {
			const video = videoTitled(env.db, 'Tide pool tour, part one');
			const season = seriesBySlug(env.db, 'lanternfall-season-3');
			const row = placeOwnVideo(env.db, juno, video.id, { series_id: String(season.id) });
			expect(row).toMatchObject({ status: 'placed', placedBy: 'user', seriesId: season.id });
			expect(lastAudit(env.db)).toMatchObject({
				actor: 'creator',
				actorUserId: juno.id,
				entity: 'video',
				entityId: video.id,
				before: { status: 'unsorted', seriesId: null },
				after: { status: 'placed', seriesId: season.id, placedBy: 'user' }
			});
			const extras = seriesBySlug(env.db, 'lanternfall-season-3-extras');
			expect(placeOwnVideo(env.db, juno, video.id, { series_id: String(extras.id) }).seriesId).toBe(
				extras.id
			);
		});

		it("refuses another creator's video", () => {
			const other = videoOf(env.db, 'pebblewick');
			const season = seriesBySlug(env.db, 'lanternfall-season-3');
			const before = env.db.select().from(t.videos).where(eq(t.videos.id, other.id)).get();
			expect(() => placeOwnVideo(env.db, juno, other.id, { series_id: String(season.id) })).toThrow(
				ForbiddenError
			);
			expect(() => setOwnVideoStatus(env.db, juno, other.id, 'ignored')).toThrow(ForbiddenError);
			expect(env.db.select().from(t.videos).where(eq(t.videos.id, other.id)).get()).toEqual(before);
		});

		it('refuses a series the creator does not take part in', () => {
			const video = videoTitled(env.db, 'Tide pool tour, part one');
			const event = seriesBySlug(env.db, 'skyforge-games-2026');
			expect(() => placeOwnVideo(env.db, juno, video.id, { series_id: String(event.id) })).toThrow(
				ForbiddenError
			);
			expect(videoTitled(env.db, 'Tide pool tour, part one').status).toBe('unsorted');
		});

		it('checks the group belongs to the series', () => {
			const video = videoTitled(env.db, 'Tide pool tour, part one');
			const season = seriesBySlug(env.db, 'lanternfall-season-3');
			const otherGroup = env.db.select().from(t.groups).get()!;
			expect(otherGroup.seriesId).not.toBe(season.id);
			expect(
				errorsOf(() =>
					placeOwnVideo(env.db, juno, video.id, {
						series_id: String(season.id),
						group_id: String(otherGroup.id)
					})
				)
			).toEqual({ group_id: 'group_mismatch' });
		});

		it('ignores an own video and puts it back in Unsorted', () => {
			const video = videoTitled(env.db, 'Answering your sea questions');
			expect(setOwnVideoStatus(env.db, juno, video.id, 'ignored').status).toBe('ignored');
			expect(lastAudit(env.db)).toMatchObject({ actor: 'creator', entity: 'video' });
			expect(setOwnVideoStatus(env.db, juno, video.id, 'unsorted')).toMatchObject({
				status: 'unsorted',
				seriesId: null
			});
		});
	});

	describe('channels', () => {
		it('shows verified and needs-review channels', () => {
			const channels = listOwnChannels(env.db, juno);
			expect(channels.map((c) => [c.kind, c.verified])).toEqual([
				['main', true],
				['secondary', false]
			]);
		});

		it('unlinks a secondary channel only, without deleting anything', () => {
			const [main, second] = listOwnChannels(env.db, juno);
			expect(errorsOf(() => unlinkOwnChannel(env.db, juno, main.id))).toEqual({
				channel: 'invalid_choice'
			});
			const videosBefore = env.db
				.select()
				.from(t.videos)
				.where(eq(t.videos.channelId, second.id))
				.all();
			expect(videosBefore.length).toBeGreaterThan(0);

			const row = unlinkOwnChannel(env.db, juno, second.id);
			expect(row).toMatchObject({ unlinkedByUserId: juno.id, syncEnabled: false });
			expect(row.unlinkedAt).toBeInstanceOf(Date);
			// The channel and its videos stay; the videos leave My videos.
			expect(listOwnChannels(env.db, juno)).toHaveLength(2);
			expect(env.db.select().from(t.videos).where(eq(t.videos.channelId, second.id)).all()).toEqual(
				videosBefore
			);
			const visible = listOwnVideos(env.db, juno).map((v) => v.id);
			for (const v of videosBefore) expect(visible).not.toContain(v.id);
			expect(() => setOwnVideoStatus(env.db, juno, videosBefore[0].id, 'ignored')).toThrow(
				ForbiddenError
			);
		});

		it('writes a revertable audit entry and links the channel again', () => {
			const second = listOwnChannels(env.db, juno)[1];
			unlinkOwnChannel(env.db, juno, second.id);
			const entry = lastAudit(env.db);
			expect(entry).toMatchObject({
				actor: 'creator',
				actorUserId: juno.id,
				entity: 'channel',
				entityId: second.id,
				before: { unlinkedAt: null, unlinkedByUserId: null, syncEnabled: true, kind: 'secondary' },
				after: { unlinkedByUserId: juno.id, syncEnabled: false }
			});
			expect(typeof entry.after?.unlinkedAt).toBe('string');

			relinkOwnChannel(env.db, juno, second.id);
			const relinked = env.db.select().from(t.channels).where(eq(t.channels.id, second.id)).get()!;
			// Linking again restores exactly the state the audit entry had before.
			expect(channelSnapshot(relinked)).toEqual(entry.before);
			expect(lastAudit(env.db)).toMatchObject({ actor: 'creator', before: entry.after });
		});

		it('lets admins, not editors, restore an unlinked channel', () => {
			const second = listOwnChannels(env.db, juno)[1];
			unlinkOwnChannel(env.db, juno, second.id);
			expect(() => restoreChannel(env.db, env.editor, second.id)).toThrow(ForbiddenError);
			expect(restoreChannel(env.db, env.admin, second.id)).toMatchObject({
				unlinkedAt: null,
				syncEnabled: true
			});
			expect(lastAudit(env.db)).toMatchObject({ actor: 'user', actorUserId: env.admin.id });
		});

		it("refuses another creator's channel", () => {
			const other = env.db
				.select()
				.from(t.channels)
				.where(eq(t.channels.creatorId, creatorBySlug(env.db, 'pebblewick').id))
				.all()
				.find((c) => c.kind === 'secondary')!;
			expect(() => unlinkOwnChannel(env.db, juno, other.id)).toThrow(ForbiddenError);
			expect(() => relinkOwnChannel(env.db, juno, other.id)).toThrow(ForbiddenError);
		});
	});

	describe('opt out', () => {
		it('sets and clears opted_out with an audit entry', () => {
			expect(setOwnOptOut(env.db, juno, true).optedOut).toBe(true);
			expect(lastAudit(env.db)).toMatchObject({
				actor: 'creator',
				entity: 'creator',
				before: { optedOut: false },
				after: { optedOut: true }
			});
			expect(setOwnOptOut(env.db, juno, false).optedOut).toBe(false);
		});
	});
});
