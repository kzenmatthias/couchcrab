<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import ErrorSummary from '../ui/ErrorSummary.svelte';
	import Flash from '../ui/Flash.svelte';
	import { errorMessage } from '../ui/errors.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const roleName = (r: 'viewer' | 'editor' | 'admin') =>
		r === 'admin'
			? m.manage_role_admin()
			: r === 'editor'
				? m.manage_role_editor()
				: m.manage_role_viewer();
	const saved = $derived(
		typeof form?.saved === 'number' ? data.users.find((u) => u.id === form.saved) : undefined
	);
	const providerName = (p: 'discord' | 'google') =>
		p === 'discord' ? m.manage_provider_discord() : m.manage_provider_google();
</script>

<svelte:head>
	<title>{m.manage_users_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.manage_users_title()}</h1>
<p class="lead">{m.manage_users_lead()}</p>

<form method="get" role="search" class="search">
	<div class="field">
		<label for="user-search">{m.manage_search_users()}</label>
		<input id="user-search" name="q" type="search" value={data.q} />
	</div>
	<button type="submit" class="btn ghost">{m.manage_search()}</button>
</form>

<Flash
	message={saved ? m.manage_role_saved({ name: saved.name, role: roleName(saved.role) }) : null}
/>
{#if form?.errors && typeof form.userId === 'number'}
	{@const who = data.users.find((u) => u.id === form.userId)}
	<ErrorSummary
		errors={form.errors}
		labels={{ role: m.manage_role_for({ name: who?.name ?? '' }) }}
		targets={{ role: `role-${form.userId}` }}
	/>
{/if}
<p class="muted">{m.community_promote_explain({ threshold: data.threshold })}</p>
<p role="status">{m.manage_results({ count: data.users.length })}</p>

<div class="table-wrap">
	<table>
		<caption class="sr-only">{m.manage_users_title()}</caption>
		<thead>
			<tr>
				<th scope="col">{m.manage_col_name()}</th>
				<th scope="col">{m.manage_col_providers()}</th>
				<th scope="col">{m.manage_col_claimed_creator()}</th>
				<th scope="col">{m.community_col_trust()}</th>
				<th scope="col">{m.manage_col_role()}</th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as u (u.id)}
				{@const err = form?.userId === u.id ? form.errors?.role : undefined}
				<tr>
					<th scope="row">
						{u.name}
						{#if u.id === data.me}<span class="muted">({m.manage_you()})</span>{/if}
					</th>
					<td>{u.providers.map(providerName).join(', ')}</td>
					<td>
						{#if u.creatorSlug}
							<a href={resolve('/(site)/creators/[slug]', { slug: u.creatorSlug })}>
								{u.creatorName}
							</a>
						{:else}
							<span class="muted">{m.manage_none()}</span>
						{/if}
					</td>
					<td>
						{m.community_review_trust({
							approved: u.trust.approved,
							rejected: u.trust.rejected,
							trust: u.trust.trust
						})}
						{#if u.promote}<br /><span class="tag">{m.community_promote_hint()}</span>{/if}
					</td>
					<td>
						<form method="post" action="?/role" use:enhance class="role">
							<input type="hidden" name="user_id" value={u.id} />
							<label class="sr-only" for="role-{u.id}">{m.manage_role_for({ name: u.name })}</label>
							<select
								id="role-{u.id}"
								name="role"
								aria-invalid={err ? 'true' : undefined}
								aria-describedby={err ? `role-${u.id}-error` : undefined}
							>
								{#each ['viewer', 'editor', 'admin'] as const as r (r)}
									<option value={r} selected={u.role === r}>{roleName(r)}</option>
								{/each}
							</select>
							<button type="submit" class="btn ghost">
								{m.manage_save()}<span class="sr-only">: {u.name}</span>
							</button>
							{#if err}<p class="error" id="role-{u.id}-error">{errorMessage(err)}</p>{/if}
						</form>
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
	.role {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}
	.role select {
		width: auto;
	}
	.role .error {
		flex-basis: 100%;
	}
</style>
