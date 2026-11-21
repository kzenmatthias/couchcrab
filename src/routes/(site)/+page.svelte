<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import ArtHeader from '#lib/components/ArtHeader.svelte';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import EpisodeCard from '#lib/components/EpisodeCard.svelte';
	import Rail from '#lib/components/Rail.svelte';
	import SeriesMeta from '#lib/components/SeriesMeta.svelte';
	import SeriesPoster from '#lib/components/SeriesPoster.svelte';
	import { kindLabel } from '#lib/labels.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const featured = $derived(data.featured);
</script>

<svelte:head>
	<title>{m.home_title()}</title>
</svelte:head>

{#if featured}
	<ArtHeader poster={featured.poster} size="tall">
		<p class="kicker">{m.home_featured_kicker({ kind: kindLabel(featured.kind) })}</p>
		<h1>{featured.title}</h1>
		{#if featured.description}
			<p class="lead" lang={featured.description.locale}>{featured.description.text}</p>
		{/if}
		<SeriesMeta series={featured} />
		<p class="cta">
			<a class="btn primary" href={resolve('/(site)/series/[slug]', { slug: featured.slug })}>
				{m.home_featured_cta({ title: featured.title })}
			</a>
		</p>
	</ArtHeader>
{:else}
	<div class="intro">
		<h1>{m.site_tagline()}</h1>
	</div>
{/if}

<!--
	Continue watching goes here, above New uploads, as a <Rail size="big">.
	Progress arrives in the next round; until then there is nothing to show and nothing renders.
-->

{#if data.latest.length}
	<Rail title={m.home_latest_heading()}>
		{#each data.latest as video (video.id)}
			<li><EpisodeCard {video} showSeries /></li>
		{/each}
	</Rail>
{/if}

{#if data.series.length}
	<Rail title={m.home_series_heading()}>
		{#each data.series as s (s.slug)}
			<li><SeriesPoster {...s} /></li>
		{/each}
	</Rail>
{:else}
	<p class="empty">{m.home_empty()}</p>
{/if}

{#if data.creators.length}
	<Rail title={m.home_creators_heading()}>
		{#each data.creators as c (c.slug)}
			<li>
				<a class="creator" href={resolve('/(site)/creators/[slug]', { slug: c.slug })}>
					<CreatorAvatar name={c.name} color={c.color} avatarUrl={c.avatarUrl} size={88} />
					<span>{c.name}</span>
				</a>
			</li>
		{/each}
	</Rail>
{/if}

<style>
	.intro {
		padding: 24px var(--page-pad) 0;
	}
	.intro h1 {
		font-size: clamp(2rem, 5vw, 3.25rem);
		line-height: 1.08;
		letter-spacing: -0.03em;
		max-width: 820px;
		margin: 0;
	}
	.kicker {
		color: var(--sea-text);
		font-weight: 700;
		font-size: 0.8125rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		margin: 0;
	}
	h1 {
		font-size: clamp(2.25rem, 7vw, 4rem);
		line-height: 1.05;
		letter-spacing: -0.03em;
		margin: 14px 0 16px;
		overflow-wrap: anywhere;
	}
	.lead {
		font-size: 1.125rem;
		margin: 0 0 16px;
	}
	.cta {
		margin: 28px 0 0;
	}
	.empty {
		padding: 32px var(--page-pad);
	}
	.creator {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		width: 130px;
		padding: 8px 4px;
		border-radius: 14px;
		text-align: center;
		text-decoration: none;
		font-size: 0.875rem;
	}
	.creator:hover span {
		text-decoration: underline;
	}
</style>
