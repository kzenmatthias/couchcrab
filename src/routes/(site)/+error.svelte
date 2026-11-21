<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';

	const title = $derived(page.status === 404 ? m.error_not_found() : m.error_generic());
</script>

<svelte:head>
	<title>{title} · {m.site_name()}</title>
</svelte:head>

<div class="error">
	<h1>{title}</h1>
	<p><a href={resolve('/(site)')}>{m.error_back_home()}</a></p>
</div>

<style>
	.error {
		padding: 48px var(--page-pad);
	}
	h1 {
		font-size: 2rem;
		margin: 0 0 12px;
	}
</style>
