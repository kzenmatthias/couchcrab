<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { kindLabel, statusLabel } from '#lib/labels.js';
	import { actorTypeLabel, entityLabel, valText } from '#lib/community/labels.js';
	import ChangeList from '#lib/components/community/ChangeList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = $derived(data.series);
	const locale = getLocale();
	const date = (d: Date) => formatDate(d, locale, { dateStyle: 'long', timeZone: 'UTC' });
	type Item = (typeof data.history)[number];
	const actorText = (h: Item) =>
		h.actorType === 'rule' || h.actorType === 'sync'
			? actorTypeLabel(h.actorType)
			: (h.actorName ?? m.community_actor_someone());
	const summary = (h: Item) => {
		const name = h.label ? valText(h.label.name, locale) : m.community_public_episode();
		const what = m.community_hist_what({ entity: entityLabel(h.entity), name });
		const args = { actor: actorText(h), what };
		return h.kind === 'create'
			? m.community_hist_create(args)
			: h.kind === 'delete'
				? m.community_hist_delete(args)
				: m.community_hist_update(args);
	};
</script>

<svelte:head>
	<title>{s.title} · {m.community_series_tab_about()} · {m.site_name()}</title>
</svelte:head>

<div class="about">
	<h2>{m.series_about_heading()}</h2>
	{#if data.description}
		{#if data.description.isFallback}
			<p class="fallback">{m.series_description_fallback()}</p>
		{/if}
		<p lang={data.description.locale}>{data.description.text}</p>
	{:else}
		<p>{m.series_no_description()}</p>
	{/if}

	<h2>{m.series_details_heading()}</h2>
	<dl>
		<dt>{m.series_detail_kind()}</dt>
		<dd>{kindLabel(s.kind)}</dd>
		<dt>{m.series_detail_status()}</dt>
		<dd>{statusLabel(s.status)}</dd>
		{#if s.startedAt}
			<dt>{m.series_detail_started()}</dt>
			<dd><time datetime={s.startedAt.toISOString()}>{date(s.startedAt)}</time></dd>
		{/if}
		{#if s.endedAt}
			<dt>{m.series_detail_ended()}</dt>
			<dd><time datetime={s.endedAt.toISOString()}>{date(s.endedAt)}</time></dd>
		{/if}
	</dl>

	<section class="history" aria-labelledby="history-h">
		<h2 id="history-h">{m.community_public_history_heading()}</h2>
		<p class="lead">{m.community_public_history_lead()}</p>
		{#if data.history.length === 0}
			<p>{m.community_public_history_empty()}</p>
		{:else}
			<ul class="plain">
				{#each data.history as h (h.id)}
					<li>
						<p class="sum">
							<b>{summary(h)}</b>
							{#if h.suggested}({m.community_public_suggested()}){/if}
							{#if h.isRevert}{m.community_public_revert()}{/if}
						</p>
						<p class="when">
							<time datetime={h.createdAt.toISOString()}>{date(h.createdAt)}</time>
						</p>
						<ChangeList changes={h.changes} />
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.about {
		max-width: 44rem;
	}
	h2 {
		font-size: 1.5rem;
		margin: 0 0 12px;
	}
	h2 + p,
	.fallback + p {
		margin-bottom: 40px;
	}
	.fallback {
		color: var(--muted);
		font-style: italic;
	}
	p {
		font-size: 1.0625rem;
		margin-top: 0;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 8px 24px;
		margin: 0;
	}
	dt {
		font-weight: 700;
	}
	dd {
		margin: 0;
	}
	.history {
		margin-top: 40px;
	}
	.history .lead,
	.when {
		color: var(--muted);
		font-size: 0.9375rem;
	}
	.history li {
		border-top: 1px solid var(--line);
		padding: 12px 0;
	}
	.sum,
	.when {
		margin: 0;
		overflow-wrap: anywhere;
	}
</style>
