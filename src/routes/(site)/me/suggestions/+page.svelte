<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { communityError } from '#lib/community/errors.js';
	import { suggestionStatusLabel, suggestionTypeLabel } from '#lib/community/labels.js';
	import ChangeList from '#lib/components/community/ChangeList.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = getLocale();
	const date = (d: Date) => formatDate(d, locale, { dateStyle: 'medium', timeZone: 'UTC' });
	const href = (link: (typeof data.items)[number]['link']) =>
		!link
			? null
			: link.kind === 'video'
				? resolve('/(site)/watch/[videoId]', { videoId: link.key })
				: link.kind === 'series'
					? resolve('/(site)/series/[slug]', { slug: link.key })
					: resolve('/(site)/creators/[slug]', { slug: link.key });
	const formError = $derived(
		form && 'errors' in form ? Object.values(form.errors as Record<string, string>)[0] : null
	);
</script>

<svelte:head>
	<title>{m.community_me_title()} · {m.site_name()}</title>
</svelte:head>

<div class="page">
	<h1>{m.community_me_title()}</h1>
	<p class="lead">{m.community_me_lead()}</p>
	<p>
		{m.community_your_trust({ approved: data.trust.approved, rejected: data.trust.rejected })}
		<span class="muted">{m.community_me_trust_explain()}</span>
	</p>

	<div role="status">
		{#if form && 'withdrawn' in form}<p class="flash">{m.community_me_withdrawn()}</p>{/if}
	</div>
	{#if formError}<p class="error" role="alert">{communityError(formError)}</p>{/if}

	{#if data.items.length === 0}
		<p>{m.community_me_empty()}</p>
	{:else}
		<ul class="plain list">
			{#each data.items as s (s.id)}
				{@const link = href(s.link)}
				<li>
					<article aria-labelledby="s{s.id}-h" class:question={s.status === 'question'}>
						<p class="kind">{suggestionTypeLabel(s.type, s.targetType)}</p>
						<h2 id="s{s.id}-h">
							{#if link}<a href={link}>{s.title}</a>{:else}{s.title}{/if}
						</h2>
						<p class="status">
							<b>{m.community_me_status({ status: suggestionStatusLabel(s.status) })}</b>
							· {m.community_me_sent({ date: date(s.createdAt) })}
						</p>
						<ChangeList changes={s.changes} />
						{#if s.note}
							<h3>{m.community_me_note()}</h3>
							<p class="text">{s.note}</p>
						{/if}
						{#if s.reviewMessage}
							<h3>{m.community_me_message()}</h3>
							<p class="text">{s.reviewMessage}</p>
							{#if s.status === 'question'}<p class="muted">{m.community_me_answer_hint()}</p>{/if}
						{/if}
						{#if s.status === 'open' || s.status === 'question'}
							<form method="post" action="?/withdraw" use:enhance>
								<input type="hidden" name="suggestion_id" value={s.id} />
								<button
									type="submit"
									class="btn ghost"
									aria-label={m.community_me_withdraw() + m.community_item_name({ title: s.title })}
								>
									{m.community_me_withdraw()}
								</button>
							</form>
						{/if}
					</article>
				</li>
			{/each}
		</ul>
	{/if}
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
	.lead,
	.muted {
		color: var(--muted);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	article {
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--surface);
		padding: 14px 18px;
	}
	article.question {
		border: 2px solid var(--sand);
	}
	.kind {
		margin: 0;
		color: var(--muted);
		font-size: 0.875rem;
	}
	h2 {
		font-size: 1.0625rem;
		margin: 4px 0;
		overflow-wrap: anywhere;
	}
	h3 {
		font-size: 0.9375rem;
		margin: 10px 0 2px;
	}
	.status,
	.text {
		margin: 0 0 6px;
	}
	.text {
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.flash {
		border: 1px solid var(--line);
		border-left: 4px solid var(--sw-on);
		border-radius: var(--radius);
		background: var(--surface2);
		padding: 10px 14px;
	}
	.error {
		color: var(--accent-text);
		font-weight: 700;
	}
</style>
