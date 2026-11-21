<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import Flash from '../../../ui/Flash.svelte';
	import RuleForm from '../../RuleForm.svelte';
	import RuleTestResult from '../../RuleTestResult.svelte';
	import { groupName } from '../../names.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = $derived(data.detail.series);
	const channelName = $derived(
		Object.fromEntries(data.channels.map((ch) => [ch.id, `${ch.creatorName}: ${ch.title}`]))
	);
	const groupNames = $derived(Object.fromEntries(data.groups.map((g) => [g.id, groupName(g)])));
</script>

<svelte:head>
	<title>{m.manage_series_tab_rules()} · {s.title} · {m.site_name()}</title>
</svelte:head>

<h2 class="first">{m.manage_rules_title()}</h2>
<p class="lead">{m.manage_rules_lead()}</p>
<Flash message={data.deleted && !form ? m.manage_rule_deleted() : null} />

{#if data.rules.length === 0}
	<p>{m.manage_no_rules()}</p>
{:else}
	<div class="table-wrap">
		<table>
			<caption class="sr-only">{m.manage_rules_title()}</caption>
			<thead>
				<tr>
					<th scope="col" class="num">{m.manage_col_priority()}</th>
					<th scope="col">{m.manage_col_pattern()}</th>
					<th scope="col">{m.manage_col_match()}</th>
					<th scope="col">{m.manage_col_channel()}</th>
					<th scope="col">{m.manage_col_target()}</th>
					<th scope="col">{m.manage_col_dates()}</th>
					<th scope="col">{m.manage_col_state()}</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rules as r (r.id)}
					<tr>
						<td class="num">{r.priority}</td>
						<th scope="row">
							<a
								href={resolve('/manage/series/[id]/rules/[ruleId]', {
									id: String(s.id),
									ruleId: String(r.id)
								})}
							>
								<code>{r.pattern}</code>
							</a>
						</th>
						<td>{r.match === 'regex' ? m.manage_match_regex() : m.manage_match_contains()}</td>
						<td>
							{r.channelId ? (channelName[r.channelId] ?? r.channelId) : m.manage_all_channels()}
						</td>
						<td>{r.target === 'extras' ? m.manage_target_extras() : m.manage_target_main()}</td>
						<td>
							{!r.withinSeriesDates
								? m.manage_rule_dates_any()
								: s.startedAt
									? m.manage_rule_dates_series()
									: m.manage_rule_dates_no_start()}
						</td>
						<td>{r.enabled ? m.manage_rule_enabled() : m.manage_rule_disabled()}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<h2>{m.manage_rule_new()}</h2>
<RuleForm
	values={form?.values ?? {}}
	errors={form?.errors}
	channels={data.channels}
	hasExtras={Boolean(data.detail.extras)}
	hasStartDate={Boolean(data.detail.series.startedAt)}
	submitLabel={m.manage_rule_create()}
/>
{#if form?.test}
	<RuleTestResult
		checked={form.test.checked}
		matches={form.test.matches}
		seriesTitles={data.seriesTitles}
		{groupNames}
	/>
{/if}
<p><a href={resolve('/manage/rules')}>{m.manage_go_apply_rules()}</a></p>

<style>
	.first {
		margin-top: 0;
	}
</style>
