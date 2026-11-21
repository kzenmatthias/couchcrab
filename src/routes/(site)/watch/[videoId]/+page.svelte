<script lang="ts">
	import WatchView from './WatchView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!-- A fresh view per episode: countdown, revealed title and player state start over. -->
{#key data.video.youtubeVideoId}
	<WatchView {data} />
{/key}
