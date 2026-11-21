<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { ACTOR_TYPES, HISTORY_ENTITIES } from '#lib/community/change.js';
	import { actorTypeLabel, blockLabel, entityLabel, valText } from '#lib/community/labels.js';
	import ChangeList from '#lib/components/community/ChangeList.svelte';
	import ErrorSummary from '#lib/components/community/ErrorSummary.svelte';
	import ConfirmPanel from '../ui/ConfirmPanel.svelte';
	import Flash from '../ui/Flash.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = getLocale();
	const when = (d: Date) =>
		formatDate(d, locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
	type Item = (typeof data.items)[number];

	const actorText = (item: Item) =>
		item.actorType === 'rule' || item.actorType === 'sync'
			? actorTypeLabel(item.actorType)
			: (item.actorName ?? m.community_actor_someone());
	const what = (item: Item) => {
		const base = m.community_hist_what({
			entity: entityLabel(item.entity),
			name: valText(item.label.name, locale)
		});
		return item.label.context
			? `${base} ${m.community_hist_in({ series: item.label.context })}`
			: base;
	};
	const summary = (item: Item) => {
		const args = { actor: actorText(item), what: what(item) };
		return item.kind === 'create'
			? m.community_hist_create(args)
			: item.kind === 'delete'
				? m.community_hist_delete(args)
				: m.community_hist_update(args);
	};

	/** The current query with some keys changed (null removes a key). */
	const withQuery = (changes: Record<string, string | null>) => {
		const q = new SvelteURLSearchParams(page.url.search);
		q.delete('reverted');
		for (const [k, v] of Object.entries(changes)) {
			if (v === null) q.delete(k);
			else q.set(k, v);
		}
		const s = q.toString();
		return `${resolve('/manage/history')}${s ? `?${s}` : ''}`;
	};
	const reverted = $derived(page.url.searchParams.has('reverted'));
	const failed = $derived(form && 'errors' in form ? form : null);
	const actionQuery = $derived.by(() => {
		const q = new SvelteURLSearchParams(page.url.search);
		q.delete('revert');
		q.delete('reverted');
		const s = q.toString();
		return `?/revert${s ? `&${s}` : ''}`;
	});
</script>

<svelte:head>
	<title>{m.community_history_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.community_history_title()}</h1>
<p class="lead">{m.community_history_lead()}</p>

<Flash message={reverted ? m.community_reverted() : null} />
{#if failed}
	<ErrorSummary
		errors={failed.errors as Record<string, string>}
		title={m.community_revert_error()}
		labels={{}}
		targets={{ revert: `e${failed.entryId}` }}
	/>
{/if}

{#if data.confirm}
	{@const c = data.confirm}
	<ConfirmPanel
		title={m.community_revert_confirm_title()}
		action={actionQuery}
		confirmLabel={m.community_revert_confirm()}
		cancelHref={withQuery({ revert: null })}
		fields={{ entry_id: c.id }}
	>
		<p><b>{summary(c)}</b> · {when(c.createdAt)}</p>
		<ChangeList changes={c.changes} />
		<p>{m.community_revert_confirm_text()}</p>
		{#if c.block}<p class="error">{blockLabel(c.block)}</p>{/if}
	</ConfirmPanel>
{/if}

<form method="get" class="filters" aria-labelledby="filter-h">
	<h2 id="filter-h" class="sr-only">{m.community_history_filter()}</h2>
	<div class="field">
		<label for="h-entity">{m.community_history_entity()}</label>
		<select id="h-entity" name="entity">
			<option value="" selected={data.filter.entity === ''}>{m.community_history_all()}</option>
			{#each HISTORY_ENTITIES as e (e)}
				<option value={e} selected={data.filter.entity === e}>{entityLabel(e)}</option>
			{/each}
		</select>
	</div>
	<div class="field">
		<label for="h-actor">{m.community_history_actor()}</label>
		<select id="h-actor" name="actor">
			<option value="" selected={data.filter.actor === ''}>{m.community_history_all()}</option>
			{#each ACTOR_TYPES as a (a)}
				<option value={a} selected={data.filter.actor === a}>{actorTypeLabel(a)}</option>
			{/each}
		</select>
	</div>
	<div class="field">
		<label for="h-from">{m.community_history_from()}</label>
		<input id="h-from" name="from" type="date" value={data.filter.from} />
	</div>
	<div class="field">
		<label for="h-to">{m.community_history_to()}</label>
		<input id="h-to" name="to" type="date" value={data.filter.to} />
	</div>
	<div class="actions">
		<button type="submit" class="btn primary">{m.community_history_apply()}</button>
		<a class="btn ghost" href={resolve('/manage/history')}>{m.community_history_reset()}</a>
	</div>
</form>

{#if data.items.length === 0}
	<p>{m.community_history_none()}</p>
{:else}
	<ul class="plain entries">
		{#each data.items as item (item.id)}
			<li>
				<article id="e{item.id}" tabindex="-1" aria-labelledby="e{item.id}-h">
					<h2 id="e{item.id}-h">{summary(item)}</h2>
					<p class="meta">
						{when(item.createdAt)} · {m.community_hist_entry({ id: item.id })}
						{#if item.suggestionId}· {m.community_hist_from_suggestion({
								id: item.suggestionId
							})}{/if}
						{#if item.revertOf}· {m.community_hist_revert_of({ id: item.revertOf })}{/if}
						{#if item.revertedBy}· {m.community_hist_reverted_by({ id: item.revertedBy })}{/if}
					</p>
					<ChangeList changes={item.changes} />
					{#if item.block === null}
						{@const rh = withQuery({ revert: String(item.id) })}
						{@const al = m.community_revert() + m.community_item_name({ title: what(item) })}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- withQuery() starts from resolve() -->
						<a class="btn ghost" href={rh} aria-label={al}>{m.community_revert()}</a>
					{:else if item.block !== 'already_reverted'}
						<p class="muted small">
							{m.community_hist_cant_revert({ reason: blockLabel(item.block) })}
						</p>
					{/if}
				</article>
			</li>
		{/each}
	</ul>
{/if}

{#if data.page > 0 || data.hasMore}
	<nav aria-label={m.community_history_pages()} class="pager">
		{#if data.page > 0}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- withQuery() starts from resolve() -->
			<a href={withQuery({ page: String(data.page - 1), revert: null })}>
				{m.community_history_newer()}
			</a>
		{/if}
		{#if data.hasMore}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- withQuery() starts from resolve() -->
			<a href={withQuery({ page: String(data.page + 1), revert: null })}>
				{m.community_history_older()}
			</a>
		{/if}
	</nav>
{/if}

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0 16px;
		align-items: flex-end;
		margin: 0 0 20px;
	}
	.filters .field {
		flex: 1 1 10rem;
		margin-bottom: 8px;
	}
	.entries {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	article {
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--surface2);
		padding: 12px 18px;
	}
	article h2 {
		font-size: 1rem;
		margin: 0 0 2px;
		overflow-wrap: anywhere;
	}
	.meta {
		margin: 0;
		color: var(--muted);
		font-size: 0.875rem;
	}
	.small {
		font-size: 0.875rem;
		margin: 6px 0 0;
	}
	.pager {
		display: flex;
		gap: 20px;
		margin: 20px 0;
	}
</style>
