<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate, formatDateRange } from '#lib/i18n.js';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import UpNext from '#lib/components/UpNext.svelte';
	import VideoThumb from '#lib/components/VideoThumb.svelte';
	import YouTubePlayer from '#lib/components/YouTubePlayer.svelte';
	import { requestAutoplay, takeAutoplay } from '#lib/prefs/autoplay.js';
	import { CONTINUE_MIN_SECONDS } from '#lib/prefs/progress.js';
	import { getViewing } from '#lib/prefs/store.svelte.js';
	import { togetherQuery } from '#lib/together.js';
	import { clockDuration, spokenDuration, youtubeWatchUrl, type VideoCard } from '#lib/video.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const viewing = getViewing();
	const v = $derived(data.video);
	const locale = $derived(getLocale());
	// Read once: this view is created anew for every episode.
	const autoplay = takeAutoplay(untrack(() => data.video.youtubeVideoId));
	const testHooks = import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === '1';

	const groupLabel = $derived(
		data.group
			? (data.group.title ?? m.timeline_session({ number: data.group.number }))
			: data.week
				? m.timeline_week({ number: data.week.number })
				: null
	);
	const groupNote = $derived(
		data.week ? formatDateRange(data.week.start, data.week.end, locale) : null
	);

	/* ---------- progress ---------- */

	const entry = $derived(viewing.entry(v.youtubeVideoId));
	const watched = $derived(entry?.watched ?? false);
	// Resume where the viewer left off (read once, when the player starts).
	const startAt = $derived(
		entry && !entry.watched && entry.seconds >= CONTINUE_MIN_SECONDS ? entry.seconds : 0
	);

	function savePosition(seconds: number, durationS: number) {
		viewing.recordPosition(v.youtubeVideoId, seconds, durationS || v.durationS);
	}

	/* ---------- spoiler-free title ---------- */

	let reveal = $state(false);
	const isWatched = (item: VideoCard) => viewing.entry(item.youtubeVideoId)?.watched ?? false;
	/** The real title when it may be shown, else undefined. */
	function titleOf(item: VideoCard, revealed = false): string | undefined {
		if (!item.titleHidden) return item.title;
		return revealed || isWatched(item) ? viewing.titles[item.youtubeVideoId] : undefined;
	}
	$effect(() => {
		if (v.titleHidden && (reveal || watched)) viewing.requestTitle(v.youtubeVideoId);
		for (const item of data.queue)
			if (item.titleHidden && isWatched(item)) viewing.requestTitle(item.youtubeVideoId);
	});
	const realTitle = $derived(titleOf(v, reveal));
	const episodeLabel = (item: VideoCard) =>
		item.episodeNumber ? m.episode_long({ number: item.episodeNumber }) : null;
	const hiddenHeading = $derived(
		m.watch_hidden_heading({
			context: groupLabel
				? m.watch_hidden_context({ series: data.series.title, group: groupLabel })
				: data.series.title,
			who: episodeLabel(v)
				? m.watch_hidden_who({ creator: v.creator.name, episode: episodeLabel(v)! })
				: v.creator.name
		})
	);
	const heading = $derived(realTitle ?? hiddenHeading);

	/* ---------- next episode and autoplay ---------- */

	const next = $derived(data.next);
	const nextLabel = $derived.by(() => {
		if (!next) return '';
		const ep = episodeLabel(next);
		// The next title is never shown here: in a spoiler-free series it would give it away.
		return ep
			? m.watch_hidden_who({ creator: next.creator.name, episode: ep })
			: (titleOf(next) ?? next.creator.name);
	});
	let showUpNext = $state(false);
	let announcement = $state('');

	function playNext() {
		if (!next) return;
		showUpNext = false;
		requestAutoplay(next.youtubeVideoId);
		void goto(resolve('/(site)/watch/[videoId]', { videoId: next.youtubeVideoId }));
	}

	function ended() {
		viewing.setWatched(v.youtubeVideoId, true);
		if (next && viewing.prefs.playback.autoplay) showUpNext = true;
	}

	function cancelUpNext() {
		showUpNext = false;
		announcement = m.upnext_cancelled();
	}

	/* ---------- shortcuts (single keys, can be changed or turned off) ---------- */

	function isTyping(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		return (
			target.isContentEditable ||
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement
		);
	}

	function onkeydown(event: KeyboardEvent) {
		const { enabled, keys } = viewing.prefs.shortcuts;
		if (!enabled || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
		if (isTyping(event.target)) return;
		const key = event.key.toLowerCase();
		if (key === keys.next && next) {
			event.preventDefault();
			playNext();
		} else if (key === keys.title && v.titleHidden && !watched) {
			event.preventDefault();
			reveal = !reveal;
		} else if (key === keys.watched) {
			event.preventDefault();
			viewing.setWatched(v.youtubeVideoId, !watched);
		}
	}
</script>

<svelte:window {onkeydown} />

<svelte:head>
	<title>{heading} · {m.site_name()}</title>
</svelte:head>

<div class="player">
	<div class="main">
		<div class="stage">
			<YouTubePlayer
				videoId={v.youtubeVideoId}
				title={heading}
				{autoplay}
				{startAt}
				captions={{
					on: viewing.prefs.playback.captionsOn,
					language: viewing.prefs.playback.captionLanguage
				}}
				onposition={savePosition}
				onended={ended}
				{testHooks}
			/>
			{#if showUpNext && next}
				<!-- On narrow screens the box is below the player: bring it into view, above the
					bottom tab bar (scroll-padding-bottom). No-op when it is already visible. -->
				<div
					class="upnext-slot"
					{@attach (el: HTMLElement) => el.scrollIntoView({ block: 'nearest' })}
				>
					<UpNext
						label={nextLabel}
						countdown={viewing.prefs.playback.countdown}
						onplay={playNext}
						oncancel={cancelUpNext}
						announce={(text: string) => {
							announcement = text;
						}}
					/>
				</div>
			{/if}
		</div>
		<div class="sr-only" aria-live="polite">{announcement}</div>

		<h1>{heading}</h1>
		<p class="meta">
			<a class="creator" href={resolve('/(site)/creators/[slug]', { slug: v.creator.slug })}>
				<CreatorAvatar
					name={v.creator.name}
					color={v.creator.color}
					avatarUrl={v.creator.avatarUrl}
					size={40}
				/>
				<span>{v.creator.name}</span>
			</a>
			<span>{spokenDuration(v.durationS, locale)}</span>
			<span>
				<time datetime={v.publishedAt.toISOString()}>
					{formatDate(v.publishedAt, locale, { dateStyle: 'long', timeZone: 'UTC' })}
				</time>
			</span>
			{#if v.hasCreatorCaptions}
				<span><span class="cc" aria-hidden="true">CC</span> {m.cc_badge()}</span>
			{/if}
			{#if realTitle === undefined}
				<span class="badge spoiler">{m.badge_title_hidden_spoiler()}</span>
			{/if}
			{#if watched}
				<span class="badge"><span aria-hidden="true">✓ </span>{m.badge_watched()}</span>
			{/if}
		</p>
		<p class="where">
			<a href={resolve('/(site)/series/[slug]', { slug: data.series.slug })}>{data.series.title}</a>
			{#if groupLabel}· {groupLabel}{#if groupNote}, {groupNote}{/if}{/if}
			{#if v.episodeNumber}· {m.episode_long({ number: v.episodeNumber })}{/if}
		</p>
		<p class="btns">
			<button
				type="button"
				class="btn ghost"
				aria-pressed={watched}
				onclick={() => viewing.setWatched(v.youtubeVideoId, !watched)}
			>
				<span class="check" aria-hidden="true">{watched ? '✓' : ''}</span>
				{m.watch_mark_watched()}
			</button>
			{#if v.titleHidden && !watched}
				<button type="button" class="btn ghost" onclick={() => (reveal = !reveal)}>
					{reveal ? m.watch_hide_title() : m.watch_show_title()}
				</button>
			{/if}
			{#if next}
				<a
					class="btn ghost"
					href={resolve('/(site)/watch/[videoId]', { videoId: next.youtubeVideoId })}
				>
					{m.watch_next_link({ next: nextLabel })}
				</a>
			{/if}
			{#if data.together.length > 1}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() plus a query -->
				<a
					class="btn ghost"
					href="{resolve('/(site)/together')}?{togetherQuery({ ids: data.together })}"
				>
					{m.together_with_others({ count: data.together.length - 1 })}
				</a>
			{/if}
			<a class="btn ghost" href={youtubeWatchUrl(v.youtubeVideoId)} rel="external noopener">
				{m.watch_on_youtube()}
				<span class="sr-only">{m.opens_youtube()}</span>
				<span aria-hidden="true">↗</span>
			</a>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() plus a query -->
			<a
				class="btn ghost"
				href="{resolve('/(site)/suggest')}?video={encodeURIComponent(v.youtubeVideoId)}"
			>
				{m.community_suggest_link()}
			</a>
		</p>
		{#if viewing.prefs.shortcuts.enabled}
			<p class="keys">
				<span>{m.shortcuts_hint_label()}</span>
				<span>
					<kbd>{viewing.prefs.shortcuts.keys.next.toUpperCase()}</kbd>
					{m.shortcut_next_short()}
				</span>
				<span>
					<kbd>{viewing.prefs.shortcuts.keys.title.toUpperCase()}</kbd>
					{m.shortcut_title_short()}
				</span>
				<span>
					<kbd>{viewing.prefs.shortcuts.keys.watched.toUpperCase()}</kbd>
					{m.shortcut_watched_short()}
				</span>
				<a href="{resolve('/(site)/settings/display')}#shortcuts">{m.shortcuts_change_link()}</a>
			</p>
		{/if}
	</div>

	<aside class="queue" aria-labelledby="queue-h">
		<h2 id="queue-h">
			{groupLabel ? m.watch_queue_heading_group({ group: groupLabel }) : m.watch_queue_heading()}
		</h2>
		<ol>
			{#each data.queue as item (item.id)}
				{@const current = item.id === v.id}
				{@const itemTitle = current ? realTitle : titleOf(item)}
				<li class:current>
					<a
						href={resolve('/(site)/watch/[videoId]', { videoId: item.youtubeVideoId })}
						aria-current={current ? 'page' : undefined}
					>
						<span class="qt">
							<VideoThumb
								youtubeVideoId={item.youtubeVideoId}
								label={itemTitle === undefined ? episodeLabel(item) : null}
								duration={clockDuration(item.durationS)}
								hidden={itemTitle === undefined}
							/>
						</span>
						<span class="qi">
							<span class="qn">{item.creator.name}</span>
							<span class="qtitle">
								{itemTitle ?? episodeLabel(item) ?? m.episode_hidden_untitled()}
							</span>
							{#if current}
								<span class="playing">{m.watch_now_playing()}</span>
							{:else}
								<span class="qd">{spokenDuration(item.durationS, locale)}</span>
							{/if}
							{#if isWatched(item)}
								<span class="qd"><span aria-hidden="true">✓ </span>{m.badge_watched()}</span>
							{/if}
						</span>
					</a>
				</li>
			{/each}
		</ol>
	</aside>
</div>

<style>
	.player {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 360px;
		gap: 40px;
		padding: 32px var(--page-pad) 0;
	}
	@media (max-width: 1000px) {
		.player {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.stage {
		position: relative;
	}
	.upnext-slot {
		margin-top: 12px;
	}
	@media (min-width: 760px) {
		.upnext-slot {
			position: absolute;
			right: 16px;
			bottom: 16px;
			max-width: min(32rem, calc(100% - 32px));
			margin: 0;
		}
	}
	h1 {
		font-size: clamp(1.5rem, 4vw, 2rem);
		line-height: 1.2;
		margin: 24px 0 12px;
		overflow-wrap: anywhere;
	}
	.meta,
	.where {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 16px;
		margin: 0 0 12px;
		color: var(--muted);
	}
	.where {
		gap: 6px;
		color: var(--text);
	}
	.creator {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: var(--text);
		font-weight: 700;
		text-decoration: none;
	}
	.creator span {
		text-decoration: underline;
	}
	.cc {
		font-size: 0.6875rem;
		font-weight: 800;
		border: 1.5px solid var(--text);
		color: var(--text);
		border-radius: 4px;
		padding: 0 4px;
	}
	.badge {
		font-size: 0.8125rem;
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: 999px;
		padding: 1px 10px;
	}
	.badge.spoiler {
		border-color: var(--sand);
		color: var(--sand);
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 20px 0 0;
	}
	.btns button[aria-pressed='true'] {
		border-color: var(--sea-text);
	}
	.check {
		display: inline-block;
		min-width: 0.8em;
	}
	.check:empty {
		display: none;
	}
	.keys {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		margin: 16px 0 0;
		font-size: 0.875rem;
		color: var(--muted);
	}
	kbd {
		font-family: var(--font-mono);
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0 5px;
		color: var(--text);
	}
	.queue h2 {
		font-size: 1rem;
		margin: 0 0 12px;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	ol a {
		display: flex;
		gap: 14px;
		align-items: center;
		padding: 8px;
		border: 1px solid transparent;
		border-radius: 14px;
		text-decoration: none;
	}
	ol a:hover .qtitle {
		text-decoration: underline;
	}
	.current a {
		border: 2px solid var(--accent-text);
		background: var(--surface2);
	}
	.qt {
		flex: 0 0 140px;
		width: 140px;
	}
	.qt :global(.thumb) {
		border-radius: 10px;
	}
	.qt :global(.hidden .lbl) {
		font-size: 1rem;
		left: 10px;
		bottom: 8px;
	}
	.qi {
		display: flex;
		flex-direction: column;
		min-width: 0;
		font-size: 0.875rem;
	}
	.qn {
		font-weight: 700;
	}
	.qtitle {
		overflow-wrap: anywhere;
	}
	.qd,
	.playing {
		color: var(--muted);
		font-size: 0.8125rem;
	}
	.playing {
		color: var(--accent-text);
		font-weight: 700;
	}
	@media (max-width: 420px) {
		.qt {
			flex-basis: 96px;
			width: 96px;
		}
	}
</style>
