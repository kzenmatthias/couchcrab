import { and, asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '#lib/server/db/client.js';
import * as t from '#lib/server/db/schema.js';
import { ForbiddenError, ValidationError } from '#lib/server/manage/core.js';
import { valText } from '#lib/community/labels.js';
import { describeChanges } from '#lib/server/community/changes.js';
import { createGroup, getSeries, updateSeries } from '#lib/server/manage/series.js';
import { seriesValues } from '../../../src/routes/manage/series/helpers.js';
import { placeVideoByHand, setVideoStatus } from '#lib/server/manage/videos.js';
import { setUserRole } from '#lib/server/manage/users.js';
import {
	listHistory,
	publicRecentHistory,
	publicSeriesHistory,
	revertBlock,
	revertEntry
} from '#lib/server/community/history.js';
import {
	approveSuggestion,
	askQuestion,
	listReviewQueue,
	promotionCandidates,
	rejectSuggestion,
	trustCounts,
	trustScore
} from '#lib/server/community/review.js';
import {
	assertWithinLimit,
	createCreatorRequest,
	createSuggestion,
	DAILY_LIMIT,
	listMySuggestions,
	NOTE_MAX,
	parseSuggestion,
	withdrawSuggestion
} from '#lib/server/community/suggestions.js';
import {
	loadCreatorTarget,
	loadSeriesTarget,
	loadVideoTarget
} from '#lib/server/community/targets.js';
import { auditRows, lastAudit, seeded, seriesBySlug } from '../manage/fixtures.js';

const LOCALES = ['en', 'nl'] as const;
let env: ReturnType<typeof seeded>;
beforeEach(() => {
	env = seeded();
});

const errorsOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (err) {
		if (err instanceof ValidationError) return err.errors;
		throw err;
	}
	throw new Error('Expected a ValidationError');
};

/** A placed Ember Hearts video in session 1, and the groups of that series. */
function sessionVideo(db: DB) {
	const series = seriesBySlug(db, 'ember-hearts');
	const groups = db
		.select()
		.from(t.groups)
		.where(eq(t.groups.seriesId, series.id))
		.orderBy(asc(t.groups.number))
		.all();
	const video = db
		.select()
		.from(t.videos)
		.where(and(eq(t.videos.seriesId, series.id), eq(t.videos.groupId, groups[0].id)))
		.get()!;
	return { series, groups, video };
}

const videoRow = (db: DB, id: number) =>
	db.select().from(t.videos).where(eq(t.videos.id, id)).get()!;

describe('payload validation per kind', () => {
	it('video: wrong series with a group of that series', () => {
		const { video } = sessionVideo(env.db);
		const target = loadVideoTarget(env.db, video.youtubeVideoId)!;
		const other = seriesBySlug(env.db, 'lanternfall-season-3');
		expect(parseSuggestion(target, { type: 'video_series', series_id: other.id }).payload).toEqual({
			type: 'video_series',
			seriesId: other.id,
			groupId: null
		});
		expect(errorsOf(() => parseSuggestion(target, { type: 'video_series' }))).toEqual({
			series_id: 'required'
		});
		expect(
			errorsOf(() =>
				parseSuggestion(target, {
					type: 'video_series',
					series_id: other.id,
					group_id: video.groupId!
				})
			)
		).toEqual({ group_id: 'group_mismatch' });
		expect(
			errorsOf(() =>
				parseSuggestion(target, {
					type: 'video_series',
					series_id: video.seriesId!,
					group_id: video.groupId!
				})
			)
		).toEqual({ series_id: 'no_change' });
	});

	it('video: wrong session only offers groups of its series', () => {
		const { video, groups } = sessionVideo(env.db);
		const target = loadVideoTarget(env.db, video.youtubeVideoId)!;
		expect(
			parseSuggestion(target, { type: 'video_group', new_group_id: groups[1].id }).payload
		).toMatchObject({ type: 'video_group', groupId: groups[1].id });
		expect(
			errorsOf(() => parseSuggestion(target, { type: 'video_group', new_group_id: groups[0].id }))
		).toEqual({ new_group_id: 'no_change' });
		const lantern = loadVideoTarget(
			env.db,
			env.db
				.select()
				.from(t.videos)
				.where(eq(t.videos.seriesId, seriesBySlug(env.db, 'lanternfall-season-3').id))
				.get()!.youtubeVideoId
		)!;
		expect(
			errorsOf(() => parseSuggestion(lantern, { type: 'video_group', new_group_id: groups[1].id }))
		).toEqual({ new_group_id: 'invalid_choice' });
	});

	it('video: livestream VOD needs an Extras series, captions must change, other needs a note', () => {
		const { video } = sessionVideo(env.db);
		const ember = loadVideoTarget(env.db, video.youtubeVideoId)!;
		expect(errorsOf(() => parseSuggestion(ember, { type: 'video_live_vod' }))).toEqual({
			type: 'no_extras'
		});
		const lanternVideo = env.db
			.select()
			.from(t.videos)
			.where(eq(t.videos.seriesId, seriesBySlug(env.db, 'lanternfall-season-3').id))
			.get()!;
		const lantern = loadVideoTarget(env.db, lanternVideo.youtubeVideoId)!;
		expect(parseSuggestion(lantern, { type: 'video_live_vod' }).payload).toEqual({
			type: 'video_live_vod',
			seriesId: seriesBySlug(env.db, 'lanternfall-season-3-extras').id
		});
		const flip = lanternVideo.hasCreatorCaptions ? 'no' : 'yes';
		expect(parseSuggestion(lantern, { type: 'video_captions', captions: flip }).payload).toEqual({
			type: 'video_captions',
			hasCreatorCaptions: flip === 'yes'
		});
		expect(
			errorsOf(() =>
				parseSuggestion(lantern, {
					type: 'video_captions',
					captions: flip === 'yes' ? 'no' : 'yes'
				})
			)
		).toEqual({ captions: 'no_change' });
		expect(errorsOf(() => parseSuggestion(lantern, { type: 'other' }))).toEqual({
			note: 'required'
		});
		expect(
			errorsOf(() => parseSuggestion(lantern, { type: 'other', note: 'x'.repeat(NOTE_MAX + 1) }))
		).toEqual({ note: 'too_long' });
		expect(errorsOf(() => parseSuggestion(lantern, { type: 'series_field' }))).toEqual({
			type: 'invalid_choice'
		});
	});

	it('series: field corrections, participants and title rule ideas', () => {
		const target = loadSeriesTarget(env.db, 'ember-hearts')!;
		expect(
			parseSuggestion(target, { type: 'series_field', field: 'title', title: 'Ember Hearts II' })
				.payload
		).toEqual({ type: 'series_field', field: 'title', value: 'Ember Hearts II' });
		expect(
			errorsOf(() =>
				parseSuggestion(target, { type: 'series_field', field: 'title', title: 'Ember Hearts' })
			)
		).toEqual({ title: 'no_change' });
		expect(
			errorsOf(() =>
				parseSuggestion(target, { type: 'series_field', field: 'kind', kind: 'movie' })
			)
		).toEqual({ kind: 'invalid_choice' });
		const outsider = target.otherCreators[0];
		expect(
			parseSuggestion(target, { type: 'participant', creator_id: outsider.id }).payload
		).toEqual({ type: 'participant', seriesId: target.id, creatorId: outsider.id, name: null });
		expect(
			parseSuggestion(target, { type: 'participant', creator_id: 'new', creator_name: 'Newbie' })
				.payload
		).toMatchObject({ creatorId: null, name: 'Newbie' });
		expect(
			errorsOf(() => parseSuggestion(target, { type: 'rule', pattern: '(', match: 'regex' }))
		).toEqual({ pattern: 'invalid_regex' });
		expect(
			errorsOf(() =>
				parseSuggestion(target, { type: 'rule', pattern: 'EH', rule_target: 'extras' })
			)
		).toEqual({ rule_target: 'no_extras' });
	});

	it('creator: field corrections and missing from a series', () => {
		const target = loadCreatorTarget(env.db, 'quillby')!;
		expect(
			parseSuggestion(target, { type: 'creator_field', field: 'bio', bio: 'Builds bridges.' })
				.payload
		).toEqual({ type: 'creator_field', field: 'bio', value: 'Builds bridges.' });
		expect(
			errorsOf(() =>
				parseSuggestion(target, { type: 'participant', series_id: target.inSeries[0].id })
			)
		).toEqual({ series_id: 'invalid_choice' });
		expect(errorsOf(() => parseSuggestion(target, { type: 'video_ignore' }))).toEqual({
			type: 'invalid_choice'
		});
	});

	it('only public things are targets', () => {
		const unsorted = env.db.select().from(t.videos).where(eq(t.videos.status, 'unsorted')).get()!;
		expect(loadVideoTarget(env.db, unsorted.youtubeVideoId)).toBeNull();
		expect(
			errorsOf(() => createSuggestion(env.db, env.viewer.id, 'video', unsorted.youtubeVideoId, {}))
		).toEqual({ form: 'target_missing' });
	});
});

describe('rate limit', () => {
	it(`allows ${DAILY_LIMIT} suggestions per 24 hours`, () => {
		const { video, groups } = sessionVideo(env.db);
		const now = new Date('2026-11-20T12:00:00Z');
		for (let i = 0; i < DAILY_LIMIT; i++)
			createSuggestion(
				env.db,
				env.viewer.id,
				'video',
				video.youtubeVideoId,
				{ type: 'video_group', new_group_id: groups[1].id },
				now
			);
		expect(() => assertWithinLimit(env.db, env.viewer.id, now)).toThrow(ValidationError);
		expect(
			errorsOf(() =>
				createSuggestion(
					env.db,
					env.viewer.id,
					'video',
					video.youtubeVideoId,
					{ type: 'video_group', new_group_id: groups[1].id },
					now
				)
			)
		).toEqual({ form: 'rate_limited' });
		// A day later it works again.
		expect(() =>
			assertWithinLimit(env.db, env.viewer.id, new Date('2026-11-21T12:00:01Z'))
		).not.toThrow();
	});

	it('limits creator requests without an account per email', () => {
		const input = {
			request: 'removal',
			name: 'Someone',
			details: 'Please remove my channel.',
			contact_email: 'someone@example.org'
		};
		for (let i = 0; i < 3; i++) createCreatorRequest(env.db, null, input);
		expect(errorsOf(() => createCreatorRequest(env.db, null, input))).toEqual({
			form: 'rate_limited'
		});
		expect(
			errorsOf(() => createCreatorRequest(env.db, null, { ...input, contact_email: 'nope' }))
		).toEqual({ contact_email: 'invalid_email' });
	});
});

describe('review: approving applies the change through the service layer', () => {
	it('moves the video to another session, with the reviewer and the suggestion in the history', () => {
		const { video, groups } = sessionVideo(env.db);
		const id = createSuggestion(env.db, env.viewer.id, 'video', video.youtubeVideoId, {
			type: 'video_group',
			new_group_id: groups[1].id,
			note: 'The description says session 2.'
		});
		const item = listReviewQueue(env.db, env.editor).find((i) => i.id === id)!;
		expect(item.applies).toBe(true);
		expect(item.changes).toEqual([
			{
				field: 'group',
				before: { group: { kind: 'session', number: 1, title: null } },
				after: { group: { kind: 'session', number: 2, title: null } }
			}
		]);
		approveSuggestion(env.db, env.editor, id, LOCALES);
		expect(videoRow(env.db, video.id)).toMatchObject({ groupId: groups[1].id, placedBy: 'user' });
		expect(lastAudit(env.db)).toMatchObject({
			actor: 'user',
			actorUserId: env.editor.id,
			entity: 'video',
			entityId: video.id,
			suggestionId: id
		});
		const row = env.db.select().from(t.suggestions).where(eq(t.suggestions.id, id)).get()!;
		expect(row).toMatchObject({ status: 'approved', reviewedBy: env.editor.id });
		expect(errorsOf(() => approveSuggestion(env.db, env.editor, id, LOCALES))).toEqual({
			suggestion: 'not_pending'
		});
	});

	it('applies series and creator corrections, participants and rules', () => {
		const series = loadSeriesTarget(env.db, 'ember-hearts')!;
		const title = createSuggestion(env.db, env.viewer.id, 'series', 'ember-hearts', {
			type: 'series_field',
			field: 'started_at',
			started_at: '2026-09-30'
		});
		const member = createSuggestion(env.db, env.viewer.id, 'series', 'ember-hearts', {
			type: 'participant',
			creator_id: series.otherCreators[0].id
		});
		const rule = createSuggestion(env.db, env.viewer.id, 'series', 'ember-hearts', {
			type: 'rule',
			pattern: 'EH S',
			match: 'contains'
		});
		const bio = createSuggestion(env.db, env.viewer.id, 'creator', 'quillby', {
			type: 'creator_field',
			field: 'bio',
			bio: 'New bio.'
		});
		for (const id of [title, member, rule, bio]) approveSuggestion(env.db, env.editor, id, LOCALES);
		const s = seriesBySlug(env.db, 'ember-hearts');
		expect(s.startedAt?.toISOString()).toBe('2026-09-30T00:00:00.000Z');
		const members = env.db
			.select()
			.from(t.seriesCreators)
			.where(eq(t.seriesCreators.seriesId, s.id))
			.all()
			.map((r) => r.creatorId);
		expect(members).toContain(series.otherCreators[0].id);
		expect(
			env.db
				.select()
				.from(t.titleRules)
				.where(and(eq(t.titleRules.seriesId, s.id), eq(t.titleRules.pattern, 'EH S')))
				.get()
		).toBeTruthy();
		expect(env.db.select().from(t.creators).where(eq(t.creators.slug, 'quillby')).get()!.bio).toBe(
			'New bio.'
		);
		expect(auditRows(env.db).filter((r) => r.suggestionId === rule)).toHaveLength(1);
	});

	it('refuses a change that no longer validates and writes nothing', () => {
		const before = auditRows(env.db).length;
		const id = createSuggestion(env.db, env.viewer.id, 'creator', 'tidecaller-juno', {
			type: 'creator_field',
			field: 'bio',
			bio: 'Not my words.'
		});
		// A claimed creator's bio is theirs: an editor cannot change it.
		expect(errorsOf(() => approveSuggestion(env.db, env.editor, id, LOCALES))).toEqual({
			suggestion: 'claimed_locked'
		});
		expect(auditRows(env.db).length).toBe(before);
		expect(env.db.select().from(t.suggestions).where(eq(t.suggestions.id, id)).get()!.status).toBe(
			'open'
		);
	});

	it('rejects with a reason, asks a question, and is for editors', () => {
		const { video, groups } = sessionVideo(env.db);
		const make = () =>
			createSuggestion(env.db, env.viewer.id, 'video', video.youtubeVideoId, {
				type: 'video_group',
				new_group_id: groups[2].id
			});
		const a = make();
		const b = make();
		expect(() => approveSuggestion(env.db, env.viewer, a, LOCALES)).toThrow(ForbiddenError);
		askQuestion(env.db, env.editor, a, { message: 'Where did you see that?' });
		rejectSuggestion(env.db, env.editor, b, { reason: 'It is session 1.' });
		expect(errorsOf(() => askQuestion(env.db, env.editor, a, { message: '' }))).toEqual({
			message: 'required'
		});
		const mine = listMySuggestions(env.db, env.viewer.id);
		expect(mine.find((s) => s.id === a)).toMatchObject({
			status: 'question',
			reviewMessage: 'Where did you see that?'
		});
		expect(mine.find((s) => s.id === b)).toMatchObject({
			status: 'rejected',
			reviewMessage: 'It is session 1.'
		});
		// A suggestion with a question is still in the queue and can be withdrawn.
		expect(listReviewQueue(env.db, env.editor).some((i) => i.id === a)).toBe(true);
		withdrawSuggestion(env.db, env.viewer.id, a);
		expect(listReviewQueue(env.db, env.editor).some((i) => i.id === a)).toBe(false);
	});

	it('puts creator requests first', () => {
		const { video, groups } = sessionVideo(env.db);
		createSuggestion(env.db, env.viewer.id, 'video', video.youtubeVideoId, {
			type: 'video_group',
			new_group_id: groups[1].id
		});
		createCreatorRequest(env.db, null, {
			request: 'correction',
			name: 'A creator',
			details: 'My channel name is spelled wrong.',
			contact_email: 'creator@example.org'
		});
		const queue = listReviewQueue(env.db, env.editor);
		const firstPlain = queue.findIndex((i) => !i.isCreatorRequest);
		expect(queue.slice(0, firstPlain).every((i) => i.isCreatorRequest)).toBe(true);
		expect(queue.slice(firstPlain).every((i) => !i.isCreatorRequest)).toBe(true);
		expect(queue.filter((i) => i.isCreatorRequest)).toHaveLength(2);
		expect(queue.find((i) => i.claim)?.applies).toBe(false);
	});
});

describe('trust', () => {
	it('is approved minus rejected, kept on the user, and drives promotion hints', () => {
		expect(trustScore(5, 2)).toBe(3);
		const { video, groups } = sessionVideo(env.db);
		const make = () =>
			createSuggestion(env.db, env.viewer.id, 'video', video.youtubeVideoId, {
				type: 'video_group',
				new_group_id: groups[1].id
			});
		const ids = [make(), make(), make()];
		rejectSuggestion(env.db, env.editor, ids[0], {});
		approveSuggestion(env.db, env.editor, ids[1], LOCALES);
		// The third is now "no change" against the moved video but still approvable as written.
		rejectSuggestion(env.db, env.editor, ids[2], {});
		expect(trustCounts(env.db, [env.viewer.id]).get(env.viewer.id)).toEqual({
			approved: 1,
			rejected: 2,
			trust: -1
		});
		expect(env.db.select().from(t.users).where(eq(t.users.id, env.viewer.id)).get()!.trust).toBe(
			-1
		);
		env.db.update(t.users).set({ trust: 12 }).where(eq(t.users.id, env.viewer.id)).run();
		expect(promotionCandidates(env.db, env.admin, 10).has(env.viewer.id)).toBe(true);
		expect(promotionCandidates(env.db, env.admin, 13).has(env.viewer.id)).toBe(false);
	});
});

describe('revert', () => {
	it('puts a moved video back, links both entries and can revert the revert', () => {
		const { video, groups } = sessionVideo(env.db);
		placeVideoByHand(env.db, env.editor, video.id, {
			series_id: video.seriesId!,
			group_id: groups[2].id
		});
		const moved = lastAudit(env.db);
		revertEntry(env.db, env.editor, moved.id, LOCALES);
		expect(videoRow(env.db, video.id).groupId).toBe(groups[0].id);
		const revert = lastAudit(env.db);
		expect(revert.revertOf).toBe(moved.id);
		expect(
			env.db.select().from(t.auditLog).where(eq(t.auditLog.id, moved.id)).get()!.revertedBy
		).toBe(revert.id);
		expect(errorsOf(() => revertEntry(env.db, env.editor, moved.id, LOCALES))).toEqual({
			revert: 'already_reverted'
		});
		revertEntry(env.db, env.editor, revert.id, LOCALES);
		expect(videoRow(env.db, video.id).groupId).toBe(groups[2].id);
	});

	it('reverts a rule placement back to Unsorted', () => {
		// The entry the sync writes when a title rule places a new upload.
		const { video } = sessionVideo(env.db);
		env.db
			.insert(t.auditLog)
			.values({
				actor: 'rule',
				entity: 'video',
				entityId: video.id,
				before: { seriesId: null, groupId: null, status: 'unsorted', placedBy: null },
				after: {
					seriesId: video.seriesId,
					groupId: video.groupId,
					status: 'placed',
					placedBy: 'rule',
					ruleId: 1
				}
			})
			.run();
		revertEntry(env.db, env.editor, lastAudit(env.db).id, LOCALES);
		expect(videoRow(env.db, video.id)).toMatchObject({ status: 'unsorted', seriesId: null });
	});

	it('refuses when the entity changed since, or is gone', () => {
		const { video, groups } = sessionVideo(env.db);
		placeVideoByHand(env.db, env.editor, video.id, {
			series_id: video.seriesId!,
			group_id: groups[1].id
		});
		const first = lastAudit(env.db);
		placeVideoByHand(env.db, env.editor, video.id, {
			series_id: video.seriesId!,
			group_id: groups[2].id
		});
		expect(errorsOf(() => revertEntry(env.db, env.editor, first.id, LOCALES))).toEqual({
			revert: 'conflict'
		});

		const s = seriesBySlug(env.db, 'ember-hearts');
		const group = createGroup(env.db, env.editor, s.id, {
			kind: 'session',
			number: 40,
			starts_at: '2027-01-01'
		});
		const created = lastAudit(env.db);
		env.db.delete(t.groups).where(eq(t.groups.id, group.id)).run();
		expect(errorsOf(() => revertEntry(env.db, env.editor, created.id, LOCALES))).toEqual({
			revert: 'missing'
		});
	});

	it('undoes a creation by deleting through the service layer, and a series edit', () => {
		const s = seriesBySlug(env.db, 'ember-hearts');
		const group = createGroup(env.db, env.editor, s.id, {
			kind: 'session',
			number: 41,
			starts_at: '2027-02-01'
		});
		revertEntry(env.db, env.editor, lastAudit(env.db).id, LOCALES);
		expect(env.db.select().from(t.groups).where(eq(t.groups.id, group.id)).get()).toBeUndefined();

		const id = createSuggestion(env.db, env.viewer.id, 'series', 'ember-hearts', {
			type: 'series_field',
			field: 'title',
			title: 'Ember Hearts Renamed'
		});
		approveSuggestion(env.db, env.editor, id, LOCALES);
		const edit = lastAudit(env.db);
		revertEntry(env.db, env.admin, edit.id, LOCALES);
		expect(seriesBySlug(env.db, 'ember-hearts').title).toBe('Ember Hearts');
	});

	it('keeps users and roles for admins, and sync data for YouTube', () => {
		setUserRole(env.db, env.admin, env.viewer.id, { role: 'editor' });
		const role = lastAudit(env.db);
		expect(revertBlock(env.db, env.editor, role)).toBe('admin_only');
		expect(revertBlock(env.db, env.admin, role)).toBeNull();
		revertEntry(env.db, env.admin, role.id, LOCALES);
		expect(env.db.select().from(t.users).where(eq(t.users.id, env.viewer.id)).get()!.role).toBe(
			'viewer'
		);
		const { video } = sessionVideo(env.db);
		env.db
			.insert(t.auditLog)
			.values({
				actor: 'sync',
				entity: 'video',
				entityId: video.id,
				before: { title: 'Old', status: 'placed' },
				after: { title: video.title, status: 'placed' }
			})
			.run();
		expect(revertBlock(env.db, env.admin, lastAudit(env.db))).toBe('from_youtube');
	});
});

describe('history lists', () => {
	it('filters by entity and actor type and describes the change', () => {
		const { video, groups } = sessionVideo(env.db);
		placeVideoByHand(env.db, env.editor, video.id, {
			series_id: video.seriesId!,
			group_id: groups[1].id
		});
		const { items } = listHistory(env.db, env.editor, { entity: 'video', actorType: 'person' });
		expect(items[0]).toMatchObject({
			entity: 'video',
			actorType: 'person',
			actorName: 'Demo Editor',
			block: null
		});
		expect(items[0].changes.map((c) => c.field)).toEqual(['group']);
		expect(listHistory(env.db, env.editor, { actorType: 'sync' }).items).toEqual([]);
	});

	it('shows the public history of a series without viewer names', () => {
		const { video, groups } = sessionVideo(env.db);
		const id = createSuggestion(env.db, env.viewer.id, 'video', video.youtubeVideoId, {
			type: 'video_group',
			new_group_id: groups[1].id
		});
		approveSuggestion(env.db, env.editor, id, LOCALES);
		const s = seriesBySlug(env.db, 'ember-hearts');
		const items = publicSeriesHistory(env.db, s.id);
		expect(items[0]).toMatchObject({ entity: 'video', actorName: 'Demo Editor', suggested: true });
		expect(JSON.stringify(items)).not.toContain('Demo Viewer');
		expect(publicSeriesHistory(env.db, s.id, { spoilerFree: true })[0].label).toBeNull();
	});

	it('shows recent public changes across all series, with spoiler-free titles left out', () => {
		const { video, groups, series } = sessionVideo(env.db);
		const id = createSuggestion(env.db, env.viewer.id, 'video', video.youtubeVideoId, {
			type: 'video_group',
			new_group_id: groups[1].id
		});
		approveSuggestion(env.db, env.editor, id, LOCALES);
		const [first] = publicRecentHistory(env.db);
		expect(first).toMatchObject({
			entity: 'video',
			actorName: 'Demo Editor',
			suggested: true,
			series: { slug: 'ember-hearts' }
		});
		expect(first.label?.name).toEqual({ text: video.title });
		expect(JSON.stringify(publicRecentHistory(env.db))).not.toContain('Demo Viewer');

		// Spoiler-free for this series only: no title, and no title change either.
		const hidden = publicRecentHistory(env.db, { isSpoilerFree: (s) => s === series.id })[0];
		expect(hidden.label).toBeNull();
		expect(JSON.stringify(hidden)).not.toContain(video.title);
		expect(publicRecentHistory(env.db, { isSpoilerFree: () => false })[0].label).not.toBeNull();

		// A video that is not public any more drops out.
		setVideoStatus(env.db, env.editor, video.id, 'ignored');
		expect(
			publicRecentHistory(env.db).some(
				(h) => h.entity === 'video' && JSON.stringify(h.label).includes(video.title)
			)
		).toBe(false);
	});
});

describe('poster changes', () => {
	it('reads as text, treats old art as automatic and reverts', () => {
		const season = seriesBySlug(env.db, 'lanternfall-season-3');
		const v = env.db
			.select()
			.from(t.videos)
			.where(and(eq(t.videos.seriesId, season.id), eq(t.videos.status, 'placed')))
			.all()[0];
		const poster = { type: 'video', youtubeVideoId: v.youtubeVideoId, frame: '2' };
		const [change] = describeChanges(env.db, 'series', { poster: null }, { poster });
		expect(change).toEqual({
			field: 'poster',
			before: { poster: { kind: 'auto' } },
			after: { poster: { kind: 'video', video: v.title, frame: '2' } }
		});
		expect(valText(change.after, 'en')).toBe(`Episode "${v.title}", Frame 2`);
		expect(valText(change.before, 'en')).toBe('Automatic (first episode)');
		expect(
			describeChanges(
				env.db,
				'series',
				{ poster: { type: 'art', palette: 'dusk', seed: 2 } },
				{ poster: null }
			)
		).toEqual([]);

		const d = getSeries(env.db, env.editor, season.id);
		updateSeries(
			env.db,
			env.editor,
			season.id,
			{
				...seriesValues(d.series, d.translations, d.creatorIds),
				poster_type: 'video',
				poster_video: v.youtubeVideoId,
				poster_frame: '2'
			},
			LOCALES
		);
		const entry = lastAudit(env.db);
		revertEntry(env.db, env.editor, entry.id, LOCALES);
		expect(seriesBySlug(env.db, 'lanternfall-season-3').poster).toBeNull();
		revertEntry(env.db, env.editor, lastAudit(env.db).id, LOCALES);
		expect(seriesBySlug(env.db, 'lanternfall-season-3').poster).toEqual(poster);
	});
});
