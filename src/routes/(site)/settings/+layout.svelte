<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const items = $derived([
		{ href: resolve('/(site)/settings/creators'), label: m.settings_nav_creators() },
		{ href: resolve('/(site)/settings/display'), label: m.settings_nav_display() }
	]);

	function current(href: string): 'page' | 'true' | undefined {
		const path = page.url.pathname;
		if (path === href) return 'page';
		return path.startsWith(`${href}/`) ? 'true' : undefined;
	}
</script>

<div class="settings">
	<nav aria-label={m.settings_nav_label()}>
		<ul>
			{#each items as item (item.href)}
				<li><a href={item.href} aria-current={current(item.href)}>{item.label}</a></li>
			{/each}
		</ul>
		<p class="local">{m.settings_saved_locally()}</p>
	</nav>
	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	.settings {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		gap: 40px;
		padding: 40px var(--page-pad) 0;
	}
	@media (max-width: 800px) {
		.settings {
			grid-template-columns: minmax(0, 1fr);
			gap: 16px;
		}
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	@media (max-width: 800px) {
		ul {
			flex-direction: row;
			flex-wrap: wrap;
		}
	}
	a {
		display: block;
		padding: 10px 12px;
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--muted);
	}
	a:hover {
		text-decoration: underline;
	}
	a[aria-current] {
		background: var(--surface);
		color: var(--text);
		font-weight: 700;
	}
	.local {
		font-size: 0.8125rem;
		color: var(--muted);
		margin: 16px 12px 0;
	}
	.content {
		min-width: 0;
		max-width: 60rem;
	}
	.content :global(h1) {
		font-size: clamp(1.75rem, 4vw, 2.25rem);
		margin: 0 0 8px;
	}
</style>
