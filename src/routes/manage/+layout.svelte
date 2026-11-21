<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import LogoMark from '#lib/components/LogoMark.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const isAdmin = $derived(data.manager.role === 'admin');
	const sections = $derived([
		{ href: resolve('/manage'), label: m.manage_nav_dashboard() },
		{ href: resolve('/manage/review'), label: m.community_nav_review() },
		{ href: resolve('/manage/unsorted'), label: m.manage_nav_unsorted() },
		{ href: resolve('/manage/creators'), label: m.manage_nav_creators() },
		{ href: resolve('/manage/series'), label: m.manage_nav_series() },
		{ href: resolve('/manage/rules'), label: m.manage_nav_rules() },
		{ href: resolve('/manage/history'), label: m.community_nav_history() },
		...(isAdmin
			? [
					{ href: resolve('/manage/site'), label: m.manage_nav_site() },
					{ href: resolve('/manage/users'), label: m.manage_nav_users() },
					{ href: resolve('/manage/claims'), label: m.manage_nav_claims() },
					{ href: resolve('/manage/sync'), label: m.manage_nav_sync() }
				]
			: [])
	]);

	function current(href: string): 'page' | 'true' | undefined {
		const path = page.url.pathname;
		if (path === href) return 'page';
		if (href !== resolve('/manage') && path.startsWith(`${href}/`)) return 'true';
		return undefined;
	}
</script>

<a class="skip" href="#main">{m.skip_to_content()}</a>
<header class="top">
	<a class="logo" href={resolve('/(site)')} aria-label={m.logo_home()}>
		<LogoMark />
		<span>{m.site_name()}</span>
	</a>
	<span class="unofficial">{m.unofficial_label()}</span>
	<nav aria-label={m.manage_header_nav_label()}>
		<ul>
			<li>
				<a
					href={resolve('/manage')}
					aria-current={page.url.pathname.startsWith('/manage') ? 'true' : undefined}
				>
					{m.manage_link()}
				</a>
			</li>
			<li><a href={resolve('/(site)')}>{m.manage_back_to_site()}</a></li>
		</ul>
	</nav>
	<span class="sp"></span>
	<p class="who">
		{data.manager.name} · {isAdmin ? m.manage_role_admin() : m.manage_role_editor()}
	</p>
</header>

<div class="manage">
	<nav class="sections" aria-label={m.manage_nav_label()}>
		<ul>
			{#each sections as item (item.href)}
				<li><a href={item.href} aria-current={current(item.href)}>{item.label}</a></li>
			{/each}
		</ul>
	</nav>
	<main id="main" tabindex="-1">
		{@render children()}
	</main>
</div>
<SiteFooter />

<style>
	.skip {
		position: absolute;
		left: 12px;
		top: -80px;
		z-index: 10;
		background: var(--accent);
		color: var(--on-accent);
		padding: 10px 14px;
		border-radius: 8px;
		font-weight: 700;
		text-decoration: none;
	}
	.skip:focus {
		top: 12px;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 10px 22px;
		padding: 22px var(--page-pad);
		flex-wrap: wrap;
		border-bottom: 1px solid var(--line);
	}
	.logo {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 800;
		font-size: 1.25rem;
		letter-spacing: -0.02em;
		text-decoration: none;
		min-height: 44px;
	}
	.unofficial {
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--sand);
		border: 1px solid var(--sand);
		border-radius: var(--radius-sm);
		padding: 2px 6px;
		font-weight: 700;
	}
	.top ul {
		display: flex;
		gap: 4px 18px;
		list-style: none;
		margin: 0;
		padding: 0;
		flex-wrap: wrap;
	}
	.top nav a {
		display: inline-block;
		padding: 8px 0;
		color: var(--muted);
	}
	.top nav a[aria-current] {
		color: var(--text);
		font-weight: 700;
	}
	.sp {
		flex: 1;
	}
	.who {
		margin: 0;
		color: var(--muted);
		font-size: 0.875rem;
	}
	.manage {
		display: grid;
		grid-template-columns: 200px minmax(0, 1fr);
		gap: 40px;
		padding: 32px var(--page-pad) 0;
	}
	@media (max-width: 800px) {
		.manage {
			grid-template-columns: minmax(0, 1fr);
			gap: 16px;
		}
	}
	.sections ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	@media (max-width: 800px) {
		.sections ul {
			flex-direction: row;
			flex-wrap: wrap;
		}
	}
	.sections a {
		display: block;
		padding: 10px 12px;
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--muted);
	}
	.sections a:hover {
		text-decoration: underline;
	}
	.sections a[aria-current] {
		background: var(--surface);
		color: var(--text);
		font-weight: 700;
	}
	main {
		min-width: 0;
		max-width: 64rem;
	}
	main:focus {
		outline: none;
	}

	/* Shared management styles: headings, forms, tables. */
	main :global(h1) {
		font-size: clamp(1.75rem, 4vw, 2.25rem);
		margin: 0 0 8px;
	}
	main :global(h2) {
		font-size: 1.25rem;
		margin: 32px 0 12px;
	}
	main :global(.lead) {
		color: var(--muted);
		margin: 0 0 24px;
		max-width: 44rem;
	}
	main :global(.field) {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 0 0 18px;
		max-width: 36rem;
	}
	main :global(.field label),
	main :global(legend) {
		font-weight: 700;
	}
	main :global(.req) {
		color: var(--accent-text);
	}
	main :global(.hint) {
		margin: 0;
		color: var(--muted);
		font-size: 0.875rem;
	}
	main :global(.error) {
		margin: 0;
		color: var(--accent-text);
		font-weight: 700;
		font-size: 0.875rem;
	}
	main :global(.error)::before {
		content: '! ';
	}
	main :global(input:not([type='checkbox'], [type='radio'], [type='color'])),
	main :global(select),
	main :global(textarea) {
		background: var(--surface2);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 8px 10px;
		min-height: 44px;
		width: 100%;
	}
	main :global(textarea) {
		min-height: 6rem;
		resize: vertical;
	}
	main :global([aria-invalid='true']) {
		border-color: var(--accent) !important;
		border-width: 2px !important;
	}
	main :global(input[type='color']) {
		width: 88px;
		min-height: 44px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface2);
		padding: 4px;
	}
	main :global(input[type='checkbox']),
	main :global(input[type='radio']) {
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
	}
	main :global(fieldset) {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 12px 16px 4px;
		margin: 0 0 18px;
		max-width: 40rem;
	}
	main :global(.check) {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 36px;
	}
	main :global(.actions) {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		align-items: center;
		margin: 8px 0 16px;
	}
	main :global(button.btn) {
		font: inherit;
		font-weight: 700;
	}
	main :global(.table-wrap) {
		overflow-x: auto;
		margin: 0 0 24px;
	}
	main :global(table) {
		border-collapse: collapse;
		width: 100%;
		font-size: 0.9375rem;
	}
	main :global(caption) {
		text-align: left;
		font-weight: 700;
		padding: 0 0 8px;
	}
	main :global(th),
	main :global(td) {
		text-align: left;
		padding: 10px 12px 10px 0;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
	}
	main :global(thead th) {
		color: var(--muted);
		font-size: 0.8125rem;
	}
	main :global(td.num),
	main :global(th.num) {
		text-align: right;
	}
	main :global(.muted) {
		color: var(--muted);
	}
	main :global(.tag) {
		display: inline-block;
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0 8px;
		font-size: 0.8125rem;
	}
</style>
