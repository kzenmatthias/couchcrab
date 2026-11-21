<script lang="ts">
	import '#lib/styles/tokens.css';
	import '#lib/styles/base.css';
	import { onMount, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import favicon from '#lib/assets/favicon.svg';
	import { setViewing, ViewingStore } from '#lib/prefs/store.svelte.js';
	import { applyDisplay } from '#lib/prefs/display.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	// One store per app; the server copy only knows the cookie mirror.
	const viewing = new ViewingStore(
		untrack(() => data.viewingCookie),
		() => void invalidateAll()
	);
	setViewing(viewing);

	onMount(() => {
		viewing.load();
		return () => viewing.destroy();
	});

	// Display settings live on <html> (also set before first paint by the script in app.html).
	$effect(() => {
		if (viewing.loaded) applyDisplay(document.documentElement, viewing.prefs.display);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
