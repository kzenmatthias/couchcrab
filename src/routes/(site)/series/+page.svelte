<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import SeriesPoster from '#lib/components/SeriesPoster.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.series_list_title()} · {m.site_name()}</title>
</svelte:head>

<div class="page">
	<h1>{m.series_list_title()}</h1>
	{#if data.series.length}
		<ul class="grid">
			{#each data.series as s (s.slug)}
				<li><SeriesPoster {...s} headingLevel={2} /></li>
			{/each}
		</ul>
	{:else}
		<p>{m.home_empty()}</p>
	{/if}
</div>

<style>
	.page {
		padding: 32px var(--page-pad) 0;
	}
	h1 {
		font-size: clamp(2rem, 5vw, 3rem);
		letter-spacing: -0.03em;
		margin: 0 0 32px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
		gap: 28px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>
