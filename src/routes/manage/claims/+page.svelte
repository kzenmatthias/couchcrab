<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import ConfirmPanel from '../ui/ConfirmPanel.svelte';
	import ErrorSummary from '../ui/ErrorSummary.svelte';
	import Flash from '../ui/Flash.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = getLocale();
	const confirmClaim = $derived(
		typeof form?.confirm === 'number' ? data.claims.find((c) => c.id === form.confirm) : undefined
	);
	const self = resolve('/manage/claims');
</script>

<svelte:head>
	<title>{m.manage_claims_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.manage_claims_title()}</h1>
<p class="lead">{m.manage_claims_lead()}</p>

<Flash
	message={form?.done === 'approved'
		? m.manage_claim_approved()
		: form?.done === 'rejected'
			? m.manage_claim_rejected()
			: null}
/>
{#if confirmClaim}
	<ConfirmPanel
		title={m.manage_confirm_reject_claim({
			title: confirmClaim.channelTitle || confirmClaim.youtubeChannelId
		})}
		action="?/reject"
		confirmLabel={m.manage_claim_reject()}
		cancelHref={self}
		fields={{ claim_id: confirmClaim.id }}
	>
		<p>{m.manage_confirm_reject_claim_text({ name: confirmClaim.userName })}</p>
	</ConfirmPanel>
{/if}
{#if form?.errors && typeof form.claimId === 'number'}
	<ErrorSummary
		errors={form.errors}
		labels={{
			creator: m.manage_field_claim_creator(),
			name: m.manage_field_new_creator_name(),
			claim: m.manage_claims_title()
		}}
		targets={{ creator: `c${form.claimId}-creator`, name: `c${form.claimId}-name` }}
	/>
{/if}

{#if data.claims.length === 0}
	<p>{m.manage_no_claims()}</p>
{:else}
	<ul class="plain claims">
		{#each data.claims as c (c.id)}
			<li>
				<article aria-labelledby="c{c.id}-title">
					<h2 id="c{c.id}-title">{c.channelTitle || c.youtubeChannelId}</h2>
					<dl>
						<dt>{m.manage_claim_channel_id()}</dt>
						<dd><code>{c.youtubeChannelId}</code></dd>
						<dt>{m.manage_claim_by()}</dt>
						<dd>{c.userName}</dd>
						<dt>{m.manage_claim_date()}</dt>
						<dd>{formatDate(c.createdAt, locale)}</dd>
					</dl>
					<form method="post" action="?/approve" use:enhance>
						<input type="hidden" name="claim_id" value={c.id} />
						<div class="field">
							<label for="c{c.id}-creator">{m.manage_field_claim_creator()}</label>
							<select id="c{c.id}-creator" name="creator">
								{#if c.userCreatorId === null}
									<option value="new">{m.manage_claim_new_creator()}</option>
								{/if}
								{#each data.creators as cr (cr.id)}
									{#if c.userCreatorId === null || c.userCreatorId === cr.id}
										<option value={String(cr.id)} selected={c.userCreatorId === cr.id}>
											{cr.name}
										</option>
									{/if}
								{/each}
							</select>
						</div>
						{#if c.userCreatorId === null}
							<div class="field">
								<label for="c{c.id}-name">{m.manage_field_new_creator_name()}</label>
								<p class="hint" id="c{c.id}-name-hint">{m.manage_hint_new_creator_name()}</p>
								<input
									id="c{c.id}-name"
									name="name"
									type="text"
									maxlength="80"
									value={c.channelTitle || c.userName}
									aria-describedby="c{c.id}-name-hint"
								/>
							</div>
						{/if}
						<div class="field">
							<label for="c{c.id}-kind">{m.manage_field_kind()}</label>
							<select id="c{c.id}-kind" name="kind">
								<option value="main">{m.manage_channel_main()}</option>
								<option value="secondary">{m.manage_channel_secondary()}</option>
							</select>
						</div>
						<div class="actions">
							<button type="submit" class="btn primary">{m.manage_claim_approve()}</button>
							<button type="submit" class="btn ghost" formaction="?/askReject">
								{m.manage_claim_reject()}
							</button>
						</div>
					</form>
				</article>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.claims {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	article {
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 4px 18px;
		background: var(--surface2);
	}
	article h2 {
		font-size: 1.0625rem;
		margin: 12px 0 6px;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 4px 16px;
		margin: 0 0 14px;
	}
	dt {
		font-weight: 700;
	}
	dd {
		margin: 0;
	}
</style>
