<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.manage_creators_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.manage_creators_title()}</h1>
<p class="lead">{m.manage_creators_lead()}</p>

<div class="actions">
	<a class="btn primary" href={resolve('/manage/creators/new')}>{m.manage_creator_new()}</a>
</div>

<form method="get" role="search" class="search">
	<div class="field">
		<label for="creator-search">{m.manage_search_creators()}</label>
		<input id="creator-search" name="q" type="search" value={data.q} />
	</div>
	<button type="submit" class="btn ghost">{m.manage_search()}</button>
</form>

<p role="status">{m.manage_results({ count: data.creators.length })}</p>

<div class="table-wrap">
	<table>
		<caption class="sr-only">{m.manage_creators_title()}</caption>
		<thead>
			<tr>
				<th scope="col">{m.manage_col_name()}</th>
				<th scope="col">{m.manage_col_slug()}</th>
				<th scope="col" class="num">{m.manage_col_channels()}</th>
				<th scope="col">{m.manage_col_state()}</th>
			</tr>
		</thead>
		<tbody>
			{#each data.creators as c (c.id)}
				<tr>
					<th scope="row">
						<span class="name">
							<CreatorAvatar name={c.name} color={c.color} avatarUrl={c.avatarUrl} size={28} />
							<a href={resolve('/manage/creators/[id]', { id: String(c.id) })}>{c.name}</a>
						</span>
					</th>
					<td><code>{c.slug}</code></td>
					<td class="num">{c.channels}</td>
					<td>
						{#if c.claimedAt}<span class="tag">{m.manage_claimed()}</span>{/if}
						{#if c.optedOut}<span class="tag">{m.manage_opted_out()}</span>{/if}
						{#if !c.claimedAt && !c.optedOut}<span class="muted">{m.manage_unclaimed()}</span>{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.search {
		display: flex;
		gap: 12px;
		align-items: flex-end;
		flex-wrap: wrap;
	}
	.search .field {
		flex: 1 1 16rem;
		margin-bottom: 0;
	}
	.name {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
</style>
