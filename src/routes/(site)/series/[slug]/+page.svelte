<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import Timeline from '#lib/components/Timeline.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.series.title} · {m.series_tab_timeline()} · {m.site_name()}</title>
</svelte:head>

<Timeline
	videos={data.videos}
	grouping={data.series.grouping}
	sessions={data.sessions}
	anchor={data.series.startedAt}
/>
