<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { clockDuration, spokenDuration, type VideoCard } from '#lib/video.js';
	import CreatorAvatar from './CreatorAvatar.svelte';
	import VideoThumb from './VideoThumb.svelte';

	type Props = {
		video: VideoCard;
		/** Show the series title in the meta line (rows that mix series). */
		showSeries?: boolean;
		/** Heading level of the title, so it fits the outline of the page. */
		headingLevel?: 3 | 4;
	};

	let { video, showSeries = false, headingLevel = 3 }: Props = $props();

	const locale = $derived(getLocale());
	const date = $derived(
		formatDate(video.publishedAt, locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
	);
	const fullDate = $derived(
		formatDate(video.publishedAt, locale, { dateStyle: 'long', timeZone: 'UTC' })
	);
</script>

<article class="ep">
	<VideoThumb
		youtubeVideoId={video.youtubeVideoId}
		poster={video.series.poster}
		tint={video.creator.color}
		label={video.episodeNumber ? m.episode_short({ number: video.episodeNumber }) : null}
		duration={clockDuration(video.durationS)}
	/>
	<svelte:element this={`h${headingLevel}`} class="t">
		<a href={resolve('/(site)/watch/[videoId]', { videoId: video.youtubeVideoId })}>
			{video.title}
		</a>
	</svelte:element>
	<p class="m">
		<CreatorAvatar
			name={video.creator.name}
			color={video.creator.color}
			avatarUrl={video.creator.avatarUrl}
			size={22}
		/>
		<span>{video.creator.name}</span>
		{#if showSeries}<span>· {video.series.title}</span>{/if}
		<span>· <time datetime={video.publishedAt.toISOString()} title={fullDate}>{date}</time></span>
		<span class="sr-only">
			{#if video.episodeNumber}{m.episode_long({ number: video.episodeNumber })},{/if}
			{m.duration_spoken({ duration: spokenDuration(video.durationS, locale) })}
		</span>
		{#if video.hasCreatorCaptions}
			<span class="cc">
				<span aria-hidden="true">CC</span><span class="sr-only">{m.cc_badge()}</span>
			</span>
		{/if}
	</p>
</article>

<style>
	.ep {
		position: relative;
		border-radius: 16px;
	}
	.t {
		font-size: 1.0625rem;
		line-height: 1.3;
		margin: 14px 0 0;
	}
	.t a {
		text-decoration: none;
	}
	/* The whole card is clickable through the title link. */
	.t a::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 16px;
	}
	.t a:focus-visible {
		outline: none;
	}
	.t a:focus-visible::after {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: 4px;
	}
	.ep:hover .t a {
		text-decoration: underline;
	}
	.m {
		display: flex;
		gap: 4px 8px;
		align-items: center;
		flex-wrap: wrap;
		font-size: 0.8125rem;
		color: var(--muted);
		margin: 6px 0 0;
	}
	.cc {
		font-size: 0.6875rem;
		font-weight: 800;
		border: 1.5px solid var(--text);
		color: var(--text);
		border-radius: 4px;
		padding: 0 4px;
		line-height: 1.4;
	}
</style>
