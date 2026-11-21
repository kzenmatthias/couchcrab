<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import Timeline from '#lib/components/Timeline.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.series.title} · {m.series_extras_title()} · {m.site_name()}</title>
</svelte:head>

<p class="intro">
	{m.series_extras_intro()}
	<a href={resolve('/(site)/series/[slug]', { slug: data.extras.slug })}>{data.extras.title}</a>
</p>

<Timeline
	videos={data.videos}
	grouping={data.extras.grouping}
	sessions={data.sessions}
	anchor={data.extras.startedAt}
	heading={m.series_extras_title()}
/>

<style>
	.intro {
		margin: 0 0 32px;
		max-width: 44rem;
	}
</style>
