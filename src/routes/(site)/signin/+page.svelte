<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import type { SignInError } from '#lib/server/auth/signin.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const errorText: Record<SignInError, () => string> = {
		not_configured: m.signin_error_not_configured,
		denied: m.signin_error_denied,
		state: m.signin_error_state,
		provider: m.signin_error_provider,
		linked_elsewhere: m.signin_error_linked_elsewhere,
		other_account_linked: m.signin_error_other_account_linked
	};
	const discordHref = $derived(
		`${resolve('/auth/discord')}?redirect_to=${encodeURIComponent(data.returnTo)}`
	);
</script>

<svelte:head>
	<title>{m.signin_page_title()} · {m.site_name()}</title>
</svelte:head>

<div class="page">
	<div class="card">
		<h1>{m.signin_title()}</h1>
		<p class="intro">{m.signin_intro()}</p>

		{#if data.error}
			<p class="error" role="alert">{errorText[data.error]()}</p>
		{/if}
		{#if data.signedInAs}
			<p class="note">{m.signin_signed_in({ name: data.signedInAs })}</p>
		{/if}

		<section aria-labelledby="signin-viewers">
			<h2 id="signin-viewers">{m.signin_viewers_heading()}</h2>
			<p>{m.signin_viewers_text()}</p>
			{#if data.providers.discord}
				<!-- A server route, not a page: plain link so the browser follows the OAuth redirect. -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() plus a query -->
				<a class="btn discord" href={discordHref} data-sveltekit-reload>{m.signin_discord()}</a>
			{:else}
				<button class="btn discord" type="button" disabled aria-describedby="discord-off">
					{m.signin_discord()}
				</button>
				<p class="off" id="discord-off">{m.signin_discord_unavailable()}</p>
			{/if}
		</section>

		<section aria-labelledby="signin-creators">
			<h2 id="signin-creators">{m.signin_creators_heading()}</h2>
			<p>{m.signin_creators_text()}</p>
			<details class="scope">
				<summary>{m.signin_google_details()}</summary>
				<ul>
					<li>{m.signin_google_asks()}</li>
					<li>{m.signin_google_keeps()}</li>
					<li>{m.signin_google_never()}</li>
				</ul>
			</details>
			{#if data.providers.google}
				<a class="btn google" href={resolve('/auth/google')} data-sveltekit-reload>
					{m.signin_google()}
				</a>
			{:else}
				<button class="btn google" type="button" disabled aria-describedby="google-off">
					{m.signin_google()}
				</button>
				<p class="off" id="google-off">{m.signin_google_unavailable()}</p>
			{/if}
		</section>

		<p class="close">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- same-site path checked on the server -->
			<a class="btn ghost" href={data.returnTo}>{m.signin_close()}</a>
		</p>
	</div>
</div>

<style>
	.page {
		padding: 32px var(--page-pad) 0;
		display: grid;
		justify-items: center;
	}
	.card {
		width: 100%;
		max-width: 580px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-xl);
		padding: 22px;
	}
	h1 {
		font-size: 1.375rem;
		margin: 0 0 10px;
	}
	.intro,
	section p {
		color: var(--muted);
		font-size: 0.9375rem;
	}
	.intro {
		margin: 0 0 16px;
	}
	section {
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 16px;
		margin-top: 14px;
	}
	h2 {
		font-size: 1.0625rem;
		margin: 0 0 6px;
	}
	section p {
		margin: 0 0 14px;
	}
	.error,
	.note {
		border: 1px solid var(--line);
		background: var(--surface2);
		border-radius: var(--radius);
		padding: 10px 14px;
	}
	.error {
		border-color: var(--accent-text);
		font-weight: 700;
	}
	.scope {
		margin: 0 0 14px;
		font-size: 0.875rem;
	}
	.scope summary {
		cursor: pointer;
		font-weight: 700;
		min-height: 24px;
	}
	.scope ul {
		margin: 8px 0 0;
		padding-left: 20px;
		color: var(--muted);
	}
	.scope li + li {
		margin-top: 4px;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 10px 18px;
		border-radius: var(--radius);
		font-weight: 700;
		text-decoration: none;
		border: 1px solid transparent;
		font-size: 0.9375rem;
	}
	.discord {
		background: #4752c4;
		color: #ffffff;
	}
	.google {
		background: #ffffff;
		color: #1f1f1f;
		border-color: #747775;
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	p.off {
		margin: 8px 0 0;
		font-size: 0.8125rem;
	}
	.close {
		display: flex;
		justify-content: flex-end;
		margin: 16px 0 0;
	}
	.ghost {
		background: var(--surface2);
		border-color: var(--line);
	}
	@media (forced-colors: active) {
		.btn {
			border-color: ButtonText;
		}
	}
</style>
