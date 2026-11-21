<script lang="ts">
	import { page } from '$app/state';
	import { mainNav, type MainNavItem, type NavIcon } from '#lib/main-nav.js';
	import { navCurrent } from '#lib/nav.js';
	import { m } from '#lib/paraglide/messages.js';

	const tabs = $derived(
		mainNav().filter((item): item is MainNavItem & { icon: NavIcon } => item.icon !== undefined)
	);

	/** Simple line icons; decorative, the label under each icon is the link text. */
	const paths: Record<NavIcon, string> = {
		home: 'M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z',
		series: 'm12 3.5 9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
		creators: 'M12 12a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5zM4 21a8 8 0 0 1 16 0',
		who: 'm4.5 12.5 5 5L19.5 7'
	};
</script>

<!--
	The main navigation on narrow screens (the header links are hidden there). It is sticky at
	the bottom of the page shell and comes last in the layout, so at the end of the page it sits
	below the footer and never covers it. Hidden (display: none) on wide screens.
-->
<nav class="tabbar" aria-label={m.nav_tabbar_label()}>
	<ul>
		{#each tabs as item (item.href)}
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- mainNav() hrefs come from resolve() -->
				<a href={item.href} aria-current={navCurrent(item.current ?? item.href, page.url)}>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path d={paths[item.icon]} />
					</svg>
					<span>{item.label}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.tabbar {
		display: none;
	}
	@media (max-width: 900px) {
		.tabbar {
			display: block;
			position: sticky;
			bottom: 0;
			z-index: 10;
			/* Last in the flex shell of the site layout, after the footer. */
			order: 1;
			background: var(--surface);
			border-top: 1px solid var(--line);
			padding: 2px max(4px, env(safe-area-inset-right, 0px))
				calc(4px + env(safe-area-inset-bottom, 0px)) max(4px, env(safe-area-inset-left, 0px));
		}
		/* Focused or scrolled-to elements stay above the bar. */
		:global(html) {
			scroll-padding-bottom: 5rem;
		}
	}
	ul {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		list-style: none;
		margin: 0;
		padding: 0;
	}
	a {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: 52px;
		height: 100%;
		padding: 6px 2px;
		font-size: 0.75rem;
		line-height: 1.2;
		text-align: center;
		color: var(--muted);
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	a:hover span {
		text-decoration: underline;
	}
	/* Not colour alone: the current tab is bold and has a bar above it. */
	a[aria-current] {
		color: var(--accent-text);
		font-weight: 700;
	}
	a[aria-current]::before {
		content: '';
		position: absolute;
		top: 0;
		left: 25%;
		right: 25%;
		height: 3px;
		border-radius: 0 0 3px 3px;
		background: currentColor;
	}
	svg {
		width: 1.375rem;
		height: 1.375rem;
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
