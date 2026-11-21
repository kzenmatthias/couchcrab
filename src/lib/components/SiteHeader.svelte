<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import LogoMark from './LogoMark.svelte';

	const nav = $derived([
		{ href: resolve('/(site)'), label: m.nav_home() },
		{ href: resolve('/(site)/[page]', { page: 'series' }), label: m.nav_series() },
		{ href: resolve('/(site)/[page]', { page: 'creators' }), label: m.nav_creators() },
		{ href: resolve('/(site)/[page]', { page: 'who-i-watch' }), label: m.nav_who_i_watch() },
		{ href: resolve('/(site)/[page]', { page: 'community' }), label: m.nav_community() }
	]);
</script>

<header class="top">
	<a class="logo" href={resolve('/(site)')} aria-label={m.logo_home()}>
		<LogoMark />
		<span>{m.site_name()}</span>
	</a>
	<span class="unofficial">{m.unofficial_label()}</span>

	<nav aria-label={m.nav_label()}>
		<ul>
			{#each nav as item (item.href)}
				<li>
					<a href={item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined}>
						{item.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<span class="sp"></span>

	<form
		class="search"
		role="search"
		method="get"
		action={resolve('/(site)/[page]', { page: 'search' })}
	>
		<label class="sr-only" for="site-search">{m.search_label()}</label>
		<input id="site-search" name="q" type="search" placeholder={m.search_placeholder()} />
	</form>

	<!-- Placeholder: Discord sign-in arrives in a later round. -->
	<button type="button" class="account">{m.account_sign_in()}</button>
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
	nav ul {
		display: flex;
		gap: 4px 16px;
		flex-wrap: wrap;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	nav a {
		text-decoration: none;
		color: var(--muted);
		display: inline-block;
		padding: 10px 2px;
		font-size: 0.875rem;
	}
	nav a:hover {
		text-decoration: underline;
	}
	nav a[aria-current='page'] {
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
	.account {
		min-height: 40px;
		padding: 6px 14px;
		border-radius: 999px;
		background: var(--surface2);
		border: 1px solid var(--line);
		font-size: 0.8125rem;
		font-weight: 700;
	}
	@media (max-width: 900px) {
		.search {
			flex: 1 1 100%;
		}
		.search input {
			width: 100%;
		}
	}
</style>
