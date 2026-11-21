<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { communityError } from '#lib/community/errors.js';
	import ChangeList from '#lib/components/community/ChangeList.svelte';
	import ErrorSummary from '#lib/components/community/ErrorSummary.svelte';
	import Flash from '../ui/Flash.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = getLocale();
	const isAdmin = $derived(data.manager.role === 'admin');
	const when = (d: Date) =>
		formatDate(d, locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
	const flash = $derived(
		form && 'done' in form
			? form.done === 'approved'
				? m.community_review_approved({ title: form.title ?? '' })
				: form.done === 'rejected'
					? m.community_review_rejected({ title: form.title ?? '' })
					: m.community_review_asked({ title: form.title ?? '' })
			: null
	);
	const failed = $derived(
		form && 'errors' in form && typeof form.suggestionId === 'number' ? form : null
	);
	const failedTitle = $derived(
		failed ? (data.items.find((i) => i.id === failed.suggestionId)?.title ?? '') : ''
	);
	const errFor = (id: number, name: string) =>
		failed?.suggestionId === id ? (failed.errors as Record<string, string>)[name] : undefined;
	type Item = (typeof data.items)[number];
	const href = (link: Item['link']) =>
		!link
			? null
			: link.kind === 'video'
				? resolve('/(site)/watch/[videoId]', { videoId: link.key })
				: link.kind === 'series'
					? resolve('/(site)/series/[slug]', { slug: link.key })
					: resolve('/(site)/creators/[slug]', { slug: link.key });
</script>

<svelte:head>
	<title>{m.community_review_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.community_review_title()}</h1>
<p class="lead">{m.community_review_lead()}</p>
<p>{m.community_review_count({ count: data.items.length })}</p>

<Flash message={flash} />
{#if failed}
	<ErrorSummary
		errors={failed.errors as Record<string, string>}
		title={m.community_review_failed({ title: failedTitle })}
		labels={{}}
		targets={{
			suggestion: `r${failed.suggestionId}-h`,
			reason: `r${failed.suggestionId}-reason`,
			message: `r${failed.suggestionId}-message`
		}}
	/>
{/if}

{#if data.items.length === 0}
	<p>{m.community_review_empty()}</p>
{:else}
	<h2 class="sr-only">{m.community_review_title()}</h2>
	<ul class="plain queue">
		{#each data.items as item (item.id)}
			{@const link = href(item.link)}
			{@const name = m.community_item_name({ title: item.title })}
			<li>
				<article class:creatorreq={item.isCreatorRequest} aria-labelledby="r{item.id}-h">
					<div class="hd">
						{#if item.isCreatorRequest}
							<span class="pill warn">{m.community_pill_creator_request()}</span>
						{/if}
						{#if item.status === 'question'}
							<span class="pill">{m.community_pill_question()}</span>
						{/if}
						{#if item.sender.name !== null && 'approved' in item.sender}
							<span>
								<b>{m.community_review_from({ name: item.sender.name })}</b>
								({m.community_review_trust({
									approved: item.sender.approved,
									rejected: item.sender.rejected,
									trust: item.sender.trust
								})})
							</span>
						{:else}
							<span>
								<b>{m.community_review_anon()}</b>
								{#if 'contactEmail' in item.sender && item.sender.contactEmail}
									· {m.community_review_contact({ email: item.sender.contactEmail })}
								{/if}
							</span>
						{/if}
						<span>{m.community_review_sent({ date: when(item.createdAt) })}</span>
					</div>
					<h3 id="r{item.id}-h" tabindex="-1">{item.title}</h3>
					<ChangeList changes={item.changes} />
					{#if item.note}
						<p class="note"><b>{m.community_review_note()}:</b> {item.note}</p>
					{/if}
					{#if item.status === 'question' && item.reviewMessage}
						<p class="note">{m.community_review_question({ message: item.reviewMessage })}</p>
					{/if}
					{#if errFor(item.id, 'suggestion')}
						<p class="error">{communityError(errFor(item.id, 'suggestion')!)}</p>
					{/if}

					{#if item.claim}
						<p>{m.community_review_claim()}</p>
						{#if isAdmin}
							<p><a href={resolve('/manage/claims')}>{m.community_review_open_claims()}</a></p>
						{/if}
					{:else}
						{#if item.missing}
							<p>{m.community_review_missing()}</p>
						{:else if !item.applies}
							<p class="muted">{m.community_review_by_hand()}</p>
						{/if}
						<div class="btns">
							{#if !item.missing}
								<form method="post" action="?/approve" use:enhance>
									<input type="hidden" name="suggestion_id" value={item.id} />
									<input type="hidden" name="title" value={item.title} />
									<button
										type="submit"
										class="btn primary"
										aria-label={m.community_approve() + name}
									>
										{m.community_approve()}
									</button>
								</form>
							{/if}
							{#if link}
								<a class="btn ghost" href={link} aria-label={m.community_review_open_item() + name}>
									{m.community_review_open_item()}
								</a>
							{/if}
						</div>
						<details open={!!errFor(item.id, 'reason')}>
							<summary aria-label={m.community_reject() + name}>{m.community_reject()}</summary>
							<form method="post" action="?/reject" use:enhance>
								<input type="hidden" name="suggestion_id" value={item.id} />
								<input type="hidden" name="title" value={item.title} />
								<div class="field">
									<label for="r{item.id}-reason">{m.community_reject_reason()}</label>
									{#if errFor(item.id, 'reason')}
										<p class="error" id="r{item.id}-reason-error">
											{communityError(errFor(item.id, 'reason')!)}
										</p>
									{/if}
									<textarea
										id="r{item.id}-reason"
										name="reason"
										rows="2"
										maxlength={data.messageMax}
										aria-invalid={errFor(item.id, 'reason') ? 'true' : undefined}
										aria-describedby={errFor(item.id, 'reason')
											? `r${item.id}-reason-error`
											: undefined}></textarea>
								</div>
								<button type="submit" class="btn ghost" aria-label={m.community_reject() + name}>
									{m.community_reject()}
								</button>
							</form>
						</details>
						{#if item.sender.name !== null}
							<details open={!!errFor(item.id, 'message')}>
								<summary aria-label={m.community_ask() + name}>{m.community_ask()}</summary>
								<form method="post" action="?/ask" use:enhance>
									<input type="hidden" name="suggestion_id" value={item.id} />
									<input type="hidden" name="title" value={item.title} />
									<div class="field">
										<label for="r{item.id}-message">{m.community_ask_message()}</label>
										{#if errFor(item.id, 'message')}
											<p class="error" id="r{item.id}-message-error">
												{communityError(errFor(item.id, 'message')!)}
											</p>
										{/if}
										<textarea
											id="r{item.id}-message"
											name="message"
											rows="2"
											maxlength={data.messageMax}
											aria-invalid={errFor(item.id, 'message') ? 'true' : undefined}
											aria-describedby={errFor(item.id, 'message')
												? `r${item.id}-message-error`
												: undefined}></textarea>
									</div>
									<button
										type="submit"
										class="btn ghost"
										aria-label={m.community_ask_send() + name}
									>
										{m.community_ask_send()}
									</button>
								</form>
							</details>
						{/if}
					{/if}
				</article>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.queue {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	article {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 14px 18px;
	}
	article.creatorreq {
		border: 2px solid var(--sand);
	}
	.hd {
		display: flex;
		gap: 6px 12px;
		align-items: center;
		flex-wrap: wrap;
		font-size: 0.875rem;
		color: var(--muted);
	}
	.hd b {
		color: var(--text);
	}
	.pill {
		font-size: 0.8125rem;
		border-radius: 999px;
		padding: 2px 9px;
		border: 1px solid var(--line);
		color: var(--text);
	}
	.pill.warn {
		color: var(--sand);
		border-color: var(--sand);
		font-weight: 700;
	}
	h3 {
		font-size: 1.0625rem;
		margin: 8px 0 0;
		overflow-wrap: anywhere;
	}
	.note {
		margin: 6px 0;
		overflow-wrap: anywhere;
		white-space: pre-line;
	}
	.btns {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
		margin: 10px 0;
	}
	.btns form {
		margin: 0;
	}
	details {
		margin: 8px 0;
	}
	summary {
		cursor: pointer;
		min-height: 32px;
		display: inline-flex;
		align-items: center;
		font-weight: 700;
	}
	details form {
		margin-top: 8px;
	}
</style>
