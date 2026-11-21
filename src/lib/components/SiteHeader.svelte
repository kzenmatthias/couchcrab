<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { mainNav } from '#lib/main-nav.js';
	import { hrefPath, navCurrent } from '#lib/nav.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Theme } from '#lib/prefs/theme.js';
	import AccountMenu from './AccountMenu.svelte';
	import LogoMark from './LogoMark.svelte';

	type Props = {
		user: {
			name: string;
			avatarUrl: string | null;
			creatorId: number | null;
			role?: 'viewer' | 'editor' | 'admin';
		} | null;
		theme: Theme;
	};

	let { user, theme }: Props = $props();

	const nav = $derived(mainNav());
	const searchHref = resolve('/(site)/search');

	/** `page` on the page itself, `true` inside its section (e.g. a series under Series). */
	const current = (href: string) => navCurrent(href, page.url);

	const onSearch = $derived(hrefPath(searchHref, page.url) === page.url.pathname);
	/** On the search page the field keeps the query, so it can be refined. */
	const query = $derived(onSearch ? (page.url.searchParams.get('q') ?? '') : '');
</script>

<header class="top">
	<a class="logo" href={resolve('/(site)')} aria-label={m.logo_home()}>
		<LogoMark />
		<span>{m.site_name()}</span>
	</a>
	<span class="unofficial">{m.unofficial_label()}</span>

	<!-- Wide screens only; narrow screens get the same links in the bottom TabBar. -->
	<nav class="main-nav" aria-label={m.nav_label()}>
		<ul>
			{#each nav as item (item.href)}
				<li>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- mainNav() hrefs come from resolve() -->
					<a href={item.href} aria-current={current(item.current ?? item.href)}>
						{item.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<span class="sp"></span>

	<form class="search" role="search" method="get" action={searchHref}>
		<label class="sr-only" for="site-search">{m.search_label()}</label>
		<input
			id="site-search"
			name="q"
			type="search"
			placeholder={m.search_placeholder()}
			value={query}
		/>
	</form>

	<!-- Narrow screens: a link to the search page, where the field is focused. Works without JS. -->
	<a class="search-link" href={searchHref} aria-current={onSearch ? 'page' : undefined}>
		<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			<circle cx="10.5" cy="10.5" r="6.5" />
			<path d="m15.5 15.5 5 5" />
		</svg>
		<span class="sr-only">{m.search_open()}</span>
	</a>

	<!-- The theme lives only here, for everyone: signed out the menu has a Sign in link. -->
	<AccountMenu {user} {theme} />
</header>

<style>
	.top {
		display: flex;
		align-items: center;
		gap: 10px 22px;
		padding: 22px var(--page-pad);
		flex-wrap: wrap;
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
	.main-nav ul {
		display: flex;
		gap: 4px 16px;
		flex-wrap: wrap;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.main-nav a {
		text-decoration: none;
		color: var(--muted);
		display: inline-block;
		padding: 10px 2px;
		font-size: 0.875rem;
	}
	.main-nav a:hover {
		text-decoration: underline;
	}
	.main-nav a[aria-current] {
		color: var(--text);
		font-weight: 700;
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 6px;
	}
	.sp {
		flex: 1;
	}
	.search input {
		background: var(--surface2);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 9px 14px;
		width: 260px;
		max-width: 100%;
		font-size: 0.8125rem;
		min-height: 40px;
	}
	.search input::placeholder {
		color: var(--muted);
		opacity: 1;
	}
	.search-link {
		display: none;
	}
	/* Narrow screens: a compact top bar; the main links move to the bottom tab bar. */
	@media (max-width: 900px) {
		.top {
			padding: 10px 16px;
			gap: 8px;
		}
		.sp {
			display: none;
		}
		.logo {
			font-size: 1.0625rem;
		}
		.main-nav,
		.search {
			display: none;
		}
		.search-link {
			margin-left: auto;
			display: grid;
			place-items: center;
			width: 44px;
			height: 44px;
			border-radius: 50%;
			background: var(--surface2);
			border: 1px solid var(--line);
		}
		.search-link[aria-current] {
			border-color: var(--text);
		}
		.search-link svg {
			width: 1.25rem;
			height: 1.25rem;
			fill: none;
			stroke: currentColor;
			stroke-width: 2;
			stroke-linecap: round;
		}
	}
	/* Very narrow: the logo keeps its accessible name, the word next to it goes. */
	@media (max-width: 419px) {
		.logo span {
			display: none;
		}
	}
</style>
