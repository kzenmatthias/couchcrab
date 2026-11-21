import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '#lib/server/db/schema.js';
import { ValidationError } from '#lib/server/manage/core.js';
import {
	type CreatorActor,
	listOwnChannels,
	relinkOwnChannel,
	setOwnOptOut,
	unlinkOwnChannel
} from '#lib/server/manage/creator-self.js';
import { restoreChannel, updateChannel } from '#lib/server/manage/creators.js';
import { dashboard } from '#lib/server/manage/dashboard.js';
import { listQueue } from '#lib/server/manage/videos.js';
import { listHistory, revertBlock, revertEntry } from '#lib/server/community/history.js';
import { approveSuggestion, listReviewQueue, pendingCounts } from '#lib/server/community/review.js';
import { createSuggestion } from '#lib/server/community/suggestions.js';
import { loadVideoTarget } from '#lib/server/community/targets.js';
import { lastAudit, seeded, seriesBySlug } from '../manage/fixtures.js';

const LOCALES = ['en', 'nl'] as const;
let env: ReturnType<typeof seeded>;
let juno: CreatorActor;
let second: { id: number };

const errorsOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (err) {
		if (err instanceof ValidationError) return err.errors;
		throw err;
	}
	throw new Error('Expected a ValidationError');
};

const channel = (id: number) =>
	env.db.select().from(t.channels).where(eq(t.channels.id, id)).get()!;

/** A public video on Juno's second channel, and one in Unsorted. */
function videosOnSecond() {
	const series = seriesBySlug(env.db, 'lanternfall-season-3');
	const insert = (status: 'placed' | 'unsorted', n: number) =>
		env.db
			.insert(t.videos)
			.values({
				youtubeVideoId: `xround${n}${status}`,
				channelId: second.id,
				title: `Second channel ${status}`,
				publishedAt: new Date('2026-10-01T12:00:00Z'),
				durationS: 900,
				status,
				placedBy: status === 'placed' ? 'rule' : null,
				seriesId: status === 'placed' ? series.id : null,
				fetchedAt: new Date()
			})
			.returning()
			.get();
	return { placed: insert('placed', 1), unsorted: insert('unsorted', 2), series };
}

beforeEach(() => {
	env = seeded();
	const user = env.db.select().from(t.users).where(eq(t.users.name, 'Tidecaller Juno')).get()!;
	juno = { id: user.id, creatorId: user.creatorId! };
	second = listOwnChannels(env.db, juno).find((c) => c.kind === 'secondary')!;
});

describe('videos of unlinked channels and opted-out creators', () => {
	it('are no suggest targets and leave the review queue, its counts and approval', () => {
		const { placed } = videosOnSecond();
		const other = seriesBySlug(env.db, 'ember-hearts');
		const id = createSuggestion(env.db, env.viewer.id, 'video', placed.youtubeVideoId, {
			type: 'video_series',
			series_id: other.id
		});
		const before = pendingCounts(env.db, env.editor).suggestions;
		unlinkOwnChannel(env.db, juno, second.id);
		expect(loadVideoTarget(env.db, placed.youtubeVideoId)).toBeNull();
		expect(listReviewQueue(env.db, env.editor).some((i) => i.id === id)).toBe(false);
		expect(pendingCounts(env.db, env.editor).suggestions).toBe(before - 1);
		expect(errorsOf(() => approveSuggestion(env.db, env.editor, id, LOCALES))).toEqual({
			suggestion: 'target_missing'
		});
		// Linked again, the suggestion is back.
		relinkOwnChannel(env.db, juno, second.id);
		expect(listReviewQueue(env.db, env.editor).some((i) => i.id === id)).toBe(true);
		setOwnOptOut(env.db, juno, true);
		expect(listReviewQueue(env.db, env.editor).some((i) => i.id === id)).toBe(false);
	});

	it('are not in the Unsorted queue or its count', () => {
		const { unsorted } = videosOnSecond();
		const count = () => dashboard(env.db, env.editor).unsorted;
		expect(listQueue(env.db, env.editor, 'unsorted').some((v) => v.id === unsorted.id)).toBe(true);
		const n = count();
		unlinkOwnChannel(env.db, juno, second.id);
		expect(listQueue(env.db, env.editor, 'unsorted').some((v) => v.id === unsorted.id)).toBe(false);
		const onSecond = env.db
			.select()
			.from(t.videos)
			.where(and(eq(t.videos.channelId, second.id), eq(t.videos.status, 'unsorted')))
			.all().length;
		expect(count()).toBe(n - onSecond);
	});
});

describe('the sync of an unlinked channel', () => {
	it('stays off for editors and admins until an admin restores it', () => {
		unlinkOwnChannel(env.db, juno, second.id);
		for (const actor of [env.editor, env.admin])
			expect(
				errorsOf(() =>
					updateChannel(env.db, actor, second.id, { kind: 'secondary', sync_enabled: 'on' })
				)
			).toEqual({ sync_enabled: 'channel_unlinked' });
		// Other fields can still be edited.
		updateChannel(env.db, env.editor, second.id, { kind: 'secondary', title: 'Renamed' });
		expect(channel(second.id)).toMatchObject({ title: 'Renamed', syncEnabled: false });
		restoreChannel(env.db, env.admin, second.id);
		expect(channel(second.id)).toMatchObject({ unlinkedAt: null, syncEnabled: true });
	});
});

describe('reverting unlink, relink and restore', () => {
	it('is for admins and uses the full channel snapshot, both ways', () => {
		unlinkOwnChannel(env.db, juno, second.id);
		const unlinked = channel(second.id);
		const unlink = lastAudit(env.db);
		expect(unlink.actor).toBe('creator');
		expect(revertBlock(env.db, env.editor, unlink)).toBe('admin_only');
		expect(revertBlock(env.db, env.admin, unlink)).toBeNull();

		revertEntry(env.db, env.admin, unlink.id, LOCALES);
		expect(channel(second.id)).toMatchObject({
			unlinkedAt: null,
			unlinkedByUserId: null,
			syncEnabled: true
		});

		// Reverting the revert unlinks again, with the original time and person.
		const revert = lastAudit(env.db);
		expect(revert.revertOf).toBe(unlink.id);
		revertEntry(env.db, env.admin, revert.id, LOCALES);
		expect(channel(second.id)).toMatchObject({
			unlinkedAt: unlinked.unlinkedAt,
			unlinkedByUserId: juno.id,
			syncEnabled: false
		});

		// An admin's restore and a creator's relink revert to unlinked.
		restoreChannel(env.db, env.admin, second.id);
		revertEntry(env.db, env.admin, lastAudit(env.db).id, LOCALES);
		expect(channel(second.id).unlinkedAt).not.toBeNull();
		relinkOwnChannel(env.db, juno, second.id);
		const relink = lastAudit(env.db);
		revertEntry(env.db, env.admin, relink.id, LOCALES);
		expect(channel(second.id)).toMatchObject({ syncEnabled: false });
		expect(channel(second.id).unlinkedAt).not.toBeNull();
	});

	it('lists creator entries under "a verified creator"', () => {
		unlinkOwnChannel(env.db, juno, second.id);
		const { items } = listHistory(env.db, env.admin, { actorType: 'creator' });
		expect(items[0]).toMatchObject({
			entity: 'channel',
			actorType: 'creator',
			actorName: 'Tidecaller Juno'
		});
		expect(
			listHistory(env.db, env.admin, { actorType: 'person' }).items.some(
				(i) => i.id === items[0].id
			)
		).toBe(false);
	});
});
