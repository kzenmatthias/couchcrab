<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { percentWatched } from '#lib/prefs/progress.js';
	import { getViewing } from '#lib/prefs/store.svelte.js';
	import { clockDuration, spokenDuration, type VideoCard } from '#lib/video.js';
	import CreatorAvatar from './CreatorAvatar.svelte';
	import VideoThumb from './VideoThumb.svelte';

	type Props = {
		video: VideoCard;
		/** Show the series title in the meta line (rows that mix series). */
		showSeries?: boolean;
		/** Heading level of the title, so it fits the outline of the page. */
		headingLevel?: 3 | 4;
		/** Hide the title of an unwatched episode, even when the server sent it (Continue watching). */
		spoilerFree?: boolean;
	};

	let { video, showSeries = false, headingLevel = 3, spoilerFree = false }: Props = $props();

	const viewing = getViewing();
	const locale = $derived(getLocale());
	const date = $derived(
		formatDate(video.publishedAt, locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
	);
	const fullDate = $derived(
		formatDate(video.publishedAt, locale, { dateStyle: 'long', timeZone: 'UTC' })
	);
	const textOnly = $derived(viewing.prefs.display.textOnly);

	const entry = $derived(viewing.entry(video.youtubeVideoId));
	const watched = $derived(entry?.watched ?? false);
	const percent = $derived(watched ? 0 : percentWatched(entry, video.durationS));

	/*
	 * Spoiler-free: the real title is only shown (and only in the DOM) once the episode is
	 * watched. The server leaves it out; for watched episodes it is fetched afterwards.
	 */
	const realTitle = $derived.by(() => {
		if (video.titleHidden) return watched ? viewing.titles[video.youtubeVideoId] : undefined;
		if (spoilerFree && !watched) return undefined;
		return video.title;
	});
	const hidden = $derived(realTitle === undefined);
	$effect(() => {
		if (video.titleHidden && watched) viewing.requestTitle(video.youtubeVideoId);
	});

	const shownTitle = $derived(
		realTitle ??
			(video.episodeNumber
				? m.episode_long({ number: video.episodeNumber })
				: m.episode_hidden_untitled())
	);
</script>

<article class="ep" class:text={textOnly}>
	{#if !textOnly}
		<VideoThumb
			youtubeVideoId={video.youtubeVideoId}
			label={video.episodeNumber
				? hidden
					? m.episode_long({ number: video.episodeNumber })
					: m.episode_short({ number: video.episodeNumber })
				: null}
			duration={clockDuration(video.durationS)}
			{hidden}
			progress={watched ? 100 : percent}
		/>
	{/if}
	<svelte:element this={`h${headingLevel}`} class="t">
		<a href={resolve('/(site)/watch/[videoId]', { videoId: video.youtubeVideoId })}>
			{shownTitle}
		</a>
	</svelte:element>
	<p class="m">
		{#if !textOnly}
			<CreatorAvatar
				name={video.creator.name}
				color={video.creator.color}
				avatarUrl={video.creator.avatarUrl}
				size={22}
			/>
		{/if}
		<span>{video.creator.name}</span>
		{#if showSeries}<span>· {video.series.title}</span>{/if}
		<span>· <time datetime={video.publishedAt.toISOString()} title={fullDate}>{date}</time></span>
		{#if textOnly}
			<span>· {spokenDuration(video.durationS, locale)}</span>
		{/if}
		<span class="sr-only">
			{#if video.episodeNumber && !hidden}{m.episode_long({ number: video.episodeNumber })},{/if}
			{#if !textOnly}{m.duration_spoken({ duration: spokenDuration(video.durationS, locale) })}{/if}
		</span>
		{#if video.hasCreatorCaptions}
			<span class="cc">
				<span aria-hidden="true">CC</span><span class="sr-only">{m.cc_badge()}</span>
			</span>
		{/if}
		{#if hidden}
			<span class="badge">{m.badge_title_hidden()}</span>
		{/if}
		{#if watched}
			<span class="badge"><span aria-hidden="true">✓ </span>{m.badge_watched()}</span>
		{:else if percent > 0}
			<span class="badge progress">{m.badge_percent_watched({ percent })}</span>
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
		overflow-wrap: anywhere;
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
	.badge {
		font-size: 0.75rem;
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: 6px;
		padding: 0 6px;
		line-height: 1.5;
	}
	.badge.progress {
		border-color: var(--accent-text);
		color: var(--accent-text);
	}
	/* Text-only lists: one line of text per episode, no thumbnail. */
	.ep.text {
		border-radius: 0;
		padding: 10px 0;
		border-bottom: 1px solid var(--line);
	}
	.ep.text .t {
		margin: 0;
		font-size: 1rem;
	}
	.ep.text .t a {
		text-decoration: underline;
	}
	.ep.text .t a::after {
		border-radius: 4px;
	}
</style>
