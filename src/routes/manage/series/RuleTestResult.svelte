<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';

	type Match = {
		videoId: number;
		title: string;
		channelTitle: string;
		publishedAt: Date;
		status: 'placed' | 'unsorted' | 'ignored';
		seriesId: number;
		target: 'main' | 'extras';
		groupId: number | null;
	};

	type Props = {
		checked: number;
		matches: Match[];
		seriesTitles: Record<number, string>;
		groupNames: Record<number, string>;
	};

	let { checked, matches, seriesTitles, groupNames }: Props = $props();
	const locale = getLocale();
	let box = $state<HTMLElement>();
	$effect(() => {
		box?.focus();
	});
	const statusName = (s: Match['status']) =>
		s === 'placed'
			? m.manage_status_placed()
			: s === 'unsorted'
				? m.manage_status_unsorted()
				: m.manage_status_ignored();
</script>

<section class="result" tabindex="-1" bind:this={box} aria-labelledby="rule-test-title">
	<h2 id="rule-test-title">{m.manage_rule_test_title()}</h2>
	<p>{m.manage_rule_test_summary({ matches: matches.length, checked })}</p>
	<p class="hint">{m.manage_rule_test_nothing_written()}</p>
	{#if matches.length > 0}
		<div class="table-wrap">
			<table>
				<caption class="sr-only">{m.manage_rule_test_title()}</caption>
				<thead>
					<tr>
						<th scope="col">{m.manage_col_video()}</th>
						<th scope="col">{m.manage_col_channel()}</th>
						<th scope="col">{m.manage_col_published()}</th>
						<th scope="col">{m.manage_col_now()}</th>
						<th scope="col">{m.manage_col_would_go()}</th>
					</tr>
				</thead>
				<tbody>
					{#each matches as v (v.videoId)}
						<tr>
							<th scope="row">{v.title}</th>
							<td>{v.channelTitle}</td>
							<td>{formatDate(v.publishedAt, locale, { dateStyle: 'medium', timeZone: 'UTC' })}</td>
							<td>{statusName(v.status)}</td>
							<td>
								{seriesTitles[v.seriesId] ?? v.seriesId}{v.groupId !== null && groupNames[v.groupId]
									? `, ${groupNames[v.groupId]}`
									: ''}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	.result {
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 4px 18px 8px;
		margin: 24px 0;
	}
	.result h2 {
		margin-top: 12px;
	}
</style>
