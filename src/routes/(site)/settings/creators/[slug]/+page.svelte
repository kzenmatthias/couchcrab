<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import CreatorToggle from '#lib/components/CreatorToggle.svelte';
	import RadioGroup from '#lib/components/RadioGroup.svelte';
	import { getViewing } from '#lib/prefs/store.svelte.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const viewing = getViewing();

	const s = $derived(data.series);
	const ids = $derived(data.creators.map((c) => c.id));
	const list = $derived(viewing.watching(s.id));
	const custom = $derived(viewing.isCustom(s.id));
	const isOn = (id: number) => list === null || list.includes(id);
	const selected = $derived(data.creators.filter((c) => isOn(c.id)).length);
</script>

<svelte:head>
	<title>{m.settings_series_title({ title: s.title })} · {m.site_name()}</title>
</svelte:head>

<p class="back">
	<a href={resolve('/(site)/settings/creators')}>
		<span aria-hidden="true">←</span>
		{m.settings_back_to_creators()}
	</a>
</p>
<h1>{m.settings_series_title({ title: s.title })}</h1>
<p class="intro">{m.settings_series_intro()}</p>

<RadioGroup
	legend={m.settings_series_mode_legend({ title: s.title })}
	name="mode"
	options={[
		{ value: 'global', label: m.settings_mode_global() },
		{ value: 'custom', label: m.settings_mode_custom() }
	]}
	value={custom ? 'custom' : 'global'}
	onchange={(mode: 'global' | 'custom') => viewing.setSeriesMode(s.id, mode, ids)}
/>

<p class="count" role="status">
	{m.settings_series_selected({ count: selected, total: data.creators.length })}
</p>

{#if !custom}
	<p class="hint">{m.settings_series_global_hint()}</p>
{/if}

<ul class="grid" aria-label={m.settings_series_creators_label({ title: s.title })}>
	{#each data.creators as c (c.id)}
		<li>
			<CreatorToggle
				creator={c}
				pressed={isOn(c.id)}
				onclick={() => viewing.toggleSeriesCreator(s.id, c.id, ids)}
			/>
		</li>
	{/each}
</ul>

<p>
	<a class="btn primary" href={resolve('/(site)/series/[slug]', { slug: s.slug })}>
		{m.settings_series_back_to_series({ title: s.title })}
	</a>
</p>

<style>
	.back {
		margin: 0 0 12px;
	}
	.intro {
		margin: 0 0 24px;
		max-width: 44rem;
	}
	.count {
		display: inline-block;
		margin: 0 0 12px;
		border: 1px solid var(--sea-text);
		color: var(--sea-text);
		border-radius: 999px;
		padding: 4px 12px;
		font-weight: 700;
		font-size: 0.875rem;
	}
	.hint {
		color: var(--muted);
		margin: 0 0 16px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 16px 8px;
		list-style: none;
		margin: 0 0 32px;
		padding: 0;
	}
</style>
