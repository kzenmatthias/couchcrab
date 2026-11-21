<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import ConfirmPanel from '../ui/ConfirmPanel.svelte';
	import Flash from '../ui/Flash.svelte';
	import { groupName } from '../series/names.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const groupNames = $derived(Object.fromEntries(data.groups.map((g) => [g.id, groupName(g)])));
	const withRules = $derived(data.series.filter((s) => s.rules > 0));
	const self = resolve('/manage/rules');
</script>

<svelte:head>
	<title>{m.manage_rules_page_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.manage_rules_page_title()}</h1>
<p class="lead">{m.manage_rules_page_lead()}</p>

<Flash
	message={form?.applied
		? m.manage_apply_done({ placed: form.applied.placed.length, checked: form.applied.checked })
		: null}
/>

<h2>{m.manage_apply_title()}</h2>
{#if form?.preview}
	{@const p = form.preview}
	{#if p.placed.length === 0}
		<section class="box" aria-labelledby="preview-title">
			<h3 id="preview-title">{m.manage_apply_preview_title()}</h3>
			<p>{m.manage_apply_preview_none({ checked: p.checked })}</p>
		</section>
	{:else}
		<ConfirmPanel
			title={m.manage_apply_preview_title()}
			action="?/apply"
			confirmLabel={m.manage_apply_confirm({ count: p.placed.length })}
			cancelHref={self}
		>
			<p>{m.manage_apply_preview_summary({ placed: p.placed.length, checked: p.checked })}</p>
			<div class="table-wrap">
				<table>
					<caption class="sr-only">{m.manage_apply_preview_title()}</caption>
					<thead>
						<tr>
							<th scope="col">{m.manage_col_video()}</th>
							<th scope="col">{m.manage_col_channel()}</th>
							<th scope="col">{m.manage_col_would_go()}</th>
						</tr>
					</thead>
					<tbody>
						{#each p.placed as v (v.videoId)}
							<tr>
								<th scope="row">{v.title}</th>
								<td>{v.channelTitle}</td>
								<td>
									{data.seriesTitles[v.seriesId] ?? v.seriesId}{v.groupId !== null &&
									groupNames[v.groupId]
										? `, ${groupNames[v.groupId]}`
										: ''}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</ConfirmPanel>
	{/if}
{:else}
	<p>{m.manage_apply_explain()}</p>
	<form method="post" action="?/preview" use:enhance>
		<button type="submit" class="btn primary">{m.manage_apply_preview()}</button>
	</form>
{/if}

<h2>{m.manage_rules_by_series()}</h2>
{#if withRules.length === 0}
	<p>{m.manage_no_rules_anywhere()}</p>
{/if}
<ul>
	{#each data.series as s (s.id)}
		<li>
			<a href={resolve('/manage/series/[id]/rules', { id: String(s.id) })}>{s.title}</a>:
			{m.manage_rules_count({ count: s.rules })}
		</li>
	{/each}
</ul>

<style>
	.box {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 4px 16px;
		margin: 0 0 16px;
	}
</style>
