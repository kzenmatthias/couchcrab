<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';

	const forbidden = $derived(page.status === 403);
	const title = $derived(
		forbidden
			? m.creator_forbidden_title()
			: page.status === 404
				? m.error_not_found()
				: m.error_generic()
	);
</script>

<svelte:head>
	<title>{title} · {m.site_name()}</title>
</svelte:head>

<h1>{title}</h1>
{#if forbidden}
	<p class="lead">{m.creator_forbidden_body()}</p>
	<p><a href={resolve('/(site)/signin')}>{m.creator_forbidden_link()}</a></p>
{:else}
	<p><a href={resolve('/(site)')}>{m.error_back_home()}</a></p>
{/if}
