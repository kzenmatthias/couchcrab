<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate, formatDateRange } from '#lib/i18n.js';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import YouTubePlayer from '#lib/components/YouTubePlayer.svelte';
	import VideoThumb from '#lib/components/VideoThumb.svelte';
	import { clockDuration, spokenDuration, youtubeWatchUrl } from '#lib/video.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const v = $derived(data.video);
	const locale = $derived(getLocale());

	const groupLabel = $derived(
		data.group
			? (data.group.title ?? m.timeline_session({ number: data.group.number }))
			: data.week
				? m.timeline_week({ number: data.week.number })
				: null
	);
	const groupNote = $derived(
		data.week ? formatDateRange(data.week.start, data.week.end, locale) : null
	);
</script>

<svelte:head>
	<title>{v.title} · {m.site_name()}</title>
</svelte:head>

<div class="player">
	<div class="main">
		{#key v.youtubeVideoId}
			<YouTubePlayer
				videoId={v.youtubeVideoId}
				title={v.title}
				poster={data.series.poster}
				tint={v.creator.color}
			/>
		{/key}

		<h1>{v.title}</h1>
		<p class="meta">
			<a class="creator" href={resolve('/(site)/creators/[slug]', { slug: v.creator.slug })}>
				<CreatorAvatar
					name={v.creator.name}
					color={v.creator.color}
					avatarUrl={v.creator.avatarUrl}
					size={40}
				/>
				<span>{v.creator.name}</span>
			</a>
			<span>{spokenDuration(v.durationS, locale)}</span>
			<span>
				<time datetime={v.publishedAt.toISOString()}>
					{formatDate(v.publishedAt, locale, { dateStyle: 'long', timeZone: 'UTC' })}
				</time>
			</span>
			{#if v.hasCreatorCaptions}
				<span><span class="cc" aria-hidden="true">CC</span> {m.cc_badge()}</span>
			{/if}
		</p>
		<p class="where">
			<a href={resolve('/(site)/series/[slug]', { slug: data.series.slug })}>{data.series.title}</a>
			{#if groupLabel}· {groupLabel}{#if groupNote}, {groupNote}{/if}{/if}
			{#if v.episodeNumber}· {m.episode_long({ number: v.episodeNumber })}{/if}
		</p>
		<p class="btns">
			<a class="btn ghost" href={youtubeWatchUrl(v.youtubeVideoId)} rel="external noopener">
				{m.watch_on_youtube()}
				<span class="sr-only">{m.opens_youtube()}</span>
				<span aria-hidden="true">↗</span>
			</a>
		</p>
	</div>

	<aside class="queue" aria-labelledby="queue-h">
		<h2 id="queue-h">
			{groupLabel ? m.watch_queue_heading_group({ group: groupLabel }) : m.watch_queue_heading()}
		</h2>
		<ol>
			{#each data.queue as item (item.id)}
				{@const current = item.id === v.id}
				<li class:current>
					<a
						href={resolve('/(site)/watch/[videoId]', { videoId: item.youtubeVideoId })}
						aria-current={current ? 'page' : undefined}
					>
						<span class="qt">
							<VideoThumb
								youtubeVideoId={item.youtubeVideoId}
								poster={item.series.poster}
								tint={item.creator.color}
								duration={clockDuration(item.durationS)}
							/>
						</span>
						<span class="qi">
							<span class="qn">{item.creator.name}</span>
							<span class="qtitle">{item.title}</span>
							{#if current}
								<span class="playing">{m.watch_now_playing()}</span>
							{:else}
								<span class="qd">{spokenDuration(item.durationS, locale)}</span>
							{/if}
						</span>
					</a>
				</li>
			{/each}
		</ol>
	</aside>
</div>

<style>
	.player {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 360px;
		gap: 40px;
		padding: 32px var(--page-pad) 0;
	}
	@media (max-width: 1000px) {
		.player {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	h1 {
		font-size: clamp(1.5rem, 4vw, 2rem);
		line-height: 1.2;
		margin: 24px 0 12px;
		overflow-wrap: anywhere;
	}
	.meta,
	.where {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 16px;
		margin: 0 0 12px;
		color: var(--muted);
	}
	.where {
		gap: 6px;
		color: var(--text);
	}
	.creator {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: var(--text);
		font-weight: 700;
		text-decoration: none;
	}
	.creator span {
		text-decoration: underline;
	}
	.cc {
		font-size: 0.6875rem;
		font-weight: 800;
		border: 1.5px solid var(--text);
		color: var(--text);
		border-radius: 4px;
		padding: 0 4px;
	}
	.btns {
		margin: 20px 0 0;
	}
	.queue h2 {
		font-size: 1rem;
		margin: 0 0 12px;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	ol a {
		display: flex;
		gap: 14px;
		align-items: center;
		padding: 8px;
		border: 1px solid transparent;
		border-radius: 14px;
		text-decoration: none;
	}
	ol a:hover .qtitle {
		text-decoration: underline;
	}
	.current a {
		border: 2px solid var(--accent-text);
		background: var(--surface2);
	}
	.qt {
		flex: 0 0 140px;
		width: 140px;
	}
	.qt :global(.thumb) {
		border-radius: 10px;
	}
	.qi {
		display: flex;
		flex-direction: column;
		min-width: 0;
		font-size: 0.875rem;
	}
	.qn {
		font-weight: 700;
	}
	.qtitle {
		overflow-wrap: anywhere;
	}
	.qd,
	.playing {
		color: var(--muted);
		font-size: 0.8125rem;
	}
	.playing {
		color: var(--accent-text);
		font-weight: 700;
	}
	@media (max-width: 420px) {
		.qt {
			flex-basis: 96px;
			width: 96px;
		}
	}
</style>
