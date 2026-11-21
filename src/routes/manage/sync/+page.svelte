<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let running = $state(false);
	let resultBox = $state<HTMLElement>();
	$effect(() => {
		if (form?.summary || form?.failed) resultBox?.focus();
	});
	const status = (s: 'ok' | 'skipped' | 'error') =>
		s === 'ok'
			? m.manage_sync_status_ok()
			: s === 'skipped'
				? m.manage_sync_status_skipped()
				: m.manage_sync_status_error();
</script>

<svelte:head>
	<title>{m.manage_sync_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.manage_sync_title()}</h1>
<p class="lead">{m.manage_sync_lead()}</p>

{#if !data.hasApiKey}
	<p class="note" id="sync-disabled">{m.manage_sync_no_key()}</p>
{/if}

<form
	method="post"
	action="?/sync"
	use:enhance={() => {
		running = true;
		return async ({ update }) => {
			await update();
			running = false;
		};
	}}
>
	<div class="actions">
		<button
			type="submit"
			class="btn primary"
			disabled={!data.hasApiKey || running}
			aria-describedby={data.hasApiKey ? undefined : 'sync-disabled'}
		>
			{m.manage_sync_now()}
		</button>
		<button
			type="submit"
			class="btn ghost"
			name="dry_run"
			value="1"
			disabled={!data.hasApiKey || running}
			aria-describedby={data.hasApiKey ? undefined : 'sync-disabled'}
		>
			{m.manage_sync_dry_run()}
		</button>
	</div>
</form>
<p role="status">{running ? m.manage_sync_running() : ''}</p>

{#if form?.failed}
	<section class="result" tabindex="-1" bind:this={resultBox} aria-labelledby="sync-result-title">
		<h2 id="sync-result-title">{m.manage_sync_failed()}</h2>
		<p>{form.failed}</p>
	</section>
{:else if form?.summary}
	{@const s = form.summary}
	<section class="result" tabindex="-1" bind:this={resultBox} aria-labelledby="sync-result-title">
		<h2 id="sync-result-title">{s.dryRun ? m.manage_sync_result_dry() : m.manage_sync_result()}</h2>
		<div class="table-wrap">
			<table>
				<caption class="sr-only">{m.manage_sync_channels_caption()}</caption>
				<thead>
					<tr>
						<th scope="col">{m.manage_col_channel()}</th>
						<th scope="col">{m.manage_col_status()}</th>
						<th scope="col" class="num">{m.manage_col_fetched()}</th>
						<th scope="col" class="num">{m.manage_col_new()}</th>
						<th scope="col" class="num">{m.manage_col_placed()}</th>
						<th scope="col" class="num">{m.manage_status_unsorted()}</th>
						<th scope="col" class="num">{m.manage_col_shorts()}</th>
						<th scope="col" class="num">{m.manage_col_skipped()}</th>
						<th scope="col" class="num">{m.manage_col_updated_count()}</th>
						<th scope="col">{m.manage_col_errors()}</th>
					</tr>
				</thead>
				<tbody>
					{#each s.channels as c (c.youtubeChannelId)}
						<tr>
							<th scope="row">{c.title} <code>{c.youtubeChannelId}</code></th>
							<td>{status(c.status)}</td>
							<td class="num">{c.fetched}</td>
							<td class="num">{c.new}</td>
							<td class="num">{c.placed}</td>
							<td class="num">{c.unsorted}</td>
							<td class="num">{c.ignored}</td>
							<td class="num">{c.skipped}</td>
							<td class="num">{c.updated}</td>
							<td>{c.errors.join(' ') || m.manage_none()}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if s.refresh}
			<p>
				{m.manage_sync_refresh({
					checked: s.refresh.checked,
					refreshed: s.refresh.refreshed,
					restored: s.refresh.restored,
					removed: s.refresh.removed
				})}
			</p>
			{#if s.refresh.errors.length > 0}<p>{s.refresh.errors.join(' ')}</p>{/if}
		{/if}
	</section>
{/if}

<style>
	.note {
		border-left: 4px solid var(--sand);
		padding: 6px 12px;
		max-width: 44rem;
	}
	.result {
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 4px 18px 8px;
		margin: 16px 0;
	}
	code {
		font-weight: 400;
		font-size: 0.8125rem;
	}
</style>
