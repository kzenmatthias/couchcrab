<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import type { PosterSettings } from '#lib/server/db/schema.js';
	import PosterArt from './PosterArt.svelte';

	type Kind = 'season' | 'live_series' | 'event' | 'other';
	type Props = {
		slug: string;
		title: string;
		kind: Kind;
		startedAt: Date | null;
		poster: PosterSettings | null;
		creatorCount: number;
		/** Heading level of the title, so it fits the outline of the page. */
		headingLevel?: 2 | 3;
	};

	let { slug, title, kind, startedAt, poster, creatorCount, headingLevel = 3 }: Props = $props();

	const kindLabel: Record<Kind, () => string> = {
		season: m.series_kind_season,
		live_series: m.series_kind_live_series,
		event: m.series_kind_event,
		other: m.series_kind_other
	};
	const since = $derived(
		startedAt
			? m.series_since({
					date: formatDate(startedAt, getLocale(), {
						month: 'long',
						year: 'numeric',
						timeZone: 'UTC'
					})
				})
			: null
	);
</script>

<article class="poster">
	<span class="bg" aria-hidden="true">
		{#if poster?.type === 'image'}
			<img class="image" src={poster.url} alt="" />
		{:else}
			<PosterArt palette={poster?.palette} seed={poster?.seed ?? 1} motif={poster?.motif} />
		{/if}
	</span>
	<span class="tag">{kindLabel[kind]()}</span>
	<svelte:element this={`h${headingLevel}`} class="title">
		<a href={resolve('/(site)/series/[slug]', { slug })}>{title}</a>
	</svelte:element>
	<p>
		{m.series_creator_count({ count: creatorCount })}{#if since}<br />{since}{/if}
	</p>
</article>

<style>
	.poster {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		aspect-ratio: 2 / 3;
		border-radius: var(--radius-xl);
		padding: 20px;
		position: relative;
		isolation: isolate;
		color: #fff;
	}
	/* Art and scrim sit below the text; the title link covers the whole poster. */
	.bg {
		position: absolute;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		border-radius: inherit;
		background: #000;
	}
	.bg::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, transparent 30%, var(--scrim) 75%);
	}
	.image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.tag {
		position: absolute;
		top: 14px;
		left: 14px;
		background: #000;
		border-radius: 5px;
		padding: 2px 6px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.6875rem;
		font-weight: 700;
	}
	.title {
		font-size: 1.5rem;
		line-height: 1.05;
		letter-spacing: -0.02em;
		margin: 0;
		overflow-wrap: anywhere;
	}
	.title a {
		text-decoration: none;
	}
	.title a::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}
	.title a:focus-visible {
		outline: none;
	}
	.title a:focus-visible::after {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: 3px;
		border-radius: var(--radius-xl);
	}
	.poster:hover .title a {
		text-decoration: underline;
	}
	p {
		font-size: 0.875rem;
		margin: 6px 0 0;
	}
</style>
