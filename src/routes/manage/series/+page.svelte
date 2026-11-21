<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { kindLabel, statusLabel } from '#lib/labels.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.manage_series_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.manage_series_title()}</h1>
<p class="lead">{m.manage_series_lead()}</p>
<div class="actions">
	<a class="btn primary" href={resolve('/manage/series/new')}>{m.manage_series_new()}</a>
</div>

<div class="table-wrap">
	<table>
		<caption class="sr-only">{m.manage_series_title()}</caption>
		<thead>
			<tr>
				<th scope="col">{m.manage_col_title()}</th>
				<th scope="col">{m.manage_col_kind()}</th>
				<th scope="col">{m.manage_col_status()}</th>
				<th scope="col" class="num">{m.manage_col_creators()}</th>
				<th scope="col" class="num">{m.manage_col_rules()}</th>
			</tr>
		</thead>
		<tbody>
			{#each data.series as s (s.id)}
				<tr>
					<th scope="row">
						<a href={resolve('/manage/series/[id]', { id: String(s.id) })}>{s.title}</a>
						{#if s.parentTitle}
							<span class="muted">{m.manage_extras_of({ title: s.parentTitle })}</span>
						{/if}
					</th>
					<td>{kindLabel(s.kind)}</td>
					<td>{statusLabel(s.status)}</td>
					<td class="num">{s.creators}</td>
					<td class="num">
						<a href={resolve('/manage/series/[id]/rules', { id: String(s.id) })}>
							{m.manage_rules_count({ count: s.rules })}
						</a>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	th .muted {
		display: block;
		font-weight: 400;
		font-size: 0.8125rem;
	}
</style>
