<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { communityError, errorId, fieldId } from '#lib/community/errors.js';
	import ErrorSummary from '#lib/components/community/ErrorSummary.svelte';
	import FormStyles from '#lib/components/community/FormStyles.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const values = $derived((form && 'values' in form ? form.values : {}) as Record<string, unknown>);
	const errors = $derived(
		(form && 'errors' in form ? form.errors : null) as Record<string, string> | null
	);
	const v = (name: string) => {
		const value = values[name];
		return typeof value === 'string' ? value : '';
	};
	const attrs = (name: string, hint = false) => ({
		id: fieldId(name),
		name,
		'aria-invalid': errors?.[name] ? ('true' as const) : undefined,
		'aria-describedby':
			[hint ? `${fieldId(name)}-hint` : null, errors?.[name] ? errorId(name) : null]
				.filter(Boolean)
				.join(' ') || undefined
	});
	const labels = {
		form: '',
		request: m.community_request_legend(),
		creator_id: m.community_request_creator(),
		name: m.community_request_name(),
		channel: m.community_request_channel(),
		details: m.community_request_details(),
		contact_email: m.community_request_email()
	};
	const sent = $derived(Boolean(form && 'sent' in form && form.sent));
	let thanks = $state<HTMLElement>();
	$effect(() => {
		if (sent) void tick().then(() => thanks?.focus());
	});
	const signinHref = `${resolve('/(site)/signin')}?redirect_to=${encodeURIComponent('/creator-requests')}`;
</script>

<svelte:head>
	<title>{m.community_requests_title()} · {m.site_name()}</title>
</svelte:head>

{#snippet fieldError(name: string)}
	{#if errors?.[name]}<p class="error" id={errorId(name)}>{communityError(errors[name])}</p>{/if}
{/snippet}

<div class="page">
	<FormStyles>
		<h1>{m.community_requests_title()}</h1>
		<p class="lead">{m.community_requests_lead()}</p>
		<p>
			{m.community_requests_claim_tip()}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() plus a query -->
			<a href={signinHref}>{m.community_requests_signin()}</a>
		</p>

		{#if sent}
			<section class="thanks" tabindex="-1" bind:this={thanks} aria-labelledby="thanks-h">
				<h2 id="thanks-h">{m.community_request_sent()}</h2>
				{#if data.signedInAs}
					<p><a href={resolve('/(site)/me/suggestions')}>{m.community_my_link()}</a></p>
				{/if}
			</section>
		{:else}
			<p>
				{data.signedInAs
					? m.community_requests_signed_in({ name: data.signedInAs })
					: m.community_requests_signed_out()}
			</p>
			<ErrorSummary {errors} {labels} targets={{ request: 'f-request-0' }} />
			<form method="post" use:enhance>
				<fieldset>
					<legend>
						{m.community_request_legend()} <span class="req">({m.community_required()})</span>
					</legend>
					{@render fieldError('request')}
					{#each ['correction', 'removal'] as k, i (k)}
						<label class="radio">
							<input
								type="radio"
								name="request"
								value={k}
								id="f-request-{i}"
								checked={v('request') === k}
							/>
							{k === 'removal' ? m.community_request_removal() : m.community_request_correction()}
						</label>
					{/each}
				</fieldset>
				<div class="field">
					<label for={fieldId('creator_id')}>{labels.creator_id}</label>
					{@render fieldError('creator_id')}
					<select {...attrs('creator_id')}>
						<option value="" selected={v('creator_id') === ''}>
							{m.community_request_not_listed()}
						</option>
						{#each data.creators as c (c.id)}
							<option value={String(c.id)} selected={v('creator_id') === String(c.id)}>
								{c.name}
							</option>
						{/each}
					</select>
				</div>
				<div class="field">
					<label for={fieldId('name')}>
						{labels.name} <span class="req">({m.community_required()})</span>
					</label>
					{@render fieldError('name')}
					<input type="text" {...attrs('name')} value={v('name')} autocomplete="name" />
				</div>
				<div class="field">
					<label for={fieldId('channel')}>{labels.channel}</label>
					{@render fieldError('channel')}
					<input type="text" {...attrs('channel')} value={v('channel')} autocomplete="url" />
				</div>
				<div class="field">
					<label for={fieldId('details')}>
						{labels.details} <span class="req">({m.community_required()})</span>
					</label>
					{@render fieldError('details')}
					<textarea {...attrs('details')} rows="5" maxlength={data.detailsMax}
						>{v('details')}</textarea
					>
				</div>
				{#if !data.signedInAs}
					<div class="field">
						<label for={fieldId('contact_email')}>
							{labels.contact_email} <span class="req">({m.community_required()})</span>
						</label>
						<p class="hint" id="{fieldId('contact_email')}-hint">
							{m.community_request_email_hint()}
						</p>
						{@render fieldError('contact_email')}
						<input
							type="email"
							{...attrs('contact_email', true)}
							value={v('contact_email')}
							autocomplete="email"
							maxlength={data.emailMax}
						/>
					</div>
				{/if}
				<div class="actions">
					<button type="submit" class="btn primary">{m.community_request_send()}</button>
				</div>
			</form>
		{/if}
	</FormStyles>
</div>

<style>
	.page {
		padding: 40px var(--page-pad) 0;
		max-width: 46rem;
	}
	h1 {
		font-size: clamp(1.75rem, 4vw, 2.25rem);
		margin: 0 0 8px;
	}
	.lead {
		color: var(--muted);
	}
	.req {
		font-weight: 400;
		color: var(--muted);
	}
	.thanks {
		border: 1px solid var(--line);
		border-left: 4px solid var(--sw-on);
		border-radius: var(--radius);
		background: var(--surface2);
		padding: 14px 18px;
	}
	.thanks h2 {
		margin: 0;
		font-size: 1.125rem;
	}
</style>
