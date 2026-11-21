<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { youtubeChannelUrl } from '#lib/video.js';
	import ConfirmPanel from '../../../manage/ui/ConfirmPanel.svelte';
	import ErrorSummary from '../../../manage/ui/ErrorSummary.svelte';
	import Flash from '../../../manage/ui/Flash.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = getLocale();
	const self = $derived(resolve('/(site)/creator/channels'));

	const confirmChannel = $derived(
		form?.confirm === 'unlink' ? data.channels.find((ch) => ch.id === form.channelId) : undefined
	);
	const errors = $derived(form && 'errors' in form ? form.errors : null);
</script>

<svelte:head>
	<title>{m.creator_channels_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.creator_channels_title()}</h1>
<p class="lead">{m.creator_channels_lead()}</p>

<Flash
	message={form?.saved === 'unlinked'
		? m.creator_channel_unlinked()
		: form?.saved === 'relinked'
			? m.creator_channel_relinked()
			: null}
/>
<ErrorSummary
	{errors}
	labels={{ channel: m.manage_field_channel() }}
	targets={{ channel: 'channels-h' }}
/>

{#if confirmChannel}
	<ConfirmPanel
		title={m.creator_unlink_confirm_title({ title: confirmChannel.title })}
		action="?/unlink"
		confirmLabel={m.creator_unlink_confirm()}
		cancelHref={self}
		fields={{ channel_id: confirmChannel.id }}
	>
		<p>{m.creator_unlink_confirm_body({ count: confirmChannel.videos })}</p>
	</ConfirmPanel>
{/if}

<h2 id="channels-h" tabindex="-1">{m.creator_channels_heading()}</h2>
<ul class="channels plain">
	{#each data.channels as ch (ch.id)}
		<li>
			<div class="nm">
				<a href={youtubeChannelUrl(ch.youtubeChannelId)} rel="external noopener">
					{ch.title}<span class="sr-only"> {m.opens_youtube()}</span>
				</a>
				<span class="muted">
					{ch.kind === 'main' ? m.creator_channel_main() : m.creator_channel_secondary()}
					·
					{ch.lastSyncedAt
						? m.creator_channel_synced({
								date: formatDate(ch.lastSyncedAt, locale, { dateStyle: 'medium' })
							})
						: m.creator_channel_not_synced()}
					· {m.creator_channel_videos({ count: ch.videos })}
				</span>
			</div>
			{#if ch.unlinkedAt}
				<span class="status review">{m.creator_status_unlinked()}</span>
			{:else if ch.verified}
				<span class="status ok">
					<span aria-hidden="true">✓</span>
					{m.creator_status_verified()}
				</span>
			{:else}
				<span class="status review">{m.creator_status_needs_review()}</span>
			{/if}
			{#if ch.unlinkedAt}
				<form method="post" action="?/relink" use:enhance>
					<input type="hidden" name="channel_id" value={ch.id} />
					<button type="submit" class="btn ghost">
						{m.creator_relink_button()}<span class="sr-only">: {ch.title}</span>
					</button>
				</form>
			{:else if ch.kind === 'secondary'}
				<form method="post" action="?/askUnlink" use:enhance>
					<input type="hidden" name="channel_id" value={ch.id} />
					<button type="submit" class="btn ghost">
						{m.creator_unlink_button()}<span class="sr-only">: {ch.title}</span>
					</button>
				</form>
			{/if}
		</li>
	{/each}
	{#each data.pending as p (p.id)}
		<li>
			<div class="nm">
				<span class="title">{p.youtubeChannelId}</span>
				<span class="muted">{m.creator_channel_requested()}</span>
			</div>
			<span class="status review">{m.creator_status_needs_review()}</span>
		</li>
	{/each}
</ul>

<section aria-labelledby="add-h">
	<h2 id="add-h">{m.creator_add_channel_title()}</h2>
	<p>{m.creator_add_channel_body()}</p>
	<!-- A server route (Google OAuth), not a page: a full page load. -->
	<a class="btn ghost" href={resolve('/auth/google')} data-sveltekit-reload>
		{m.creator_add_channel_button()}
	</a>
</section>

<style>
	.channels {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 44rem;
	}
	.channels li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 14px 18px;
	}
	.nm {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1 1 14rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.nm a,
	.title {
		font-weight: 700;
	}
	.status {
		display: inline-flex;
		gap: 4px;
		border: 1px solid currentColor;
		border-radius: 999px;
		padding: 1px 10px;
		font-size: 0.8125rem;
		font-weight: 700;
	}
	.status.ok {
		color: var(--sea-text);
	}
	.status.review {
		color: var(--sand);
	}
	form {
		margin: 0;
	}
</style>
