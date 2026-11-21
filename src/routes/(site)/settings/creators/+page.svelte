<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import CreatorToggle from '#lib/components/CreatorToggle.svelte';
	import PosterArt from '#lib/components/PosterArt.svelte';
	import RadioGroup from '#lib/components/RadioGroup.svelte';
	import { getViewing } from '#lib/prefs/store.svelte.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const viewing = getViewing();

	const allIds = $derived(data.creators.map((c) => c.id));
	const global = $derived(viewing.watching());
	const isOn = (id: number) => global === null || global.includes(id);
	const selected = $derived(data.creators.filter((c) => isOn(c.id)).length);

	let query = $state('');
	const shown = $derived.by(() => {
		const q = query.trim().toLocaleLowerCase();
		return q ? data.creators.filter((c) => c.name.toLocaleLowerCase().includes(q)) : data.creators;
	});

	function seriesSummary(s: (typeof data.series)[number]) {
		const list = viewing.watching(s.id);
		const count = s.creatorIds.filter((id) => list === null || list.includes(id)).length;
		return viewing.isCustom(s.id)
			? m.settings_series_custom_summary({ count, total: s.creatorIds.length })
			: m.settings_series_global_summary({ count, total: s.creatorIds.length });
	}
</script>

<svelte:head>
	<title>{m.settings_creators_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.settings_creators_title()}</h1>
<p class="intro">{m.settings_creators_intro()}</p>

<div class="tools">
	<p class="count" role="status">{m.settings_selected_count({ count: selected })}</p>
	<button type="button" class="btn ghost" onclick={() => viewing.selectAll()}>
		{m.settings_select_all()}
	</button>
	<button type="button" class="btn ghost" onclick={() => viewing.clearAll()}>
		{m.settings_clear_all()}
	</button>
</div>

<div class="find">
	<label for="find-creator">{m.settings_find_creator()}</label>
	<input
		id="find-creator"
		type="search"
		autocomplete="off"
		placeholder={m.settings_find_placeholder()}
		bind:value={query}
	/>
</div>

<section aria-labelledby="all-h">
	<h2 id="all-h" class="caps">{m.settings_all_creators({ count: data.creators.length })}</h2>
	{#if shown.length}
		<ul class="grid">
			{#each shown as c (c.id)}
				<li>
					<CreatorToggle
						creator={c}
						pressed={isOn(c.id)}
						onclick={() => viewing.toggleCreator(c.id, allIds)}
					/>
				</li>
			{/each}
		</ul>
	{:else}
		<p>{m.settings_no_creator_match()}</p>
	{/if}
</section>

<section aria-labelledby="per-series-h" class="per-series">
	<h2 id="per-series-h">{m.settings_per_series_heading()}</h2>
	<p>{m.settings_per_series_intro()}</p>
	<ul>
		{#each data.series as s (s.id)}
			<li id="series-{s.slug}">
				<span class="poster" aria-hidden="true">
					<PosterArt
						palette={s.poster?.type === 'art' ? s.poster.palette : undefined}
						seed={s.poster?.type === 'art' ? s.poster.seed : 1}
						width={160}
						height={90}
					/>
				</span>
				<span class="info">
					<b>{s.title}</b>
					<span class="sum">{seriesSummary(s)}</span>
				</span>
				<RadioGroup
					legend={m.settings_series_mode_legend({ title: s.title })}
					legendHidden
					name="mode-{s.id}"
					options={[
						{ value: 'global', label: m.settings_mode_global() },
						{ value: 'custom', label: m.settings_mode_custom() }
					]}
					value={viewing.isCustom(s.id) ? 'custom' : 'global'}
					onchange={(mode: 'global' | 'custom') => viewing.setSeriesMode(s.id, mode, s.creatorIds)}
				/>
				<a
					class="btn ghost"
					href={resolve('/(site)/settings/creators/[slug]', { slug: s.slug })}
					aria-label={m.settings_series_edit_label({ title: s.title })}
				>
					{m.settings_series_edit()}
				</a>
			</li>
		{/each}
	</ul>
</section>

<style>
	.intro {
		margin: 0 0 20px;
		max-width: 44rem;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
		margin-bottom: 24px;
	}
	.count {
		margin: 0;
		border: 1px solid var(--sea-text);
		color: var(--sea-text);
		border-radius: 999px;
		padding: 4px 12px;
		font-weight: 700;
		font-size: 0.875rem;
	}
	.find {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 26rem;
		margin-bottom: 32px;
	}
	.find label {
		font-weight: 700;
		font-size: 0.875rem;
	}
	.find input {
		min-height: 44px;
		padding: 8px 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface2);
	}
	.caps {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin: 0 0 16px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 16px 8px;
		list-style: none;
		margin: 0 0 48px;
		padding: 0;
	}
	.per-series h2 {
		font-size: 1.25rem;
		margin: 0 0 4px;
	}
	.per-series > p {
		color: var(--muted);
		margin: 0 0 16px;
	}
	.per-series ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.per-series li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 16px;
		padding: 14px 0;
		border-top: 1px solid var(--line);
	}
	.per-series li :global(fieldset) {
		margin: 0;
	}
	.poster {
		position: relative;
		display: block;
		width: 64px;
		aspect-ratio: 16 / 9;
		border-radius: 8px;
		overflow: hidden;
		flex: 0 0 auto;
	}
	.info {
		display: flex;
		flex-direction: column;
		flex: 1 1 12rem;
		min-width: 0;
	}
	.sum {
		color: var(--muted);
		font-size: 0.875rem;
	}
</style>
