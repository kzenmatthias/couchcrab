<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import ConfirmPanel from '../../ui/ConfirmPanel.svelte';
	import ErrorSummary from '../../ui/ErrorSummary.svelte';
	import Field from '../../ui/Field.svelte';
	import Flash from '../../ui/Flash.svelte';
	import CreatorForm from '../CreatorForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = getLocale();

	const c = $derived(data.creator);
	const isAdmin = $derived(data.manager.role === 'admin');
	const locked = $derived(Boolean(c.claimedAt) && !data.canEditClaimed);
	const self = $derived(resolve('/manage/creators/[id]', { id: String(c.id) }));

	const values = $derived(
		form?.action === 'save' && form.values
			? form.values
			: {
					name: c.name,
					slug: c.slug,
					color: c.color,
					avatar_url: c.avatarUrl ?? '',
					bio: c.bio ?? '',
					opted_out: c.optedOut
				}
	);

	const flash = $derived(
		form?.saved === 'creator' || (data.saved && !form)
			? m.manage_saved()
			: form?.saved === 'channel_added'
				? m.manage_channel_added()
				: form?.saved === 'channel'
					? m.manage_saved()
					: form?.saved === 'channel_deleted'
						? m.manage_channel_deleted()
						: form?.saved === 'channel_restored'
							? m.manage_channel_restored()
							: null
	);

	const channelLabels = $derived({ channel: m.manage_field_channel() });
	const deleteErrors = $derived(
		form?.action === 'delete' ||
			form?.action === 'deleteChannel' ||
			form?.action === 'updateChannel'
			? form.errors
			: null
	);
	const confirmChannel = $derived(
		form?.confirm === 'channel' ? data.channels.find((ch) => ch.id === form.channelId) : undefined
	);
</script>

<svelte:head>
	<title>{c.name} · {m.manage_creators_title()} · {m.site_name()}</title>
</svelte:head>

<p><a href={resolve('/manage/creators')}>{m.manage_back_creators()}</a></p>
<h1>{c.name}</h1>
<p class="lead">
	{#if c.claimedAt}
		{m.manage_creator_claimed_by({
			name: data.claimedBy?.name ?? m.manage_unknown(),
			date: formatDate(c.claimedAt, locale)
		})}
	{:else}
		{m.manage_creator_not_claimed()}
	{/if}
	<a href={resolve('/(site)/creators/[slug]', { slug: c.slug })}>{m.manage_view_on_site()}</a>
</p>
{#if data.lastCreatorEdit}
	<p class="creator-edit">
		{m.manage_creator_self_edited({ date: formatDate(data.lastCreatorEdit, locale) })}
	</p>
{/if}

<Flash message={flash} />

{#if form?.confirm === 'creator'}
	<ConfirmPanel
		title={m.manage_confirm_delete_creator({ name: c.name })}
		action="?/delete"
		confirmLabel={m.manage_delete()}
		cancelHref={self}
	>
		<p>{m.manage_confirm_delete_creator_text()}</p>
	</ConfirmPanel>
{/if}
{#if confirmChannel}
	<ConfirmPanel
		title={m.manage_confirm_delete_channel({ title: confirmChannel.title })}
		action="?/deleteChannel"
		confirmLabel={m.manage_delete()}
		cancelHref={self}
		fields={{ channel_id: confirmChannel.id }}
	/>
{/if}
<ErrorSummary
	errors={deleteErrors}
	labels={{
		creator: c.name,
		channel: m.manage_field_channel(),
		title: m.manage_field_channel_title(),
		kind: m.manage_field_kind()
	}}
/>

<h2>{m.manage_profile()}</h2>
<CreatorForm
	{values}
	errors={form?.action === 'save' ? form.errors : null}
	{isAdmin}
	{locked}
	isNew={false}
	submitLabel={m.manage_save()}
/>

<h2 id="channels-title">{m.manage_channels_title()}</h2>
{#if data.channels.length === 0}
	<p>{m.manage_no_channels()}</p>
{:else}
	<ul class="channels plain" aria-labelledby="channels-title">
		{#each data.channels as ch (ch.id)}
			<li>
				<form method="post" action="?/updateChannel" use:enhance>
					<input type="hidden" name="channel_id" value={ch.id} />
					<fieldset>
						<legend>{ch.title} <code>{ch.youtubeChannelId}</code></legend>
						{#if ch.verifiedAt}<p class="hint">{m.manage_channel_verified()}</p>{/if}
						{#if ch.unlinkedAt}
							<p class="hint">
								{m.manage_channel_unlinked({ date: formatDate(ch.unlinkedAt, locale) })}
							</p>
						{/if}
						<div class="field">
							<label for="ch-{ch.id}-title">{m.manage_field_channel_title()}</label>
							<input
								id="ch-{ch.id}-title"
								name="title"
								type="text"
								maxlength="120"
								value={ch.title}
							/>
						</div>
						<div class="field">
							<label for="ch-{ch.id}-kind">{m.manage_field_kind()}</label>
							<select id="ch-{ch.id}-kind" name="kind">
								<option value="main" selected={ch.kind === 'main'}>
									{m.manage_channel_main()}
								</option>
								<option value="secondary" selected={ch.kind === 'secondary'}>
									{m.manage_channel_secondary()}
								</option>
							</select>
						</div>
						<div class="check">
							<input
								id="ch-{ch.id}-sync"
								type="checkbox"
								name="sync_enabled"
								value="1"
								checked={ch.syncEnabled}
								disabled={!!ch.unlinkedAt}
								aria-describedby={ch.unlinkedAt ? `ch-${ch.id}-sync-hint` : undefined}
							/>
							<label for="ch-{ch.id}-sync">{m.manage_field_sync()}</label>
						</div>
						{#if ch.unlinkedAt}
							<p class="hint" id="ch-{ch.id}-sync-hint">{m.manage_channel_sync_unlinked_hint()}</p>
						{/if}
						<div class="actions">
							<button type="submit" class="btn primary">{m.manage_save_channel()}</button>
							{#if ch.unlinkedAt && isAdmin}
								<button type="submit" class="btn ghost" formaction="?/restoreChannel">
									{m.manage_restore_channel()}
								</button>
							{/if}
							<button type="submit" class="btn ghost" formaction="?/askDeleteChannel">
								{m.manage_delete_channel()}
							</button>
						</div>
					</fieldset>
				</form>
			</li>
		{/each}
	</ul>
{/if}

<h3>{m.manage_add_channel()}</h3>
{#if form?.lookup}
	<form method="post" action="?/addChannel" use:enhance class="found">
		<input type="hidden" name="youtube_channel_id" value={form.lookup.youtubeChannelId} />
		<p role="status">
			{#if form.lookup.checked}
				{m.manage_channel_found({ title: form.lookup.title, id: form.lookup.youtubeChannelId })}
			{:else}
				{m.manage_channel_unchecked({ id: form.lookup.youtubeChannelId })}
			{/if}
		</p>
		<div class="field">
			<label for="new-ch-title">{m.manage_field_channel_title()}</label>
			<input
				id="new-ch-title"
				name="title"
				type="text"
				maxlength="120"
				value={form.lookup.title || c.name}
			/>
		</div>
		<div class="field">
			<label for="new-ch-kind">{m.manage_field_kind()}</label>
			<select id="new-ch-kind" name="kind">
				<option value="main">{m.manage_channel_main()}</option>
				<option value="secondary">{m.manage_channel_secondary()}</option>
			</select>
		</div>
		<div class="check">
			<input id="new-ch-sync" type="checkbox" name="sync_enabled" value="1" checked />
			<label for="new-ch-sync">{m.manage_field_sync()}</label>
		</div>
		<div class="actions">
			<button type="submit" class="btn primary">{m.manage_add_channel_confirm()}</button>
			<a class="btn ghost" href={self}>{m.manage_cancel()}</a>
		</div>
	</form>
{:else}
	{@const errs = form?.action === 'lookup' || form?.action === 'addChannel' ? form.errors : null}
	<ErrorSummary errors={errs} labels={channelLabels} />
	<form
		method="post"
		action="?/lookup"
		use:enhance={() =>
			({ update }) =>
				update({ reset: false })}
	>
		<Field
			name="channel"
			label={channelLabels.channel}
			hint={data.hasApiKey ? m.manage_hint_channel() : m.manage_hint_channel_no_key()}
			errors={errs}
			required
		>
			{#snippet children(a)}
				<input
					{...a}
					type="text"
					required
					autocomplete="off"
					spellcheck="false"
					value={typeof form?.values?.channel === 'string' ? form.values.channel : ''}
				/>
			{/snippet}
		</Field>
		<div class="actions">
			<button type="submit" class="btn ghost">{m.manage_look_up_channel()}</button>
		</div>
	</form>
{/if}

<h2>{m.manage_delete_creator_title()}</h2>
{#if data.videos > 0}
	<p>{m.manage_delete_creator_blocked({ count: data.videos })}</p>
{:else if c.claimedAt && !isAdmin}
	<p>{m.manage_delete_creator_claimed()}</p>
{:else}
	<form method="post" action="?/askDelete" use:enhance>
		<button type="submit" class="btn ghost">{m.manage_delete_creator()}</button>
	</form>
{/if}

<style>
	.channels li fieldset {
		max-width: 40rem;
	}
	legend code {
		font-weight: 400;
		font-size: 0.8125rem;
	}
	.found {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 4px 16px;
		max-width: 40rem;
	}
</style>
