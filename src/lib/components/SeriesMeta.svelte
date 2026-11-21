<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { statusLabel, type SeriesStatus } from '#lib/labels.js';

	type Props = {
		series: {
			startedAt: Date | null;
			status: SeriesStatus;
			creatorCount: number;
			episodeCount: number;
		};
	};

	let { series }: Props = $props();

	const started = $derived(
		series.startedAt
			? formatDate(series.startedAt, getLocale(), {
					month: 'long',
					year: 'numeric',
					timeZone: 'UTC'
				})
			: null
	);
</script>

<ul class="meta">
	{#if started}<li>{m.series_started({ date: started })}</li>{/if}
	<li>{m.series_creator_count({ count: series.creatorCount })}</li>
	<li>{m.series_episode_count({ count: series.episodeCount })}</li>
	<li>{statusLabel(series.status)}</li>
</ul>

<style>
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 18px;
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.875rem;
	}
</style>
