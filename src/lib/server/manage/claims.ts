/** The review queue for creator claims on channels that were not on Couchcrab yet (admin only). */
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Executor } from '../audit.js';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import {
	type Actor,
	assertRole,
	auditUser,
	Checker,
	id,
	type Input,
	NotFoundError,
	oneOf,
	requiredText,
	text,
	ValidationError
} from './core.js';
import { CHANNEL_ID_RE, NAME_MAX } from './creators.js';
import { slugify, uniqueSlug } from './slug.js';

const DEFAULT_COLORS = [
	'#e05d5d',
	'#ffd166',
	'#7bd389',
	'#9ad0ff',
	'#f78fb3',
	'#ff9f43',
	'#c792ea'
];

/** The channel title the user's Google account reported, kept on the creator request. */
function requestTitle(db: Executor, userId: number, youtubeChannelId: string): string {
	const requests = db
		.select({ payload: t.suggestions.payload })
		.from(t.suggestions)
		.where(
			and(
				eq(t.suggestions.userId, userId),
				eq(t.suggestions.isCreatorRequest, true),
				eq(t.suggestions.targetType, 'channel')
			)
		)
		.orderBy(desc(t.suggestions.id))
		.all();
	const match = requests.find((r) => r.payload.youtubeChannelId === youtubeChannelId);
	return typeof match?.payload.title === 'string' ? match.payload.title : '';
}

export function listPendingClaims(db: DB, actor: Actor) {
	assertRole(actor, 'admin');
	return db
		.select({
			id: t.claims.id,
			youtubeChannelId: t.claims.youtubeChannelId,
			createdAt: t.claims.createdAt,
			userId: t.users.id,
			userName: t.users.name,
			userCreatorId: t.users.creatorId
		})
		.from(t.claims)
		.innerJoin(t.users, eq(t.users.id, t.claims.userId))
		.where(eq(t.claims.status, 'pending_review'))
		.orderBy(asc(t.claims.createdAt), asc(t.claims.id))
		.all()
		.map((c) => ({ ...c, channelTitle: requestTitle(db, c.userId, c.youtubeChannelId) }));
}

function pendingClaim(db: Executor, claimId: number) {
	const claim = db.select().from(t.claims).where(eq(t.claims.id, claimId)).get();
	if (!claim) throw new NotFoundError();
	if (claim.status !== 'pending_review') throw new ValidationError({ claim: 'not_pending' });
	return claim;
}

/** Marks the matching creator request in the suggestions queue as reviewed. */
function closeRequest(
	tx: Parameters<Parameters<DB['transaction']>[0]>[0],
	actor: Actor,
	claim: typeof t.claims.$inferSelect,
	status: 'approved' | 'rejected',
	now: Date
) {
	const requests = tx
		.select({ id: t.suggestions.id, payload: t.suggestions.payload })
		.from(t.suggestions)
		.where(
			and(
				eq(t.suggestions.userId, claim.userId),
				eq(t.suggestions.isCreatorRequest, true),
				eq(t.suggestions.status, 'open')
			)
		)
		.all()
		.filter((r) => r.payload.youtubeChannelId === claim.youtubeChannelId);
	for (const r of requests) {
		tx.update(t.suggestions)
			.set({ status, reviewedBy: actor.id, reviewedAt: now })
			.where(eq(t.suggestions.id, r.id))
			.run();
	}
}

/**
 * Approves a claim: adds the channel to an existing creator (`creator_id`) or to a new one
 * (`creator: new` with `name`), verifies it for the user and, when the user has no creator yet,
 * lets them claim that creator. One transaction, with an audit entry per change.
 */
export function approveClaim(
	db: DB,
	actor: Actor,
	claimId: number,
	input: Input,
	now = new Date()
) {
	assertRole(actor, 'admin');
	const at = new Date(Math.floor(now.getTime() / 1000) * 1000);
	return db.transaction((tx) => {
		const claim = pendingClaim(tx, claimId);
		if (!CHANNEL_ID_RE.test(claim.youtubeChannelId))
			throw new ValidationError({ claim: 'invalid_channel' });
		const user = tx.select().from(t.users).where(eq(t.users.id, claim.userId)).get();
		if (!user) throw new NotFoundError();

		const c = new Checker();
		const choice = text(input, 'creator');
		let creatorId: number | null = null;
		let name = '';
		if (choice === 'new') name = requiredText(c, input, 'name', NAME_MAX);
		else {
			creatorId = id(choice);
			if (creatorId === null) c.fail('creator', choice ? 'invalid_choice' : 'required');
			else if (!tx.select().from(t.creators).where(eq(t.creators.id, creatorId)).get())
				c.fail('creator', 'invalid_choice');
		}
		if (user.creatorId !== null && creatorId !== user.creatorId)
			c.fail('creator', 'claim_other_creator');
		const kind = oneOf(c, input, 'kind', ['main', 'secondary'] as const, 'main');
		if (
			tx
				.select({ id: t.channels.id })
				.from(t.channels)
				.where(eq(t.channels.youtubeChannelId, claim.youtubeChannelId))
				.get()
		)
			c.fail('creator', 'channel_taken');
		c.done();

		if (creatorId === null) {
			const count = tx.select({ id: t.creators.id }).from(t.creators).all().length;
			const slug = uniqueSlug(
				slugify(name),
				(s) => !!tx.select().from(t.creators).where(eq(t.creators.slug, s)).get()
			);
			const color = DEFAULT_COLORS[count % DEFAULT_COLORS.length];
			const creator = tx.insert(t.creators).values({ slug, name, color }).returning().get();
			creatorId = creator.id;
			auditUser(tx, actor, 'creator', creator.id, null, { slug, name, color });
		}
		const creator = tx.select().from(t.creators).where(eq(t.creators.id, creatorId)).get()!;

		const title = requestTitle(tx, user.id, claim.youtubeChannelId) || creator.name;
		const channel = tx
			.insert(t.channels)
			.values({
				creatorId,
				youtubeChannelId: claim.youtubeChannelId,
				title,
				kind,
				verifiedAt: at,
				verifiedByUserId: user.id
			})
			.returning()
			.get();
		auditUser(tx, actor, 'channel', channel.id, null, {
			creatorId,
			youtubeChannelId: channel.youtubeChannelId,
			title,
			kind,
			verifiedAt: at.toISOString(),
			verifiedByUserId: user.id
		});

		if (user.creatorId === null && creator.claimedAt === null) {
			tx.update(t.creators).set({ claimedAt: at }).where(eq(t.creators.id, creatorId)).run();
			auditUser(
				tx,
				actor,
				'creator',
				creatorId,
				{ claimedAt: null },
				{ claimedAt: at.toISOString(), claimedByUserId: user.id }
			);
			tx.update(t.users).set({ creatorId }).where(eq(t.users.id, user.id)).run();
			auditUser(tx, actor, 'user', user.id, { creatorId: null }, { creatorId });
		}

		tx.update(t.claims)
			.set({ status: 'verified', creatorId, reviewedBy: actor.id, reviewedAt: at })
			.where(eq(t.claims.id, claimId))
			.run();
		auditUser(
			tx,
			actor,
			'claim',
			claimId,
			{ status: 'pending_review', creatorId: null },
			{ status: 'verified', creatorId }
		);
		closeRequest(tx, actor, claim, 'approved', at);
		return { creatorId, channelId: channel.id };
	});
}

export function rejectClaim(db: DB, actor: Actor, claimId: number, now = new Date()) {
	assertRole(actor, 'admin');
	const at = new Date(Math.floor(now.getTime() / 1000) * 1000);
	db.transaction((tx) => {
		const claim = pendingClaim(tx, claimId);
		tx.update(t.claims)
			.set({ status: 'rejected', reviewedBy: actor.id, reviewedAt: at })
			.where(eq(t.claims.id, claimId))
			.run();
		auditUser(tx, actor, 'claim', claimId, { status: 'pending_review' }, { status: 'rejected' });
		closeRequest(tx, actor, claim, 'rejected', at);
	});
}
