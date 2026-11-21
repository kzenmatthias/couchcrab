import { describe, expect, it } from 'vitest';
import {
	assertRole,
	Checker,
	flag,
	ForbiddenError,
	optionalDate,
	optionalUrl,
	text,
	texts
} from '#lib/server/manage/core.js';
import { slugField, slugify, uniqueSlug } from '#lib/server/manage/slug.js';

describe('roles', () => {
	it('lets an admin do what an editor can, and nobody below', () => {
		expect(() => assertRole({ id: 1, role: 'admin' }, 'editor')).not.toThrow();
		expect(() => assertRole({ id: 1, role: 'editor' }, 'editor')).not.toThrow();
		expect(() => assertRole({ id: 1, role: 'editor' }, 'admin')).toThrow(ForbiddenError);
		expect(() => assertRole({ id: 1, role: 'viewer' }, 'editor')).toThrow(ForbiddenError);
	});
});

describe('form parsing', () => {
	it('reads FormData and plain objects the same way', () => {
		const form = new FormData();
		form.set('name', '  Juno ');
		form.append('creators', '1');
		form.append('creators', '2');
		form.set('on', '1');
		expect(text(form, 'name')).toBe('Juno');
		expect(texts(form, 'creators')).toEqual(['1', '2']);
		expect(flag(form, 'on')).toBe(true);
		expect(flag(form, 'missing')).toBe(false);
		expect(texts({ creators: ['3', ''] }, 'creators')).toEqual(['3']);
		expect(text({ n: 5 }, 'n')).toBe('5');
	});

	it('only accepts http(s) URLs and real dates', () => {
		const c = new Checker();
		expect(optionalUrl(c, { u: 'javascript:alert(1)' }, 'u')).toBeNull();
		expect(optionalUrl(c, { v: 'https://example.org/a.png' }, 'v')).toBe(
			'https://example.org/a.png'
		);
		expect(optionalDate(c, { d: '2026-02-31x' }, 'd')).toBeNull();
		expect(optionalDate(c, { e: '2026-09-07' }, 'e')?.toISOString()).toBe(
			'2026-09-07T00:00:00.000Z'
		);
		expect(optionalDate(c, { f: '2026-09-07T16:30' }, 'f')?.toISOString()).toBe(
			'2026-09-07T16:30:00.000Z'
		);
		expect(c.errors).toEqual({ u: 'invalid_url', d: 'invalid_date' });
	});
});

describe('slugs', () => {
	it('makes ASCII slugs from names', () => {
		expect(slugify('Tidecaller Juno!')).toBe('tidecaller-juno');
		expect(slugify('  Café   Crème ')).toBe('cafe-creme');
		expect(slugify('***')).toBe('');
	});

	it('adds a number until the slug is free', () => {
		const taken = new Set(['juno', 'juno-2']);
		expect(uniqueSlug('juno', (s) => taken.has(s))).toBe('juno-3');
		expect(uniqueSlug('', () => false)).toBe('item');
	});

	it('generates from the name when empty, validates when given', () => {
		const c = new Checker();
		expect(slugField(c, { slug: '' }, 'Ember Hearts', (s) => s === 'ember-hearts')).toBe(
			'ember-hearts-2'
		);
		expect(c.ok).toBe(true);
		slugField(c, { slug: 'Bad Slug' }, 'x', () => false);
		expect(c.errors.slug).toBe('invalid_slug');
		const d = new Checker();
		slugField(d, { slug: 'ember-hearts' }, 'x', (s) => s === 'ember-hearts');
		expect(d.errors.slug).toBe('slug_taken');
	});
});
