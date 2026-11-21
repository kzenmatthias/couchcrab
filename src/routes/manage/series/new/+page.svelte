<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import SeriesForm from '../SeriesForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.manage_series_new()} · {m.site_name()}</title>
</svelte:head>

<p><a href={resolve('/manage/series')}>{m.manage_back_series()}</a></p>
<h1>{m.manage_series_new()}</h1>
<SeriesForm
	values={form?.values ?? {}}
	errors={form?.errors}
	creators={data.creators}
	isNew
	submitLabel={m.manage_create()}
/>
