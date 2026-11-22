<script lang="ts">
	import { isPlaceholderImage } from '#lib/poster.js';

	type Props = {
		/** Image URLs to try in order (`posterSources`). Empty: nothing, the surface shows. */
		sources: string[];
		lazy?: boolean;
	};

	let { sources, lazy = false }: Props = $props();

	// How many sources failed, for this list of sources (a new list starts again at the first).
	const key = $derived(sources.join(' '));
	let failed = $state({ key: '', count: 0 });
	const index = $derived(failed.key === key ? failed.count : 0);
	const src = $derived(sources[index]);
	const next = () => (failed = { key, count: index + 1 });
</script>

<!--
	Decorative: the title is real text next to it. When an image does not load (or YouTube sends its
	grey placeholder for a missing size), the next source is tried; after the last one the image is
	removed and the plain surface behind it shows.
-->
{#if src}
	<img
		{src}
		alt=""
		loading={lazy ? 'lazy' : undefined}
		decoding="async"
		onerror={next}
		onload={(e) => {
			if (isPlaceholderImage(src, (e.currentTarget as HTMLImageElement).naturalWidth)) next();
		}}
	/>
{/if}

<style>
	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
