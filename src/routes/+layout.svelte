<script lang="ts">
	import '#lib/styles/tokens.css';
	import '#lib/styles/base.css';
	import { onMount, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import favicon from '#lib/assets/favicon.svg';
	import { accountSyncAdapter } from '#lib/prefs/account.js';
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

	// Signed in: the account is the source of truth, this browser keeps a cache. Signing out
	// stops the sync and keeps the local copy.
	const adapter = accountSyncAdapter();
	$effect(() => {
		if (!viewing.loaded) return;
		const userId = data.syncUserId;
		untrack(() => {
			if (userId === null) viewing.disconnect();
			else void viewing.connect(adapter, userId);
		});
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
