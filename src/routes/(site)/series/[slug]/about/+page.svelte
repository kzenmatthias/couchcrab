<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { kindLabel, statusLabel } from '#lib/labels.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = $derived(data.series);
	const date = (d: Date) => formatDate(d, getLocale(), { dateStyle: 'long', timeZone: 'UTC' });
</script>

<svelte:head>
	<title>{s.title} · {m.series_tab_about()} · {m.site_name()}</title>
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
</style>
