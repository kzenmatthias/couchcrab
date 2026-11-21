<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import ArtHeader from '#lib/components/ArtHeader.svelte';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import PovBar from '#lib/components/PovBar.svelte';
	import SeriesMeta from '#lib/components/SeriesMeta.svelte';
	import Switch from '#lib/components/Switch.svelte';
	import { getViewing } from '#lib/prefs/store.svelte.js';
	import { kindLabel } from '#lib/labels.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const s = $derived(data.series);
	const viewing = getViewing();
	/** An Extras series follows the POV list and options of its parent. */
	const pov = $derived(s.parent ? null : { id: s.id, slug: s.slug });

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
		{
			href: resolve('/(site)/series/[slug]/about', { slug: s.slug }),
			label: m.community_series_tab_about()
		}
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

{#if pov}
	<PovBar series={pov} creators={data.creators} />
{/if}

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

{#snippet suggestBox()}
	<section class="box" aria-labelledby="wrong-h">
		<h2 id="wrong-h">{m.community_something_wrong_heading()}</h2>
		<p>{m.community_something_wrong_text()}</p>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() plus a query -->
		<a class="btn ghost" href="{resolve('/(site)/suggest')}?series={encodeURIComponent(s.slug)}">
			{m.community_suggest_link()}
		</a>
	</section>
{/snippet}

<div class="body" class:with-options={pov}>
	<div class="content">
		{@render children()}
		{#if !pov}{@render suggestBox()}{/if}
	</div>
	{#if pov}
		<aside class="options" aria-labelledby="options-h">
			<h2 id="options-h">{m.series_options_heading()}</h2>
			<Switch
				id="opt-spoiler"
				label={m.setting_spoiler_free()}
				description={m.setting_spoiler_free_help()}
				checked={viewing.spoilerFree(pov.id)}
				onchange={(on: boolean) => viewing.setSpoilerFree(pov.id, on)}
			/>
			<Switch
				id="opt-captions"
				label={m.setting_creator_captions_only()}
				description={m.setting_creator_captions_only_series_help()}
				checked={viewing.creatorCaptionsOnly(pov.id)}
				onchange={(on: boolean) => viewing.setCreatorCaptionsOnly(pov.id, on)}
			/>
			<p class="more">
				<a href={resolve('/(site)/settings/display')}>{m.series_options_more()}</a>
			</p>
			{@render suggestBox()}
		</aside>
	{/if}
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
	.body.with-options {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		gap: 40px;
		align-items: start;
	}
	@media (max-width: 1000px) {
		.body.with-options {
			grid-template-columns: minmax(0, 1fr);
		}
		.options {
			grid-row: 1;
		}
	}
	.options h2 {
		font-size: 1.125rem;
		margin: 0 0 4px;
	}
	.more {
		font-size: 0.875rem;
	}
	.box {
		margin-top: 28px;
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--surface);
		padding: 14px 18px;
	}
	.box h2 {
		font-size: 1.125rem;
		margin: 0 0 4px;
	}
	.box p {
		margin: 0 0 12px;
		color: var(--muted);
	}
</style>
