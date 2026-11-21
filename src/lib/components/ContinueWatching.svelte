<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { continueWatchingIds } from '#lib/prefs/progress.js';
	import { getViewing } from '#lib/prefs/store.svelte.js';
	import type { VideoCard } from '#lib/video.js';
	import EpisodeCard from './EpisodeCard.svelte';
	import Rail from './Rail.svelte';

	/*
	 * Episodes started but not finished, from the progress in this browser. Rendered in the
	 * browser only (progress is not sent to the server) and left out when there is nothing.
	 */
	const viewing = getViewing();
	/** A string, so the effect only re-runs when the list really changes. */
	const key = $derived(viewing.loaded ? continueWatchingIds(viewing.progress).join(',') : '');
	let cards: VideoCard[] = $state([]);

	$effect(() => {
		const wanted = key ? key.split(',') : [];
		if (wanted.length === 0) {
			cards = [];
			return;
		}
		let cancelled = false;
		void viewing.fetchCards(wanted).then((result) => {
			if (!cancelled) cards = result;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

{#if cards.length}
	<Rail title={m.home_continue_heading()} size="big" episodes>
		{#each cards as video (video.id)}
			<li>
				<EpisodeCard {video} showSeries spoilerFree={viewing.spoilerFree(video.povSeriesId)} />
			</li>
		{/each}
	</Rail>
{/if}
