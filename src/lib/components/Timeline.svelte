<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate, formatDateRange } from '#lib/i18n.js';
	import { groupBySession, groupByWeek, sortTimeline, type SessionInfo } from '#lib/timeline.js';
	import type { VideoCard } from '#lib/video.js';
	import { getViewing } from '#lib/prefs/store.svelte.js';
	import { resolve } from '$app/paths';
	import { togetherIds, togetherQuery } from '#lib/together.js';
	import EpisodeCard from './EpisodeCard.svelte';

	type Props = {
		videos: VideoCard[];
		grouping: 'week' | 'session' | 'none';
		sessions?: SessionInfo[];
		/** Series start: week 1 of the timeline. */
		anchor?: Date | null;
		/** Heading for an ungrouped list. */
		heading?: string;
	};

	let { videos, grouping, sessions = [], anchor = null, heading }: Props = $props();

	const locale = $derived(getLocale());
	const viewing = getViewing();
	const listClass = $derived(viewing.prefs.display.textOnly ? 'text-list' : 'card-grid');

	type Section = { key: string; title: string; note: string | null; items: VideoCard[] };

	const sections: Section[] = $derived.by(() => {
		if (grouping === 'week') {
			return groupByWeek(videos, anchor).map((w) => ({
				key: w.key,
				title: m.timeline_week({ number: w.number }),
				note: formatDateRange(w.start, w.end, locale),
				items: w.items
			}));
		}
		if (grouping === 'session') {
			return groupBySession(videos, sessions).map((g) => ({
				key: g.session ? `s${g.session.id}` : 'loose',
				title: g.session
					? (g.session.title ?? m.timeline_session({ number: g.session.number }))
					: m.timeline_no_session(),
				note: g.session?.startsAt
					? formatDate(g.session.startsAt, locale, { dateStyle: 'long', timeZone: 'UTC' })
					: null,
				items: g.items
			}));
		}
		return videos.length
			? [
					{
						key: 'all',
						title: heading ?? m.timeline_all_episodes(),
						note: null,
						items: sortTimeline(videos)
					}
				]
			: [];
	});
</script>

{#each sections as section (section.key)}
	<section class="group" class:session={grouping === 'session'} aria-labelledby="tl-{section.key}">
		<h2 id="tl-{section.key}">
			<span>{section.title}</span>
			{#if section.note}<span class="note">{section.note}</span>{/if}
		</h2>
		{#if grouping === 'session'}
			{@const together = togetherIds(section.items)}
			{#if together.length > 1}
				<p class="together">
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() plus a query -->
					<a
						class="btn ghost"
						href="{resolve('/(site)/together')}?{togetherQuery({ ids: together })}"
					>
						<span aria-hidden="true">▦</span>
						{m.together_link_session({ session: section.title, count: together.length })}
					</a>
				</p>
			{/if}
		{/if}
		<ul class={listClass}>
			{#each section.items as video (video.id)}
				<li><EpisodeCard {video} /></li>
			{/each}
		</ul>
	</section>
{:else}
	<p>{m.series_no_episodes()}</p>
{/each}

<style>
	.group {
		margin-bottom: 64px;
	}
	h2 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
		margin: 0 0 20px;
		font-size: 0.9375rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	h2 span:first-child {
		color: var(--text);
	}
	.session h2 {
		font-size: 1.5rem;
		text-transform: none;
		letter-spacing: -0.01em;
	}
	.together {
		margin: -8px 0 20px;
	}
	.note {
		font-size: 0.875rem;
		font-weight: 400;
	}
	.session .note {
		font-size: 0.875rem;
		letter-spacing: 0;
	}
</style>
