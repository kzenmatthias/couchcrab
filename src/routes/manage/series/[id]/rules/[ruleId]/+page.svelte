<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import ConfirmPanel from '../../../../ui/ConfirmPanel.svelte';
	import Flash from '../../../../ui/Flash.svelte';
	import RuleForm from '../../../RuleForm.svelte';
	import RuleTestResult from '../../../RuleTestResult.svelte';
	import { groupName } from '../../../names.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = $derived(data.detail.series);
	const r = $derived(data.rule);
	const self = $derived(
		resolve('/manage/series/[id]/rules/[ruleId]', { id: String(s.id), ruleId: String(r.id) })
	);
	const values = $derived(
		form?.values ?? {
			pattern: r.pattern,
			match: r.match,
			channel_id: r.channelId === null ? '' : String(r.channelId),
			target: r.target,
			priority: String(r.priority),
			enabled: r.enabled
		}
	);
	const groupNames = $derived(Object.fromEntries(data.groups.map((g) => [g.id, groupName(g)])));
</script>

<svelte:head>
	<title>{m.manage_rule_edit()} · {s.title} · {m.site_name()}</title>
</svelte:head>

<p>
	<a href={resolve('/manage/series/[id]/rules', { id: String(s.id) })}>{m.manage_back_rules()}</a>
</p>
<h2 class="first">{m.manage_rule_edit()}</h2>
<Flash message={form?.saved || (data.saved && !form) ? m.manage_saved() : null} />
{#if form?.confirm}
	<ConfirmPanel
		title={m.manage_confirm_delete_rule({ pattern: r.pattern })}
		action="?/delete"
		confirmLabel={m.manage_delete()}
		cancelHref={self}
	>
		<p>{m.manage_confirm_delete_rule_text()}</p>
	</ConfirmPanel>
{/if}

{#key r.id}
	<RuleForm
		{values}
		errors={form?.errors}
		channels={data.channels}
		hasExtras={Boolean(data.detail.extras)}
		submitLabel={m.manage_save()}
	/>
{/key}
{#if form?.test}
	<RuleTestResult
		checked={form.test.checked}
		matches={form.test.matches}
		seriesTitles={data.seriesTitles}
		{groupNames}
	/>
{/if}

<h2>{m.manage_rule_delete_title()}</h2>
<form method="post" action="?/askDelete" use:enhance>
	<button type="submit" class="btn ghost">{m.manage_rule_delete()}</button>
</form>

<style>
	.first {
		margin-top: 0;
	}
</style>
