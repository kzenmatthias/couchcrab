<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import CreatorForm from '../CreatorForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.manage_creator_new()} · {m.site_name()}</title>
</svelte:head>

<p><a href={resolve('/manage/creators')}>{m.manage_back_creators()}</a></p>
<h1>{m.manage_creator_new()}</h1>
<CreatorForm
	values={form?.values ?? {}}
	errors={form?.errors}
	isAdmin={data.manager.role === 'admin'}
	locked={false}
	isNew
	submitLabel={m.manage_create()}
/>
