/** Site pages (Markdown per locale) and the short site texts (first-visit notice, footer disclaimer). */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { pickTranslation } from '../../i18n.js';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import { renderMarkdown } from '../markdown.js';
import {
	type Actor,
	assertRole,
	auditUser,
	Checker,
	type Input,
	NotFoundError,
	text
} from './core.js';
import { BASE_LOCALE } from './series.js';

/** The pages an admin manages here. Their slugs are the public URLs (`/about`, ...). */
export const MANAGED_PAGES = ['about', 'disclaimer', 'accessibility', 'privacy'] as const;
export type ManagedPage = (typeof MANAGED_PAGES)[number];

export const SITE_TEXT_KEYS = ['notice', 'footer_disclaimer'] as const;
export type SiteTextKey = (typeof SITE_TEXT_KEYS)[number];

export const PAGE_TITLE_MAX = 120;
export const PAGE_BODY_MAX = 20_000;
export const SITE_TEXT_MAX = 1000;

export function isManagedPage(slug: string): slug is ManagedPage {
	return (MANAGED_PAGES as readonly string[]).includes(slug);
}

/* ---------- site texts ---------- */

/**
 * The site texts for the public layout: the active locale, else English. A key without any
 * text is null, and the components then show their message string, so the disclaimer is never
 * empty.
 */
export function readSiteTexts(db: DB, locale: string): Record<SiteTextKey, string | null> {
	const rows = db
		.select()
		.from(t.siteTexts)
		.where(inArray(t.siteTexts.locale, [...new Set([locale, BASE_LOCALE])]))
		.all();
	const out = {} as Record<SiteTextKey, string | null>;
	for (const key of SITE_TEXT_KEYS) {
		const picked = pickTranslation(
			rows.filter((r) => r.key === key && r.value.trim() !== ''),
			locale,
			BASE_LOCALE
		);
		out[key] = picked?.value.value ?? null;
	}
	return out;
}

export function getSiteTexts(db: DB, actor: Actor) {
	assertRole(actor, 'admin');
	return db.select().from(t.siteTexts).all();
}

/**
 * Saves both site texts in every locale. Fields are `<key>_<locale>`. English is required;
 * an empty other locale removes that translation (the site then shows English).
 */
export function updateSiteTexts(db: DB, actor: Actor, input: Input, locales: readonly string[]) {
	assertRole(actor, 'admin');
	const c = new Checker();
	const values: { key: SiteTextKey; locale: string; value: string }[] = [];
	for (const key of SITE_TEXT_KEYS) {
		for (const locale of locales) {
			const field = `${key}_${locale}`;
			const value = text(input, field);
			if (!value && locale === BASE_LOCALE) c.fail(field, 'required');
			else if (value.length > SITE_TEXT_MAX) c.fail(field, 'too_long');
			values.push({ key, locale, value });
		}
	}
	c.done();
	db.transaction((tx) => {
		for (const key of SITE_TEXT_KEYS) {
			const before = Object.fromEntries(
				tx
					.select()
					.from(t.siteTexts)
					.where(eq(t.siteTexts.key, key))
					.all()
					.map((r) => [r.locale, r.value])
			);
			const after: Record<string, string> = {};
			for (const v of values.filter((x) => x.key === key)) {
				if (!v.value) {
					tx.delete(t.siteTexts)
						.where(and(eq(t.siteTexts.key, key), eq(t.siteTexts.locale, v.locale)))
						.run();
					continue;
				}
				after[v.locale] = v.value;
				tx.insert(t.siteTexts)
					.values({ key, locale: v.locale, value: v.value, updatedAt: new Date() })
					.onConflictDoUpdate({
						target: [t.siteTexts.key, t.siteTexts.locale],
						set: { value: v.value, updatedAt: new Date() }
					})
					.run();
			}
			if (JSON.stringify(before) !== JSON.stringify(after)) {
				// Site texts have no numeric id: the entity id is the key's position.
				auditUser(tx, actor, `site_text:${key}`, SITE_TEXT_KEYS.indexOf(key) + 1, before, after);
			}
		}
	});
}

/* ---------- pages ---------- */

export function listPages(db: DB, actor: Actor) {
	assertRole(actor, 'admin');
	const rows = db
		.select({
			slug: t.pages.slug,
			locale: t.pageTranslations.locale,
			title: t.pageTranslations.title,
			updatedAt: t.pageTranslations.updatedAt
		})
		.from(t.pages)
		.leftJoin(t.pageTranslations, eq(t.pageTranslations.pageId, t.pages.id))
		.where(inArray(t.pages.slug, [...MANAGED_PAGES]))
		.orderBy(asc(t.pages.slug))
		.all();
	return MANAGED_PAGES.map((slug) => {
		const mine = rows.filter((r) => r.slug === slug && r.locale);
		return {
			slug,
			title: mine.find((r) => r.locale === BASE_LOCALE)?.title ?? null,
			locales: mine.map((r) => r.locale as string),
			updatedAt:
				mine.map((r) => r.updatedAt as Date).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
		};
	});
}

export function getPage(db: DB, actor: Actor, slug: string) {
	assertRole(actor, 'admin');
	if (!isManagedPage(slug)) throw new NotFoundError();
	const page = db.select().from(t.pages).where(eq(t.pages.slug, slug)).get() ?? null;
	const translations = page
		? db.select().from(t.pageTranslations).where(eq(t.pageTranslations.pageId, page.id)).all()
		: [];
	return { slug, page, translations };
}

/** Renders Markdown exactly as the public page does (sanitised). */
export function previewMarkdown(actor: Actor, body: string): string {
	assertRole(actor, 'admin');
	return renderMarkdown(body.slice(0, PAGE_BODY_MAX));
}

/**
 * Saves a page in every locale (`title_<locale>`, `body_<locale>`). English needs both; another
 * locale needs both or neither (neither removes it, and the page then falls back to English).
 */
export function updatePage(
	db: DB,
	actor: Actor,
	slug: string,
	input: Input,
	locales: readonly string[]
) {
	assertRole(actor, 'admin');
	if (!isManagedPage(slug)) throw new NotFoundError();
	const c = new Checker();
	const values: { locale: string; title: string; body: string }[] = [];
	for (const locale of locales) {
		const title = text(input, `title_${locale}`);
		const body = text(input, `body_${locale}`);
		const required = locale === BASE_LOCALE || title !== '' || body !== '';
		if (required && !title) c.fail(`title_${locale}`, 'required');
		else if (title.length > PAGE_TITLE_MAX) c.fail(`title_${locale}`, 'too_long');
		if (required && !body) c.fail(`body_${locale}`, 'required');
		else if (body.length > PAGE_BODY_MAX) c.fail(`body_${locale}`, 'too_long');
		values.push({ locale, title, body });
	}
	c.done();
	db.transaction((tx) => {
		let page = tx.select().from(t.pages).where(eq(t.pages.slug, slug)).get();
		page ??= tx.insert(t.pages).values({ slug }).returning().get();
		const existing = tx
			.select()
			.from(t.pageTranslations)
			.where(eq(t.pageTranslations.pageId, page.id))
			.all();
		const before = Object.fromEntries(
			existing.map((r) => [r.locale, { title: r.title, body: r.body }])
		);
		const after: Record<string, { title: string; body: string }> = {};
		const now = new Date();
		for (const v of values) {
			if (!v.title && !v.body) {
				tx.delete(t.pageTranslations)
					.where(
						and(eq(t.pageTranslations.pageId, page.id), eq(t.pageTranslations.locale, v.locale))
					)
					.run();
				continue;
			}
			after[v.locale] = { title: v.title, body: v.body };
			tx.insert(t.pageTranslations)
				.values({ pageId: page.id, locale: v.locale, title: v.title, body: v.body, updatedAt: now })
				.onConflictDoUpdate({
					target: [t.pageTranslations.pageId, t.pageTranslations.locale],
					set: { title: v.title, body: v.body, updatedAt: now }
				})
				.run();
		}
		auditUser(
			tx,
			actor,
			'page',
			page.id,
			{ slug, translations: before },
			{ slug, translations: after }
		);
	});
}
