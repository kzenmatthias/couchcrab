<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { cookieMaxAge } from '#lib/paraglide/runtime.js';
	import { THEME_COOKIE, THEMES, type Theme } from '#lib/prefs/theme.js';
	import { initials } from '#lib/video.js';

	type Props = {
		/** Null when signed out: the same disclosure, as "Menu" with a Sign in link. */
		user: {
			name: string;
			avatarUrl: string | null;
			creatorId: number | null;
			role?: 'viewer' | 'editor' | 'admin';
		} | null;
		theme: Theme;
	};

	let { user, theme }: Props = $props();

	const themeName: Record<Theme, () => string> = {
		system: m.theme_system,
		dark: m.theme_dark,
		light: m.theme_light,
		contrast: m.theme_contrast
	};

	let details: HTMLDetailsElement | undefined = $state();
	let summary: HTMLElement | undefined = $state();
	/** With JavaScript the theme applies on change; without it, the Apply button submits. */
	let enhanced = $state(false);
	let current = $derived(theme);

	const redirectTo = $derived(page.url.pathname + page.url.search);

	onMount(() => {
		enhanced = true;
		const onPointerDown = (event: PointerEvent) => {
			if (details?.open && !details.contains(event.target as Node)) details.open = false;
		};
		document.addEventListener('pointerdown', onPointerDown);
		details?.addEventListener('keydown', onKeydown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			details?.removeEventListener('keydown', onKeydown);
		};
	});

	// Close the panel after navigating to another page.
	$effect(() => {
		void page.url.pathname;
		if (details) details.open = false;
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && details?.open) {
			event.preventDefault();
			details.open = false;
			summary?.focus();
		}
	}

	function onThemeChange(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value as Theme;
		current = value;
		document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=${cookieMaxAge}; samesite=lax`;
		document.documentElement.dataset.theme = value;
	}
</script>

<details class="account" class:signed-out={!user} bind:this={details}>
	<summary bind:this={summary}>
		{#if user}
			<span class="av" aria-hidden="true">
				{#if user.avatarUrl}
					<img src={user.avatarUrl} alt="" />
				{:else}
					{initials(user.name)}
				{/if}
			</span>
			<span class="sr-only">{m.account_menu_button({ name: user.name })}</span>
		{:else}
			<span class="menu">{m.account_menu_signed_out()}</span>
		{/if}
	</summary>

	<div class="panel">
		{#if user}
			<p class="who">{m.account_signed_in_as({ name: user.name })}</p>
		{:else}
			<p class="who">{m.account_signed_out_note()}</p>
		{/if}

		<form method="post" action={resolve('/prefs')}>
			<input type="hidden" name="redirect_to" value={redirectTo} />
			<fieldset>
				<legend>{m.account_theme()}</legend>
				<div class="themes">
					{#each THEMES as t (t)}
						<label class="theme">
							<input
								type="radio"
								name="theme"
								value={t}
								checked={t === current}
								onchange={onThemeChange}
							/>
							{themeName[t]()}
						</label>
					{/each}
				</div>
			</fieldset>
			{#if !enhanced}
				<button type="submit" class="apply">{m.account_theme_apply()}</button>
			{/if}
		</form>

		<ul class="links">
			<!-- Narrow screens: the bottom tab bar has no room for Community, so it is here. -->
			<li class="narrow-only">
				<a href={resolve('/(site)/community')}>{m.nav_community()}</a>
			</li>
			<li><a href={resolve('/(site)/settings/creators')}>{m.account_who_i_watch()}</a></li>
			<li><a href={resolve('/(site)/settings/display')}>{m.account_display()}</a></li>
			{#if user}
				<li><a href={resolve('/(site)/me/suggestions')}>{m.community_my_link()}</a></li>
			{/if}
			{#if user && user.creatorId !== null}
				<li><a href={resolve('/(site)/creator')}>{m.account_creator_dashboard()}</a></li>
			{/if}
			{#if user && (user.role === 'editor' || user.role === 'admin')}
				<li><a href={resolve('/manage')}>{m.account_manage()}</a></li>
			{/if}
		</ul>

		{#if user}
			<form method="post" action={resolve('/auth/signout')} class="signout">
				<input type="hidden" name="redirect_to" value={redirectTo} />
				<button type="submit">{m.account_sign_out()}</button>
			</form>
		{:else}
			<p class="signout">
				<a class="signin" href={resolve('/(site)/signin')}>{m.account_sign_in()}</a>
			</p>
		{/if}
	</div>
</details>

<style>
	.account {
		position: relative;
	}
	summary {
		list-style: none;
		cursor: pointer;
		border-radius: 50%;
		display: grid;
		place-items: center;
		width: fit-content;
		min-width: 44px;
		min-height: 44px;
	}
	.signed-out summary {
		border-radius: 999px;
	}
	.menu {
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		padding: 6px 14px;
		border-radius: 999px;
		background: var(--surface2);
		border: 1px solid var(--line);
		font-size: 0.8125rem;
		font-weight: 700;
	}
	[open] .menu {
		border-color: var(--text);
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.av {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--on-accent);
		border: 2px solid var(--line);
		display: grid;
		place-items: center;
		overflow: hidden;
		font-weight: 800;
		font-size: 0.875rem;
	}
	.av img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	[open] .av {
		border-color: var(--text);
	}
	.panel {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		z-index: 20;
		width: min(300px, calc(100vw - 2 * var(--page-pad)));
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 14px;
		box-shadow: 0 12px 32px #0006;
	}
	.who {
		margin: 0 0 10px;
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
	}
	legend {
		font-size: 0.8125rem;
		color: var(--muted);
		padding: 0;
		margin-bottom: 6px;
	}
	.themes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 6px;
	}
	.theme {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		padding: 6px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		font-size: 0.8125rem;
		cursor: pointer;
	}
	.theme:has(input:checked) {
		border-color: var(--text);
		font-weight: 700;
	}
	.theme input {
		accent-color: var(--accent);
		margin: 0;
	}
	.apply,
	.signout button {
		margin-top: 8px;
		min-height: 40px;
		padding: 6px 12px;
		background: var(--surface2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		font-weight: 700;
	}
	.links {
		list-style: none;
		margin: 12px 0 0;
		padding: 10px 0 0;
		border-top: 1px solid var(--line);
	}
	.links a {
		display: block;
		padding: 10px 8px;
		border-radius: var(--radius-sm);
		text-decoration: none;
	}
	.links a:hover {
		background: var(--surface2);
		text-decoration: underline;
	}
	.signout {
		margin-top: 10px;
		padding-top: 6px;
		border-top: 1px solid var(--line);
	}
	.signout button {
		width: 100%;
		text-align: left;
	}
	.signin {
		display: block;
		margin-top: 8px;
		min-height: 40px;
		padding: 8px 12px;
		background: var(--surface2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		font-weight: 700;
		text-decoration: none;
	}
	.signin:hover {
		text-decoration: underline;
	}
	p.signout {
		margin-bottom: 0;
	}
	.narrow-only {
		display: none;
	}
	@media (max-width: 900px) {
		.narrow-only {
			display: list-item;
		}
	}
	/* On narrow screens the panel opens in the flow, full width, so it never leaves the screen. */
	@media (max-width: 640px) {
		.account[open] {
			flex: 1 1 100%;
		}
		.panel {
			position: static;
			width: auto;
			margin-top: 8px;
		}
	}
</style>
