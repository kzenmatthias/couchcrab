<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import EpisodeCard from '#lib/components/EpisodeCard.svelte';
	import type { VideoCard } from '#lib/video.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** Creators in name order, each with their episodes in upload order. */
	const perCreator = $derived.by(() => {
		const map: Record<string, { creator: VideoCard['creator']; videos: VideoCard[] }> = {};
		for (const v of data.videos)
			(map[v.creator.slug] ??= { creator: v.creator, videos: [] }).videos.push(v);
		return Object.values(map).sort((a, b) => a.creator.name.localeCompare(b.creator.name));
	});
</script>

<svelte:head>
	<title>{data.series.title} · {m.series_tab_by_creator()} · {m.site_name()}</title>
</svelte:head>

{#each perCreator as group (group.creator.slug)}
	<section class="group" aria-labelledby="c-{group.creator.slug}">
		<h2 id="c-{group.creator.slug}">
			<a href={resolve('/(site)/creators/[slug]', { slug: group.creator.slug })}>
				{group.creator.name}
			</a>
			<small>{m.series_episode_count({ count: group.videos.length })}</small>
		</h2>
		<ul class="card-grid">
			{#each group.videos as video (video.id)}
				<li><EpisodeCard {video} /></li>
			{/each}
		</ul>
	</section>
{:else}
	<p>{m.series_no_episodes()}</p>
{/each}

<style>
	.group {
		margin-bottom: 56px;
	}
	h2 {
		font-size: 1.5rem;
		margin: 0 0 20px;
		display: flex;
		gap: 4px 12px;
		align-items: baseline;
		flex-wrap: wrap;
	}
	small {
		color: var(--muted);
		font-size: 0.875rem;
		font-weight: 400;
	}
</style>
