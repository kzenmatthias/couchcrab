<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import ArtHeader from '#lib/components/ArtHeader.svelte';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import Rail from '#lib/components/Rail.svelte';
	import SeriesPoster from '#lib/components/SeriesPoster.svelte';
	import VerifiedBadge from '#lib/components/VerifiedBadge.svelte';
	import { seedFrom, spokenDuration, youtubeChannelUrl } from '#lib/video.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const c = $derived(data.creator);
	const locale = $derived(getLocale());
</script>

<svelte:head>
	<title>{c.name} · {m.site_name()}</title>
</svelte:head>

<ArtHeader poster={{ type: 'art', palette: 'dusk', seed: seedFrom(c.slug) }} tint={c.color}>
	<div class="who">
		<CreatorAvatar name={c.name} color={c.color} avatarUrl={c.avatarUrl} size={120} />
		<div>
			<h1>{c.name}</h1>
			{#if c.claimedAt}<p class="badge"><VerifiedBadge /></p>{/if}
			{#if c.bio}<p class="bio">{c.bio}</p>{/if}
			{#if data.channels.length}
				<h2 class="sr-only">{m.creator_channels_heading()}</h2>
				<ul class="links">
					{#each data.channels as ch (ch.youtubeChannelId)}
						<li>
							<a href={youtubeChannelUrl(ch.youtubeChannelId)} rel="external noopener">
								{m.creator_channel_link({ title: ch.title })}
								<span class="sr-only">{m.opens_youtube()}</span>
								<span aria-hidden="true">↗</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
			<p class="fan">{m.creator_fan_note({ name: c.name })}</p>
		</div>
	</div>
</ArtHeader>

{#if data.series.length}
	<Rail title={m.creator_series_heading()} note={String(data.series.length)}>
		{#each data.series as s (s.slug)}
			<li><SeriesPoster {...s} /></li>
		{/each}
	</Rail>
{/if}

<section class="uploads" aria-labelledby="uploads-h">
	<h2 id="uploads-h">{m.creator_latest_heading()}</h2>
	{#if data.uploads.length}
		<ul>
			{#each data.uploads as v (v.id)}
				<li>
					<a class="t" href={resolve('/(site)/watch/[videoId]', { videoId: v.youtubeVideoId })}>
						{#if v.titleHidden}
							{v.episodeNumber
								? m.episode_long({ number: v.episodeNumber })
								: m.episode_hidden_untitled()}
						{:else}
							{v.title}
						{/if}
					</a>
					{#if v.titleHidden}<span class="badge">{m.badge_title_hidden()}</span>{/if}
					<span class="m">
						<a href={resolve('/(site)/series/[slug]', { slug: v.series.slug })}>{v.series.title}</a>
						· {spokenDuration(v.durationS, locale)}
						·
						<time datetime={v.publishedAt.toISOString()}>
							{formatDate(v.publishedAt, locale, { dateStyle: 'medium', timeZone: 'UTC' })}
						</time>
						{#if v.hasCreatorCaptions}
							<span class="cc">
								<span aria-hidden="true">CC</span><span class="sr-only">{m.cc_badge()}</span>
							</span>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p>{m.creator_no_uploads()}</p>
	{/if}
</section>

<style>
	.badge {
		font-size: 0.75rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0 6px;
	}
	.who {
		display: flex;
		gap: 20px 32px;
		align-items: center;
		flex-wrap: wrap;
	}
	h1 {
		font-size: clamp(2.25rem, 6vw, 3.5rem);
		line-height: 1.05;
		letter-spacing: -0.03em;
		margin: 0 0 10px;
		overflow-wrap: anywhere;
	}
	.badge {
		margin: 0 0 10px;
	}
	.bio {
		margin: 0 0 12px;
		font-size: 1.0625rem;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
	}
	.links a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 32px;
		padding: 2px 10px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface2);
		font-size: 0.8125rem;
		text-shadow: none;
	}
	.fan {
		margin: 0;
		font-size: 0.8125rem;
	}
	.uploads {
		padding: 32px var(--page-pad) 0;
	}
	.uploads h2 {
		font-size: 1.5rem;
		margin: 0 0 16px;
	}
	.uploads ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.uploads li {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		align-items: baseline;
		padding: 14px 0;
		border-bottom: 1px solid var(--line);
	}
	.uploads .t {
		font-weight: 700;
	}
	.uploads .m {
		color: var(--muted);
		font-size: 0.875rem;
	}
	.cc {
		font-size: 0.6875rem;
		font-weight: 800;
		border: 1.5px solid var(--text);
		color: var(--text);
		border-radius: 4px;
		padding: 0 4px;
	}
</style>
