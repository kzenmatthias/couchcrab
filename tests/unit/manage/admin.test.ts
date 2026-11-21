import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '#lib/server/db/schema.js';
import { approveClaim, listPendingClaims, rejectClaim } from '#lib/server/manage/claims.js';
import { ForbiddenError, ValidationError } from '#lib/server/manage/core.js';
import {
	previewMarkdown,
	readSiteTexts,
	updatePage,
	updateSiteTexts
} from '#lib/server/manage/site.js';
import { syncNow } from '#lib/server/manage/sync.js';
import { setUserRole } from '#lib/server/manage/users.js';
import { lastAudit, seeded } from './fixtures.js';

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

describe('users and roles', () => {
	it('changes a role, with history', () => {
		setUserRole(env.db, env.admin, env.viewer.id, { role: 'editor' });
		expect(lastAudit(env.db)).toMatchObject({
			entity: 'user',
			entityId: env.viewer.id,
			before: { role: 'viewer' },
			after: { role: 'editor' }
		});
	});

	it('never demotes the last admin, also not themselves', () => {
		expect(
			errorsOf(() => setUserRole(env.db, env.admin, env.admin.id, { role: 'viewer' }))
		).toEqual({ role: 'last_admin' });
		setUserRole(env.db, env.admin, env.editor.id, { role: 'admin' });
		setUserRole(env.db, env.admin, env.admin.id, { role: 'editor' });
		const roles = env.db.select({ id: t.users.id, role: t.users.role }).from(t.users).all();
		expect(roles.find((r) => r.id === env.admin.id)?.role).toBe('editor');
		expect(roles.find((r) => r.id === env.editor.id)?.role).toBe('admin');
	});

	it('is for admins only', () => {
		expect(() => setUserRole(env.db, env.editor, env.viewer.id, { role: 'admin' })).toThrow(
			ForbiddenError
		);
	});
});

describe('site texts and pages', () => {
	it('falls back to English, and to null so the message string shows', () => {
		expect(readSiteTexts(env.db, 'nl').notice).toMatch(/Hermitcraft/);
		env.db.delete(t.siteTexts).where(eq(t.siteTexts.locale, 'nl')).run();
		expect(readSiteTexts(env.db, 'nl').footer_disclaimer).toMatch(/^Couchcrab is an independent/);
		env.db.delete(t.siteTexts).run();
		expect(readSiteTexts(env.db, 'nl')).toEqual({ notice: null, footer_disclaimer: null });
	});

	it('saves per locale, requires English and logs the change', () => {
		expect(
			errorsOf(() =>
				updateSiteTexts(env.db, env.admin, { notice_en: '', footer_disclaimer_en: 'x' }, LOCALES)
			)
		).toEqual({ notice_en: 'required' });
		updateSiteTexts(
			env.db,
			env.admin,
			{
				notice_en: 'Fan project, not affiliated with Hermitcraft.',
				footer_disclaimer_en: 'Unofficial fan site.',
				footer_disclaimer_nl: 'Onofficiële fansite.'
			},
			LOCALES
		);
		expect(readSiteTexts(env.db, 'nl')).toEqual({
			notice: 'Fan project, not affiliated with Hermitcraft.',
			footer_disclaimer: 'Onofficiële fansite.'
		});
		expect(lastAudit(env.db)).toMatchObject({
			entity: 'site_text:footer_disclaimer',
			after: { en: 'Unofficial fan site.', nl: 'Onofficiële fansite.' }
		});
		expect(() =>
			updateSiteTexts(env.db, env.editor, { notice_en: 'x', footer_disclaimer_en: 'y' }, LOCALES)
		).toThrow(ForbiddenError);
	});

	it('creates a missing managed page and sanitises the preview', () => {
		updatePage(
			env.db,
			env.admin,
			'privacy',
			{ title_en: 'Privacy', body_en: 'We keep little.', title_nl: '', body_nl: '' },
			LOCALES
		);
		expect(lastAudit(env.db)).toMatchObject({
			entity: 'page',
			after: { slug: 'privacy', translations: { en: { title: 'Privacy' } } }
		});
		expect(
			errorsOf(() =>
				updatePage(
					env.db,
					env.admin,
					'about',
					{ title_en: 'About', body_en: 'x', title_nl: 'Over' },
					LOCALES
				)
			)
		).toEqual({ body_nl: 'required' });
		const html = previewMarkdown(
			env.admin,
			'# Hi\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))'
		);
		expect(html).toContain('<h2>Hi</h2>');
		expect(html).not.toMatch(/script|javascript/);
	});
});

describe('creator claims', () => {
	it('approves a claim into a new creator: channel verified, user claimed', () => {
		const [claim] = listPendingClaims(env.db, env.admin);
		expect(claim).toMatchObject({ channelTitle: 'Mossy Lantern', userName: 'Mossy Lantern' });
		const result = approveClaim(env.db, env.admin, claim.id, {
			creator: 'new',
			name: 'Mossy Lantern'
		});
		const creator = env.db
			.select()
			.from(t.creators)
			.where(eq(t.creators.id, result.creatorId))
			.get()!;
		expect(creator).toMatchObject({ slug: 'mossy-lantern' });
		expect(creator.claimedAt).not.toBeNull();
		const channel = env.db
			.select()
			.from(t.channels)
			.where(eq(t.channels.id, result.channelId))
			.get()!;
		expect(channel).toMatchObject({
			youtubeChannelId: claim.youtubeChannelId,
			verifiedByUserId: claim.userId
		});
		const user = env.db.select().from(t.users).where(eq(t.users.id, claim.userId)).get()!;
		expect(user.creatorId).toBe(result.creatorId);
		expect(env.db.select().from(t.claims).where(eq(t.claims.id, claim.id)).get()).toMatchObject({
			status: 'verified',
			reviewedBy: env.admin.id
		});
		expect(lastAudit(env.db)).toMatchObject({ entity: 'claim', after: { status: 'verified' } });
		expect(listPendingClaims(env.db, env.admin)).toHaveLength(0);
		expect(
			errorsOf(() => approveClaim(env.db, env.admin, claim.id, { creator: 'new', name: 'x' }))
		).toEqual({ claim: 'not_pending' });
	});

	it('rejects a claim', () => {
		const [claim] = listPendingClaims(env.db, env.admin);
		rejectClaim(env.db, env.admin, claim.id);
		expect(env.db.select().from(t.claims).where(eq(t.claims.id, claim.id)).get()?.status).toBe(
			'rejected'
		);
		const request = env.db
			.select()
			.from(t.suggestions)
			.where(eq(t.suggestions.isCreatorRequest, true))
			.all()
			.find((s) => s.userId === claim.userId);
		expect(request?.status).toBe('rejected');
	});

	it('is for admins only', () => {
		expect(() => listPendingClaims(env.db, env.editor)).toThrow(ForbiddenError);
	});
});

describe('sync now', () => {
	it('does nothing without an API key and is for admins only', async () => {
		await expect(syncNow(env.db, env.admin, null, { dryRun: true })).resolves.toBeNull();
		await expect(syncNow(env.db, env.editor, null, { dryRun: true })).rejects.toThrow(
			ForbiddenError
		);
	});
});
