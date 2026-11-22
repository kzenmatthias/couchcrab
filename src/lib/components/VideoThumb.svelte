<script lang="ts">
	import { isRealYoutubeId, youtubeThumbnailUrl } from '#lib/video.js';

	type Props = {
		youtubeVideoId: string;
		/** Short label on the image, e.g. "Ep 4". */
		label?: string | null;
		/** Clock duration, e.g. "31:20". */
		duration?: string | null;
		/** Spoiler-free: a neutral striped card instead of the thumbnail. */
		hidden?: boolean;
		/** Percent watched (0 to 100); shows a progress bar along the bottom. */
		progress?: number;
	};

	let {
		youtubeVideoId,
		label = null,
		duration = null,
		hidden = false,
		progress = 0
	}: Props = $props();

	const real = $derived(isRealYoutubeId(youtubeVideoId));
</script>

<!-- Decorative: the title, creator and duration are written out as text next to it. -->
<span class="thumb" class:hidden aria-hidden="true">
	{#if hidden}
		<!-- No thumbnail: it could give the story away. -->
	{:else if real}
		<img src={youtubeThumbnailUrl(youtubeVideoId)} alt="" loading="lazy" width="320" height="180" />
		<!-- Demo ids have no image: the plain dark surface stays. -->
	{/if}
	{#if label}<span class="lbl">{label}</span>{/if}
	{#if duration}<span class="dur">{duration}</span>{/if}
	{#if progress > 0}<span class="bar" style:--p="{progress}%"></span>{/if}
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
	.thumb.hidden {
		background: repeating-linear-gradient(135deg, var(--surface) 0 18px, var(--surface2) 18px 36px);
		color: var(--text);
		border: 1px solid var(--line);
	}
	.thumb.hidden::before {
		content: none;
	}
	.hidden .lbl {
		font-size: 1.75rem;
	}
	.hidden .dur {
		background: var(--bg);
		color: var(--text);
	}
	.bar {
		position: absolute;
		z-index: 3;
		left: 0;
		right: 0;
		bottom: 0;
		height: 5px;
		background: #ffffff59;
	}
	.bar::after {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: var(--p);
		background: var(--accent);
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
