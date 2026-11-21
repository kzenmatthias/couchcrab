<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const items = $derived([
		{ href: resolve('/(site)/creator'), label: m.creator_nav_profile() },
		{ href: resolve('/(site)/creator/channels'), label: m.creator_nav_channels() },
		{ href: resolve('/(site)/creator/videos'), label: m.creator_nav_videos() }
	]);
</script>

<div class="creator" class:solo={!data.isCreator}>
	{#if data.isCreator}
		<nav aria-label={m.creator_nav_label()}>
			<ul>
				{#each items as item (item.href)}
					<li>
						<a href={item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined}>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}
	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	.creator {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		gap: 40px;
		padding: 40px var(--page-pad) 0;
	}
	.creator.solo {
		grid-template-columns: minmax(0, 1fr);
	}
	@media (max-width: 800px) {
		.creator {
			grid-template-columns: minmax(0, 1fr);
			gap: 16px;
		}
	}
	nav ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	@media (max-width: 800px) {
		nav ul {
			flex-direction: row;
			flex-wrap: wrap;
		}
	}
	nav a {
		display: block;
		padding: 10px 12px;
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--muted);
	}
	nav a:hover {
		text-decoration: underline;
	}
	nav a[aria-current] {
		background: var(--surface);
		color: var(--text);
		font-weight: 700;
	}
	.content {
		min-width: 0;
		max-width: 60rem;
	}
	/* Form styles shared by the dashboard pages (the same look as the management tool). */
	.content :global(h1) {
		font-size: clamp(1.75rem, 4vw, 2.25rem);
		margin: 8px 0 12px;
		overflow-wrap: anywhere;
	}
	.content :global(h2) {
		font-size: 1.25rem;
		margin: 32px 0 12px;
	}
	.content :global(.lead) {
		color: var(--muted);
		margin: 0 0 24px;
		max-width: 44rem;
	}
	.content :global(.field) {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 0 0 18px;
		max-width: 36rem;
	}
	.content :global(.field label),
	.content :global(legend) {
		font-weight: 700;
	}
	.content :global(.req) {
		color: var(--accent-text);
	}
	.content :global(.hint) {
		margin: 0;
		color: var(--muted);
		font-size: 0.875rem;
	}
	.content :global(.error) {
		margin: 0;
		color: var(--accent-text);
		font-weight: 700;
		font-size: 0.875rem;
	}
	.content :global(.error)::before {
		content: '! ';
	}
	.content :global(input:not([type='checkbox'], [type='radio'])),
	.content :global(select),
	.content :global(textarea) {
		background: var(--surface2);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 8px 10px;
		min-height: 44px;
		width: 100%;
		color: var(--text);
		font: inherit;
	}
	.content :global(textarea) {
		min-height: 6rem;
		resize: vertical;
	}
	.content :global([aria-invalid='true']) {
		border-color: var(--accent) !important;
		border-width: 2px !important;
	}
	.content :global(input[type='radio']) {
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
		margin: 0;
	}
	.content :global(fieldset) {
		border: 0;
		padding: 0;
		margin: 0 0 18px;
		min-width: 0;
	}
	.content :global(.actions) {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		align-items: center;
		margin: 8px 0 16px;
	}
	.content :global(button.btn) {
		font: inherit;
		font-weight: 700;
	}
	.content :global(.muted) {
		color: var(--muted);
	}
	.content :global(.tag) {
		display: inline-block;
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0 8px;
		font-size: 0.8125rem;
	}
	.content :global(.plain) {
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>
