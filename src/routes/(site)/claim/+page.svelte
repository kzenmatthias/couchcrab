<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import type { ChannelStatus } from '#lib/server/auth/claims.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let message: HTMLElement | undefined = $state();

	const statusText: Record<ChannelStatus, () => string> = {
		claimable: m.claim_status_claimable,
		verified: m.claim_status_verified,
		claimed_by_other: m.claim_status_claimed_by_other,
		has_other_profile: m.claim_status_has_other_profile,
		needs_review: m.claim_status_needs_review
	};

	function description(status: ChannelStatus, name: string): string {
		switch (status) {
			case 'claimable':
				return m.claim_desc_claimable({ name });
			case 'verified':
				return m.claim_desc_verified({ name });
			case 'claimed_by_other':
				return m.claim_desc_claimed_by_other({ name });
			case 'has_other_profile':
				return m.claim_desc_has_other_profile({ name });
			case 'needs_review':
				return m.claim_desc_needs_review();
		}
	}

	/** After a claim (with JavaScript), move focus to the result so it is read out. */
	const claimEnhance: Parameters<typeof enhance>[1] = () => {
		return async ({ update }) => {
			await update({ reset: false });
			await tick();
			message?.focus();
		};
	};
</script>

<svelte:head>
	<title>{m.claim_title()} · {m.site_name()}</title>
</svelte:head>

<div class="page">
	<h1>{m.claim_title()}</h1>

	{#if form?.claimed}
		<p class="msg ok" tabindex="-1" bind:this={message}>
			{m.claim_success({ name: form.claimed })}
			{#if data.claimedCreator && !data.claimedCreator.optedOut}
				<a href={resolve('/(site)/creators/[slug]', { slug: data.claimedCreator.slug })}>
					{m.claim_view_profile()}
				</a>
			{/if}
		</p>
	{:else if form?.error}
		<p class="msg err" tabindex="-1" bind:this={message} role="alert">
			{form.error === 'expired' ? m.claim_error_expired() : m.claim_error_not_claimable()}
		</p>
	{/if}

	{#if data.check}
		<p class="intro">{m.claim_intro({ count: data.check.channels.length })}</p>

		{#if data.check.channels.length === 0}
			<p>{m.claim_none()}</p>
		{:else}
			<ul class="channels" aria-label={m.claim_channels_label()}>
				{#each data.check.channels as c (c.youtubeChannelId)}
					<li class="channel">
						<CreatorAvatar name={c.title} color={c.creator?.color ?? '#7fd8cf'} size={40} />
						<div class="text">
							<span class="title">{c.title}</span>
							<span class="desc">{description(c.status, c.creator?.name ?? c.title)}</span>
						</div>
						<span class="badge {c.status}">
							{#if c.status === 'verified'}<span aria-hidden="true">✓</span>{/if}
							{statusText[c.status]()}
						</span>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="actions">
			{#if data.check.claimable.length === 1}
				{@const only = data.check.claimable[0]}
				<form method="post" action="?/claim" use:enhance={claimEnhance}>
					<input type="hidden" name="creator_id" value={only.id} />
					<button class="primary" type="submit">{m.claim_button({ name: only.name })}</button>
				</form>
			{:else if data.check.claimable.length > 1}
				<form method="post" action="?/claim" class="pick" use:enhance={claimEnhance}>
					<fieldset>
						<legend>{m.claim_pick_legend()}</legend>
						{#each data.check.claimable as c, i (c.id)}
							<label>
								<input type="radio" name="creator_id" value={c.id} checked={i === 0} />
								{c.name}
							</label>
						{/each}
					</fieldset>
					<button class="primary" type="submit">{m.claim_pick_button()}</button>
				</form>
			{/if}
			<form method="post" action="?/notme">
				<button class="secondary" type="submit">{m.claim_not_me()}</button>
			</form>
		</div>
		{#if data.check.claimable.length > 0}
			<p class="after">{m.claim_after()}</p>
		{/if}
	{:else}
		{#if data.claimedCreator && !form?.claimed}
			<p class="intro">{m.claim_claimed_already({ name: data.claimedCreator.name })}</p>
		{/if}
		<p class="intro">{m.claim_no_check()}</p>
		<p><a class="secondary" href={resolve('/(site)/signin')}>{m.signin_google()}</a></p>
	{/if}
</div>

<style>
	.page {
		padding: 32px var(--page-pad) 0;
		max-width: calc(700px + 2 * var(--page-pad));
		margin: 0 auto;
	}
	h1 {
		font-size: 2.5rem;
		letter-spacing: -0.02em;
		line-height: 1.1;
		margin: 0 0 20px;
	}
	.intro {
		color: var(--muted);
		font-size: 1.0625rem;
	}
	.msg {
		border: 1px solid var(--line);
		background: var(--surface2);
		border-radius: var(--radius);
		padding: 12px 16px;
		font-weight: 700;
	}
	.msg.ok {
		border-color: var(--sea-text);
	}
	.msg.err {
		border-color: var(--accent-text);
	}
	.channels {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 14px;
	}
	.channel {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 18px;
		background: var(--surface2);
	}
	.text {
		flex: 1 1 200px;
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.title {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.desc {
		color: var(--muted);
		font-size: 0.9375rem;
	}
	.badge {
		border: 1px solid currentColor;
		border-radius: 999px;
		padding: 2px 10px;
		font-size: 0.8125rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.badge.verified,
	.badge.claimable {
		color: var(--sea-text);
	}
	.badge.needs_review {
		color: var(--sand);
	}
	.badge.claimed_by_other,
	.badge.has_other_profile {
		color: var(--muted);
	}
	.actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: flex-end;
		margin-top: 20px;
	}
	.pick {
		display: grid;
		gap: 10px;
	}
	fieldset {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 10px 14px;
		margin: 0;
	}
	fieldset label {
		display: flex;
		gap: 8px;
		align-items: center;
		min-height: 36px;
	}
	.primary,
	.secondary {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 10px 18px;
		border-radius: var(--radius);
		font-weight: 700;
		text-decoration: none;
		border: 1px solid var(--line);
	}
	.primary {
		background: var(--accent);
		color: var(--on-accent);
		border-color: var(--accent);
	}
	.secondary {
		background: var(--surface2);
	}
	.after {
		color: var(--muted);
		font-size: 0.875rem;
	}
</style>
