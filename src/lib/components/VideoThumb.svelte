<script lang="ts">
	import type { PosterSettings } from '#lib/server/db/schema.js';
	import { isRealYoutubeId, seedFrom, youtubeThumbnailUrl } from '#lib/video.js';
	import PosterArt from './PosterArt.svelte';

	type Props = {
		youtubeVideoId: string;
		poster: PosterSettings | null;
		/** Creator colour, used as the sun of the generated art. */
		tint?: string | null;
		/** Short label on the image, e.g. "Ep 4". */
		label?: string | null;
		/** Clock duration, e.g. "31:20". */
		duration?: string | null;
	};

	let { youtubeVideoId, poster, tint = null, label = null, duration = null }: Props = $props();

	const real = $derived(isRealYoutubeId(youtubeVideoId));
	const palette = $derived(poster?.type === 'art' ? poster.palette : undefined);
</script>

<!-- Decorative: the title, creator and duration are written out as text next to it. -->
<span class="thumb" aria-hidden="true">
	{#if real}
		<img src={youtubeThumbnailUrl(youtubeVideoId)} alt="" loading="lazy" width="320" height="180" />
	{:else}
		<PosterArt {palette} seed={seedFrom(youtubeVideoId)} width={160} height={90} {tint} />
	{/if}
	{#if label}<span class="lbl">{label}</span>{/if}
	{#if duration}<span class="dur">{duration}</span>{/if}
</span>

<style>
	.thumb {
		position: relative;
		display: block;
		aspect-ratio: 16 / 9;
		border-radius: 16px;
		overflow: hidden;
		isolation: isolate;
		background: #000;
		color: #fff;
	}
	.thumb::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
		background: linear-gradient(180deg, transparent 40%, #000000cc);
	}
	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.lbl {
		position: absolute;
		z-index: 2;
		left: 16px;
		bottom: 12px;
		font-weight: 800;
		font-size: 1.5rem;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.dur {
		position: absolute;
		z-index: 2;
		right: 12px;
		bottom: 12px;
		background: #000;
		font-size: 0.8125rem;
		padding: 3px 8px;
		border-radius: 4px;
	}
</style>
