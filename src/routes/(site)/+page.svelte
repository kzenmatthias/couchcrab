<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import SeriesPoster from '#lib/components/SeriesPoster.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.home_title()}</title>
</svelte:head>

<div class="intro">
	<h1>{m.site_tagline()}</h1>
</div>

<section class="row" aria-labelledby="series-h">
	<h2 id="series-h">{m.home_series_heading()}</h2>
	{#if data.series.length}
		<ul class="posters">
			{#each data.series as s (s.slug)}
				<li><SeriesPoster {...s} /></li>
			{/each}
		</ul>
	{:else}
		<p>{m.home_empty()}</p>
	{/if}
</section>

<style>
	.intro {
		padding: 24px var(--page-pad) 0;
	}
	h1 {
		font-size: clamp(2rem, 5vw, 3.25rem);
		line-height: 1.08;
		letter-spacing: -0.03em;
		max-width: 820px;
		margin: 0;
	}
	.row {
		padding: 32px var(--page-pad) 0;
	}
	h2 {
		font-size: 1.5rem;
		margin: 0 0 20px;
	}
	.posters {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 24px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>
