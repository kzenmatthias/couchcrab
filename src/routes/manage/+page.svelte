<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const locale = getLocale();
	const isAdmin = $derived(data.manager.role === 'admin');

	const when = (d: Date | null) =>
		d
			? formatDate(d, locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
			: m.manage_never();
</script>

<svelte:head>
	<title>{m.manage_dashboard_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.manage_dashboard_title()}</h1>
<p class="lead">{m.manage_dashboard_lead()}</p>

<ul class="stats plain">
	<li>
		<a href={resolve('/manage/unsorted')}>
			<span class="n">{data.unsorted}</span>
			<span>{m.manage_stat_unsorted()}</span>
		</a>
	</li>
	{#if isAdmin}
		<li>
			<a href={resolve('/manage/claims')}>
				<span class="n">{data.pendingClaims}</span>
				<span>{m.manage_stat_claims()}</span>
			</a>
		</li>
	{:else}
		<li>
			<span class="box">
				<span class="n">{data.pendingClaims}</span>
				<span>{m.manage_stat_claims()}</span>
			</span>
		</li>
	{/if}
	<li>
		<a href={resolve('/manage/creators')}>
			<span class="n">{data.creators}</span>
			<span>{m.manage_stat_creators()}</span>
		</a>
	</li>
	<li>
		<a href={resolve('/manage/series')}>
			<span class="n">{data.series}</span>
			<span>{m.manage_stat_series()}</span>
		</a>
	</li>
</ul>

<h2>{m.manage_last_sync_title()}</h2>
<div class="table-wrap">
	<table>
		<caption class="sr-only">{m.manage_last_sync_title()}</caption>
		<thead>
			<tr>
				<th scope="col">{m.manage_col_channel()}</th>
				<th scope="col">{m.manage_col_creator()}</th>
				<th scope="col">{m.manage_col_sync()}</th>
				<th scope="col">{m.manage_col_last_sync()}</th>
			</tr>
		</thead>
		<tbody>
			{#each data.channels as ch (ch.id)}
				<tr>
					<th scope="row">{ch.title}</th>
					<td>
						<a href={resolve('/manage/creators/[id]', { id: String(ch.creatorId) })}>
							{ch.creatorName}
						</a>
					</td>
					<td>{ch.syncEnabled ? m.manage_sync_on() : m.manage_sync_off()}</td>
					<td>{when(ch.lastSyncedAt)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
{#if isAdmin}
	<p><a href={resolve('/manage/sync')}>{m.manage_go_sync()}</a></p>
{/if}

<style>
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr));
		gap: 16px;
		list-style: none;
		padding: 0;
		margin: 0 0 16px;
	}
	.stats a,
	.stats .box {
		display: flex;
		flex-direction: column;
		gap: 4px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 16px 18px;
		text-decoration: none;
		height: 100%;
	}
	.stats a:hover span:last-child {
		text-decoration: underline;
	}
	.n {
		font-size: 2rem;
		font-weight: 800;
		line-height: 1.1;
	}
</style>
