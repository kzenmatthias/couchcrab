<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.title} · {m.site_name()}</title>
</svelte:head>

<article class="page">
	{#if data.isFallback}
		<p class="fallback">{m.page_fallback_notice()}</p>
	{/if}
	<div lang={data.contentLocale}>
		<h1>{data.title}</h1>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- Markdown sanitised on the server -->
		<div class="prose">{@html data.html}</div>
	</div>
</article>

<style>
	.page {
		padding: 32px var(--page-pad) 0;
		max-width: calc(720px + 2 * var(--page-pad));
	}
	h1 {
		font-size: 2.5rem;
		letter-spacing: -0.02em;
		line-height: 1.1;
		margin: 0 0 24px;
	}
	.fallback {
		background: var(--surface2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 10px 14px;
	}
	.prose {
		font-size: 1rem;
		line-height: 1.6;
	}
	.prose :global(h2) {
		font-size: 1.375rem;
		margin: 32px 0 8px;
	}
	.prose :global(a) {
		text-decoration: underline;
	}
</style>
