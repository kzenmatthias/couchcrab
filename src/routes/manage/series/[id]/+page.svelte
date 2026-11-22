<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import ErrorSummary from '../../ui/ErrorSummary.svelte';
	import Flash from '../../ui/Flash.svelte';
	import SeriesForm from '../SeriesForm.svelte';
	import { seriesValues } from '../helpers.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const d = $derived(data.detail);

	const values = $derived(
		form?.action === 'save' && form.values
			? form.values
			: seriesValues(d.series, d.translations, d.creatorIds)
	);
	const flash = $derived(
		form?.saved === 'series' || (data.saved && !form)
			? m.manage_saved()
			: form?.saved === 'extras'
				? m.manage_extras_created()
				: null
	);
</script>

<svelte:head>
	<title>{d.series.title} · {m.manage_series_title()} · {m.site_name()}</title>
</svelte:head>

<Flash message={flash} />
<ErrorSummary
	errors={form?.action === 'extras' ? form.errors : null}
	labels={{ extras: m.manage_extras_title() }}
/>

{#key d.series.id}
	<SeriesForm
		{values}
		errors={form?.action === 'save' ? form.errors : null}
		creators={data.creators}
		posterVideos={data.posterVideos}
		autoPoster={data.autoPoster}
		isNew={false}
		submitLabel={m.manage_save()}
	/>
{/key}

{#if !d.series.parentId}
	<h2>{m.manage_extras_title()}</h2>
	{#if d.extras}
		<p>
			{m.manage_extras_exists()}
			<a href={resolve('/manage/series/[id]', { id: String(d.extras.id) })}>{d.extras.title}</a>
		</p>
	{:else}
		<p>{m.manage_extras_explain()}</p>
		<form method="post" action="?/createExtras" use:enhance>
			<button type="submit" class="btn ghost">{m.manage_extras_create()}</button>
		</form>
	{/if}
{/if}
<p>
	<a href={resolve('/(site)/series/[slug]', { slug: d.series.slug })}>{m.manage_view_on_site()}</a>
</p>
