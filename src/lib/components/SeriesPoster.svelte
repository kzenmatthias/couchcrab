<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import type { PosterSettings } from '#lib/server/db/schema.js';
	import PosterArt from './PosterArt.svelte';

	type Kind = 'season' | 'live_series' | 'event' | 'other';
	type Props = {
		title: string;
		kind: Kind;
		startedAt: Date | null;
		poster: PosterSettings | null;
		creatorCount: number;
	};

	let { title, kind, startedAt, poster, creatorCount }: Props = $props();

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
	{#if poster?.type === 'image'}
		<img class="image" src={poster.url} alt="" />
	{:else}
		<PosterArt palette={poster?.palette} seed={poster?.seed ?? 1} />
	{/if}
	<span class="tag">{kindLabel[kind]()}</span>
	<h3>{title}</h3>
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
		background: #000;
		position: relative;
		overflow: hidden;
		color: #fff;
	}
	.poster::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
		background: linear-gradient(180deg, transparent 30%, var(--scrim) 75%);
	}
	.image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.poster > :not(:global(.art), .image) {
		position: relative;
		z-index: 2;
	}
	.tag {
		position: absolute !important;
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
	h3 {
		font-size: 1.5rem;
		line-height: 1.05;
		letter-spacing: -0.02em;
		margin: 0;
	}
	p {
		font-size: 0.875rem;
		margin: 6px 0 0;
	}
</style>
