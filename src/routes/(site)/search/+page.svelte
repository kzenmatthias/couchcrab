<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { m } from '#lib/paraglide/messages.js';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import EpisodeCard from '#lib/components/EpisodeCard.svelte';
	import SeriesPoster from '#lib/components/SeriesPoster.svelte';
	import VerifiedBadge from '#lib/components/VerifiedBadge.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Section = 'series' | 'creators' | 'episodes';
	const r = $derived(data.results);
	/** The search URL with `section` shown in full (or not), keeping the other sections. */
	const moreHref = (section: Section, on: boolean) => {
		const more = [...data.expand.filter((other) => other !== section), ...(on ? [section] : [])];
		const params = new SvelteURLSearchParams([['q', data.q], ...more.map((s) => ['more', s])]);
		return `${resolve('/(site)/search')}?${params.toString()}#results-${section}`;
	};

	const sectionLabel: Record<Section, () => string> = {
		series: m.search_section_series,
		creators: m.search_section_creators,
		episodes: m.search_section_episodes
	};
	const noneText: Record<Section, () => string> = {
		series: m.search_none_series,
		creators: m.search_none_creators,
		episodes: m.search_none_episodes
	};
	const showAll: Record<Section, (a: { count: number }) => string> = {
		series: m.search_show_all_series,
		creators: m.search_show_all_creators,
		episodes: m.search_show_all_episodes
	};
	const sections = $derived(
		r
			? ([
					{ key: 'series', result: r.series },
					{ key: 'creators', result: r.creators },
					{ key: 'episodes', result: r.episodes }
				] as const)
			: []
	);
</script>

<svelte:head>
	<title>
		{data.q ? m.search_doc_title({ query: data.q }) : m.search_title()} · {m.site_name()}
	</title>
</svelte:head>

<div class="page">
	<h1>{data.q ? m.search_heading_results({ query: data.q }) : m.search_title()}</h1>

	<!--
		Narrow screens only (the header field is hidden there): the search link in the top bar
		leads here. Without a query the field gets focus on load, with or without JavaScript.
	-->
	<form class="field" role="search" method="get" action={resolve('/(site)/search')}>
		<label for="page-search">{m.search_label()}</label>
		<div class="row">
			<!-- svelte-ignore a11y_autofocus -->
			<input id="page-search" name="q" type="search" value={data.q} autofocus={!data.q} />
			<button type="submit">{m.search_submit()}</button>
		</div>
	</form>

	<!-- Announced when the results change without a full page load. -->
	<p class="summary" role="status">
		{#if r}
			{r.total > 0
				? m.search_summary({ total: r.total, query: data.q })
				: m.search_none({ query: data.q })}
		{/if}
	</p>

	{#if !r}
		<p class="lead">{m.search_empty_lead()}</p>
	{:else if r.total === 0}
		<section class="tips" aria-labelledby="tips-h">
			<h2 id="tips-h">{m.search_tips_heading()}</h2>
			<ul>
				<li>{m.search_tip_spelling()}</li>
				<li>{m.search_tip_spoiler()}</li>
				<li><a href={resolve('/(site)/series')}>{m.search_tip_browse_series()}</a></li>
				<li><a href={resolve('/(site)/creators')}>{m.search_tip_browse_creators()}</a></li>
			</ul>
		</section>
	{:else}
		{#each sections as { key, result } (key)}
			<section class="results" id="results-{key}" aria-labelledby="results-{key}-h">
				<h2 id="results-{key}-h">
					{m.search_section_heading({ section: sectionLabel[key](), count: result.total })}
				</h2>
				{#if result.total === 0}
					<p class="muted">{noneText[key]()}</p>
				{:else if key === 'series'}
					<ul class="grid series">
						{#each r.series.items as s (s.slug)}
							<li><SeriesPoster {...s} headingLevel={3} /></li>
						{/each}
					</ul>
				{:else if key === 'creators'}
					<ul class="grid creators">
						{#each r.creators.items as c (c.slug)}
							<li>
								<a href={resolve('/(site)/creators/[slug]', { slug: c.slug })}>
									<CreatorAvatar name={c.name} color={c.color} avatarUrl={c.avatarUrl} size={72} />
									<span class="name">{c.name}</span>
								</a>
								{#if c.viaChannel}
									<span class="muted small">{m.search_via_channel({ channel: c.viaChannel })}</span>
								{/if}
								{#if c.claimedAt}<VerifiedBadge />{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<ul class="grid episodes">
						{#each r.episodes.items as v (v.id)}
							<li><EpisodeCard video={v} showSeries headingLevel={3} /></li>
						{/each}
					</ul>
				{/if}
				{#if result.expanded && result.total > result.items.length}
					<p class="muted">{m.search_capped({ count: result.items.length })}</p>
				{/if}
				{#if !result.expanded && result.total > result.items.length}
					<p class="more">
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- moreHref() starts from resolve() -->
						<a href={moreHref(key, true)}>{showAll[key]({ count: result.total })}</a>
					</p>
				{:else if result.expanded && result.total > 0}
					<p class="more">
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- moreHref() starts from resolve() -->
						<a href={moreHref(key, false)}>{m.search_show_fewer()}</a>
					</p>
				{/if}
			</section>
		{/each}
	{/if}
</div>

<style>
	.page {
		padding: 32px var(--page-pad) 0;
	}
	h1 {
		font-size: clamp(2rem, 5vw, 3rem);
		letter-spacing: -0.03em;
		margin: 0 0 8px;
		overflow-wrap: anywhere;
	}
	.field {
		display: none;
	}
	@media (max-width: 900px) {
		.field {
			display: block;
			margin: 0 0 20px;
			max-width: 36rem;
		}
	}
	.field label {
		display: block;
		font-weight: 700;
		margin: 0 0 6px;
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.field input {
		flex: 1 1 auto;
		min-width: 0;
		min-height: 44px;
		padding: 9px 14px;
		background: var(--surface2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	.field button {
		flex: none;
		min-height: 44px;
		padding: 9px 16px;
		background: var(--accent);
		color: var(--on-accent);
		border: 1px solid transparent;
		border-radius: var(--radius);
		font-weight: 700;
	}
	.summary {
		color: var(--muted);
		margin: 0 0 24px;
		overflow-wrap: anywhere;
	}
	.summary:empty {
		margin: 0;
	}
	.lead,
	.tips {
		max-width: 44rem;
	}
	h2 {
		font-size: 1.5rem;
		margin: 0 0 16px;
	}
	.results {
		margin: 0 0 40px;
	}
	.grid {
		display: grid;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.grid.series {
		grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
		gap: 28px;
	}
	.grid.episodes {
		grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
		gap: 24px;
	}
	.grid.creators {
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 20px 12px;
	}
	.creators li {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		text-align: center;
	}
	.creators a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 8px;
		border-radius: 14px;
		text-decoration: none;
	}
	.creators a:hover .name {
		text-decoration: underline;
	}
	.name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.muted {
		color: var(--muted);
	}
	.small {
		font-size: 0.875rem;
		overflow-wrap: anywhere;
	}
	.more a {
		display: inline-block;
		padding: 10px 0;
		font-weight: 700;
		text-decoration: underline;
	}
	.tips li {
		margin: 0 0 8px;
	}
	.tips a {
		text-decoration: underline;
	}
</style>
