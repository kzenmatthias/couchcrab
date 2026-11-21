<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { publicHistorySummary } from '#lib/community/labels.js';
	import ChangeList from '#lib/components/community/ChangeList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const locale = getLocale();
	const date = (d: Date) => formatDate(d, locale, { dateStyle: 'long', timeZone: 'UTC' });
	const title = $derived(data.content?.title ?? m.community_page_fallback_title());
</script>

<svelte:head>
	<title>{title} · {m.site_name()}</title>
</svelte:head>

<article class="page">
	{#if data.content?.isFallback}
		<p class="fallback">{m.page_fallback_notice()}</p>
	{/if}
	<div lang={data.content?.locale}>
		<h1>{title}</h1>
		{#if data.content}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- Markdown sanitised on the server -->
			<div class="prose">{@html data.content.html}</div>
		{/if}
	</div>

	<section aria-labelledby="you-h">
		<h2 id="you-h">{m.community_page_you_heading()}</h2>
		{#if data.signedIn}
			<ul class="links">
				<li>
					<a href={resolve('/(site)/me/suggestions')}>{m.community_my_link()}</a>
					<span class="muted">{m.community_page_my_lead()}</span>
				</li>
				{#if data.isReviewer}
					<li>
						<a href={resolve('/manage/review')}>{m.community_nav_review()}</a>
						<span class="muted">{m.community_page_review_lead()}</span>
					</li>
				{/if}
			</ul>
		{:else}
			<p>{m.community_page_signin_lead()}</p>
			<p>
				<a class="strong" href={resolve('/(site)/signin')}>{m.community_page_signin()}</a>
			</p>
		{/if}
	</section>

	<section class="history" aria-labelledby="recent-h">
		<h2 id="recent-h">{m.community_recent_heading()}</h2>
		<p class="muted">{m.community_recent_lead()}</p>
		{#if data.recent.length === 0}
			<p>{m.community_public_history_empty()}</p>
		{:else}
			<ul class="plain">
				{#each data.recent as h (h.id)}
					<li>
						<p class="sum">
							<b>{publicHistorySummary(h, locale)}</b>
							{#if h.suggested}({m.community_public_suggested()}){/if}
							{#if h.isRevert}{m.community_public_revert()}{/if}
						</p>
						<p class="when">
							<time datetime={h.createdAt.toISOString()}>{date(h.createdAt)}</time>
							{#if h.series}
								·
								<a href={resolve('/(site)/series/[slug]/about', { slug: h.series.slug })}>
									{h.series.title}
								</a>
							{/if}
						</p>
						<ChangeList changes={h.changes} />
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</article>

<style>
	.page {
		padding: 32px var(--page-pad) 0;
		max-width: calc(720px + 2 * var(--page-pad));
	}
	h1 {
		font-size: 2.5rem;
		letter-spacing: -0.02em;
		line-height: 1.1;
		margin: 0 0 24px;
		overflow-wrap: anywhere;
	}
	h2 {
		font-size: 1.375rem;
		margin: 40px 0 12px;
	}
	.fallback {
		background: var(--surface2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 10px 14px;
	}
	.prose {
		font-size: 1rem;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.prose :global(h2) {
		font-size: 1.375rem;
		margin: 32px 0 8px;
	}
	.prose :global(a),
	.links a,
	.when a,
	.strong {
		text-decoration: underline;
	}
	.strong {
		font-weight: 700;
	}
	.links {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.links li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0 0 12px;
	}
	.links a {
		font-weight: 700;
		padding: 4px 0;
	}
	.muted,
	.when {
		color: var(--muted);
		font-size: 0.9375rem;
	}
	.plain {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.history li {
		border-top: 1px solid var(--line);
		padding: 12px 0;
	}
	.sum,
	.when {
		margin: 0;
		overflow-wrap: anywhere;
	}
</style>
