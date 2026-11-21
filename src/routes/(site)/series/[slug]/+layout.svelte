<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import ArtHeader from '#lib/components/ArtHeader.svelte';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import SeriesMeta from '#lib/components/SeriesMeta.svelte';
	import { kindLabel } from '#lib/labels.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const s = $derived(data.series);

	const tabs = $derived([
		{ href: resolve('/(site)/series/[slug]', { slug: s.slug }), label: m.series_tab_timeline() },
		{
			href: resolve('/(site)/series/[slug]/by-creator', { slug: s.slug }),
			label: m.series_tab_by_creator()
		},
		...(s.extras
			? [
					{
						href: resolve('/(site)/series/[slug]/extras', { slug: s.slug }),
						label: m.series_tab_extras({ count: s.extras.episodeCount })
					}
				]
			: []),
		{ href: resolve('/(site)/series/[slug]/about', { slug: s.slug }), label: m.series_tab_about() }
	]);
</script>

<ArtHeader poster={s.poster}>
	<p class="kicker">
		{#if s.parent}
			<a href={resolve('/(site)/series/[slug]', { slug: s.parent.slug })}>{s.parent.title}</a> ·
		{/if}
		{kindLabel(s.kind)}
	</p>
	<h1>{s.title}</h1>
	<SeriesMeta series={s} />
	{#if data.creators.length}
		<h2 class="sr-only">{m.series_creators_heading()}</h2>
		<ul class="who">
			{#each data.creators as c (c.slug)}
				<li>
					<a href={resolve('/(site)/creators/[slug]', { slug: c.slug })}>
						<CreatorAvatar name={c.name} color={c.color} avatarUrl={c.avatarUrl} size={28} />
						<span>{c.name}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</ArtHeader>

<nav class="subnav" aria-label={m.series_subnav_label()}>
	<ul>
		{#each tabs as tab (tab.href)}
			<li>
				<a href={tab.href} aria-current={page.url.pathname === tab.href ? 'page' : undefined}>
					{tab.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>

<div class="body">
	{@render children()}
</div>

<style>
	.kicker {
		color: var(--sea-text);
		font-weight: 700;
		font-size: 0.8125rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		margin: 0;
	}
	h1 {
		font-size: clamp(2.25rem, 6vw, 3.75rem);
		line-height: 1.05;
		letter-spacing: -0.03em;
		margin: 10px 0 14px;
		overflow-wrap: anywhere;
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 10px;
		list-style: none;
		margin: 20px 0 0;
		padding: 0;
	}
	.who a {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 4px 12px 4px 4px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--surface2);
		font-size: 0.875rem;
		text-decoration: none;
		text-shadow: none;
	}
	.who a:hover span {
		text-decoration: underline;
	}
	.subnav ul {
		display: flex;
		gap: 4px 12px;
		flex-wrap: wrap;
		list-style: none;
		margin: 0;
		padding: 0 var(--page-pad);
		border-bottom: 1px solid var(--line);
	}
	.subnav a {
		display: block;
		padding: 14px 6px;
		text-decoration: none;
		color: var(--muted);
		border-bottom: 3px solid transparent;
	}
	.subnav a:hover {
		text-decoration: underline;
	}
	.subnav a[aria-current='page'] {
		color: var(--text);
		font-weight: 700;
		border-color: var(--accent);
	}
	.body {
		padding: 40px var(--page-pad) 0;
	}
</style>
