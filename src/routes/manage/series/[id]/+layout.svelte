<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { navCurrent } from '#lib/nav.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const s = $derived(data.detail.series);
	const id = $derived(String(s.id));
	const tabs = $derived([
		{ href: resolve('/manage/series/[id]', { id }), label: m.manage_series_tab_details() },
		{ href: resolve('/manage/series/[id]/groups', { id }), label: m.manage_series_tab_groups() },
		{ href: resolve('/manage/series/[id]/rules', { id }), label: m.manage_series_tab_rules() }
	]);
	const current = (href: string) => navCurrent(href, page.url, { exact: href === tabs[0].href });
</script>

<p><a href={resolve('/manage/series')}>{m.manage_back_series()}</a></p>
<h1>{s.title}</h1>
{#if data.detail.parent}
	<p class="lead">
		{m.manage_extras_of({ title: data.detail.parent.title })}
		<a href={resolve('/manage/series/[id]', { id: String(data.detail.parent.id) })}>
			{m.manage_open_parent()}
		</a>
	</p>
{/if}
<nav class="tabs" aria-label={m.manage_series_tabs_label({ title: s.title })}>
	<ul>
		{#each tabs as tab (tab.href)}
			<li><a href={tab.href} aria-current={current(tab.href)}>{tab.label}</a></li>
		{/each}
	</ul>
</nav>

{@render children()}

<style>
	.tabs ul {
		display: flex;
		gap: 4px 8px;
		flex-wrap: wrap;
		list-style: none;
		margin: 0 0 24px;
		padding: 0;
		border-bottom: 1px solid var(--line);
	}
	.tabs a {
		display: inline-block;
		padding: 10px 12px;
		text-decoration: none;
		color: var(--muted);
	}
	.tabs a:hover {
		text-decoration: underline;
	}
	.tabs a[aria-current] {
		color: var(--text);
		font-weight: 700;
		box-shadow: inset 0 -3px 0 var(--accent);
	}
</style>
