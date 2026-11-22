<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { posterSources, posterSurface, type PosterView } from '#lib/poster.js';
	import PosterImage from './PosterImage.svelte';

	type Kind = 'season' | 'live_series' | 'event' | 'other';
	type Props = {
		slug: string;
		title: string;
		kind: Kind;
		startedAt: Date | null;
		poster: PosterView;
		creatorCount: number;
		/** Heading level of the title, so it fits the outline of the page. */
		headingLevel?: 2 | 3;
		/** Lazy-load the image (posters in a list). */
		lazy?: boolean;
	};

	let {
		slug,
		title,
		kind,
		startedAt,
		poster,
		creatorCount,
		headingLevel = 3,
		lazy = true
	}: Props = $props();

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
	<span class="bg" aria-hidden="true" style:background-color={posterSurface(slug)}>
		<PosterImage sources={posterSources(poster)} {lazy} />
	</span>
	<span class="tag">{kindLabel[kind]()}</span>
	<div class="text">
		<svelte:element this={`h${headingLevel}`} class="title">
			<a href={resolve('/(site)/series/[slug]', { slug })}>{title}</a>
		</svelte:element>
		<p>
			{m.series_creator_count({ count: creatorCount })}{#if since}<br />{since}{/if}
		</p>
	</div>
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
	/*
		Image (or the plain surface colour) and scrim sit below the text; the title link covers the
		whole poster. The surface colours all reach 9:1 with white on their own.
	*/
	.bg {
		position: absolute;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		border-radius: inherit;
	}
	.bg::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, transparent 30%, var(--scrim) 75%);
	}
	/*
		A second scrim tied to the text itself: full strength (87% black or more) from 2rem above the
		title down, however many lines the title takes, so white text stays above 4.5:1 on any image.
		Not positioned, so the title link still covers the whole poster.
	*/
	.text {
		margin: -4rem -20px -20px;
		padding: 4rem 20px 20px;
		border-radius: 0 0 var(--radius-xl) var(--radius-xl);
		background: linear-gradient(180deg, transparent, var(--scrim) 2rem);
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
