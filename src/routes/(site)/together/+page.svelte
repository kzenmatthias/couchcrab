<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import RadioGroup from '#lib/components/RadioGroup.svelte';
	import type { PovPlayer, PovState } from '#lib/pov-player.js';
	import { getViewing } from '#lib/prefs/store.svelte.js';
	import {
		clampNudge,
		clockSpan,
		needsSeek,
		povPosition,
		TOGETHER_MAX,
		TogetherClock,
		togetherQuery
	} from '#lib/together.js';
	import { clockDuration, youtubeWatchUrl, type VideoCard } from '#lib/video.js';
	import TogetherTile from './TogetherTile.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const viewing = getViewing();
	const TICK_MS = 250;
	const SAVE_EVERY_MS = 15_000;
	/** A POV that buffers longer than this no longer holds the others back. */
	const HOLD_MAX_MS = 8_000;
	/** A pause or play within this time of our own command is the player answering it. */
	const OWN_COMMAND_MS = 800;

	/* ---------- which POVs ---------- */

	const all = untrack(() => [...data.povs, ...data.candidates]);
	const byId = new Map(all.map((v) => [v.youtubeVideoId, v]));
	let ids: string[] = $state(untrack(() => data.povs.map((v) => v.youtubeVideoId)));
	let nudges: Record<string, number> = $state(untrack(() => ({ ...data.nudges })));
	let audio: string | null = $state(untrack(() => data.audio));
	let layout: 'grid' | 'focus' = $state('grid');

	const selected = $derived(ids.map((id) => byId.get(id)!).filter(Boolean));
	const available = $derived(all.filter((v) => !ids.includes(v.youtubeVideoId)));
	const span = $derived(
		clockSpan(
			selected.map((v) => ({
				youtubeVideoId: v.youtubeVideoId,
				startedAt: v.liveStartedAt!.getTime(),
				durationS: v.durationS,
				nudgeS: nudges[v.youtubeVideoId] ?? 0
			}))
		)
	);

	/* ---------- the clock and the players ---------- */

	const clock = new TogetherClock(untrack(() => data.start || span.start));
	let position = $state(clock.position);
	let playing = $state(false);
	let waiting = $state(false);
	let announcement = $state('');

	type Tile = {
		player: PovPlayer | null;
		state: PovState;
		/** What we last asked the player to do. */
		desired: 'play' | 'pause';
		commandAt: number;
		bufferingSince: number | null;
		/** Seek on the next tick even when the player is close. */
		forceSeek: boolean;
	};
	// Plain map: the page renders `tileStates`, not these.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- not rendered, see above
	const tiles = new Map<string, Tile>();
	const tileOf = (id: string): Tile => {
		let tile = tiles.get(id);
		if (!tile) {
			tile = {
				player: null,
				state: 'loading',
				desired: 'pause',
				commandAt: 0,
				bufferingSince: null,
				forceSeek: true
			};
			tiles.set(id, tile);
		}
		return tile;
	};
	const tileStates = $state<Record<string, PovState>>({});

	const durationOf = (id: string) => byId.get(id)?.durationS ?? 0;
	const where = (id: string, at = position) =>
		povPosition(at, span.offsets[id] ?? 0, durationOf(id));

	function command(tile: Tile, what: 'play' | 'pause') {
		if (!tile.player) return;
		tile.desired = what;
		tile.commandAt = performance.now();
		if (what === 'play') tile.player.play();
		else tile.player.pause();
	}

	function tick() {
		if (clock.position >= span.end && clock.playing) {
			clock.pause();
			clock.seek(span.end);
		}
		const now = clock.position;
		const t = performance.now();
		for (const id of ids) {
			const tile = tileOf(id);
			if (!tile.player) continue;
			// A POV that keeps buffering stops holding the others back.
			if (tile.bufferingSince !== null && t - tile.bufferingSince > HOLD_MAX_MS) {
				clock.hold(id, false);
			}
			const pos = where(id, now);
			const self = tile.state === 'buffering';
			const run = clock.playing && pos.state === 'playing' && (!clock.waiting || self);
			if (run) {
				if (tile.desired !== 'play') command(tile, 'play');
				if (tile.state === 'playing' && (tile.forceSeek || needsSeek(pos.at, tile.player.time()))) {
					tile.player.seek(pos.at);
					tile.forceSeek = false;
				}
			} else {
				if (tile.desired !== 'pause') command(tile, 'pause');
				const target =
					pos.state === 'playing' ? pos.at : pos.state === 'before' ? 0 : durationOf(id);
				if (tile.forceSeek || needsSeek(target, tile.player.time(), 0.5)) {
					tile.player.seek(target);
					tile.forceSeek = false;
				}
			}
		}
		position = clock.position;
		playing = clock.playing;
		const wasWaiting = waiting;
		waiting = clock.waiting;
		if (waiting && !wasWaiting) announcement = m.together_waiting();
	}

	function onstate(id: string, state: PovState) {
		const tile = tileOf(id);
		const own = performance.now() - tile.commandAt < OWN_COMMAND_MS;
		tile.state = state;
		tileStates[id] = state;
		if (state === 'buffering' && tile.desired === 'play') {
			tile.bufferingSince ??= performance.now();
			clock.hold(id, true);
		} else {
			tile.bufferingSince = null;
			clock.hold(id, false);
		}
		// Clicking a video pauses or plays it on its own: do the same for every POV.
		if (!own && state === 'paused' && tile.desired === 'play' && clock.playing) pause();
		else if (!own && state === 'playing' && tile.desired === 'pause' && !clock.playing) play();
		tick();
	}

	function onplayer(id: string, player: PovPlayer | null) {
		const tile = tileOf(id);
		tile.player = player;
		tile.desired = 'pause';
		tile.forceSeek = true;
		if (!player) {
			clock.hold(id, false);
			tiles.delete(id);
		} else tick();
	}

	/* ---------- controls ---------- */

	function play() {
		if (clock.position >= span.end) clock.seek(span.start);
		clock.play();
		tick();
	}

	function pause() {
		clock.pause();
		tick();
		saveAll();
	}

	const toggle = () => (clock.playing ? pause() : play());

	function seekTo(value: number) {
		clock.seek(Math.min(span.end, Math.max(span.start, value)));
		for (const id of ids) tileOf(id).forceSeek = true;
		tick();
	}

	function setNudge(id: string, value: number) {
		nudges[id] = clampNudge(value);
		tileOf(id).forceSeek = true;
		tick();
		syncUrl();
	}

	function add(video: VideoCard) {
		if (ids.length >= TOGETHER_MAX) return;
		ids = [...ids, video.youtubeVideoId];
		announcement = m.together_added({ creator: video.creator.name });
		syncUrl();
	}

	function remove(video: VideoCard) {
		ids = ids.filter((id) => id !== video.youtubeVideoId);
		delete nudges[video.youtubeVideoId];
		if (audio === video.youtubeVideoId) audio = ids[0] ?? null;
		announcement = m.together_removed({ creator: video.creator.name });
		syncUrl();
		// Focus would be lost with the removed tile.
		document.getElementById('together-h')?.focus();
	}

	function listen(id: string) {
		audio = id;
		syncUrl();
	}

	/* ---------- link ---------- */

	const link = (withTime: boolean) =>
		`?${togetherQuery({ ids, nudges, audio, t: withTime ? position : 0 })}`;

	function syncUrl() {
		// Shallow: the selection lives on this page, no reload.
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() plus a query
		void replaceState(`${resolve('/(site)/together')}${link(false)}`, page.state);
	}

	async function copyLink() {
		const url = new URL(link(true), window.location.href).toString();
		try {
			await navigator.clipboard.writeText(url);
			announcement = m.together_copied();
		} catch {
			announcement = m.together_copy_failed();
		}
	}

	/* ---------- progress ---------- */

	function saveAll() {
		for (const id of ids) {
			const pos = where(id);
			if (pos.state === 'playing' && pos.at > 0) viewing.recordPosition(id, pos.at, durationOf(id));
		}
	}

	onMount(() => {
		const ticker = setInterval(tick, TICK_MS);
		const saver = setInterval(() => clock.playing && saveAll(), SAVE_EVERY_MS);
		window.addEventListener('pagehide', saveAll);
		return () => {
			clearInterval(ticker);
			clearInterval(saver);
			window.removeEventListener('pagehide', saveAll);
			saveAll();
		};
	});

	/* ---------- shortcuts ---------- */

	function onkeydown(event: KeyboardEvent) {
		if (!viewing.prefs.shortcuts.enabled || event.ctrlKey || event.metaKey || event.altKey) return;
		const el = event.target;
		if (
			el instanceof HTMLInputElement ||
			el instanceof HTMLTextAreaElement ||
			el instanceof HTMLSelectElement ||
			(el instanceof HTMLElement && el.isContentEditable)
		)
			return;
		const key = event.key.toLowerCase();
		const onControl = el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement;
		if (key === 'k' || (key === ' ' && !onControl)) {
			event.preventDefault();
			if (!event.repeat) toggle();
		} else if (key === 'j') {
			event.preventDefault();
			seekTo(position - 10);
		} else if (key === 'l') {
			event.preventDefault();
			seekTo(position + 10);
		}
	}

	/* ---------- labels ---------- */

	const captions = $derived({
		on: viewing.prefs.playback.captionsOn,
		language: viewing.prefs.playback.captionLanguage
	});
	const context = $derived(
		data.series
			? data.group
				? m.watch_hidden_context({
						series: data.series.title,
						group: data.group.title ?? m.timeline_session({ number: data.group.number })
					})
				: data.series.title
			: null
	);

	function overlayOf(id: string): string | null {
		const pos = where(id);
		if (pos.state === 'before') return m.together_starts_in({ time: clockDuration(pos.startsIn) });
		if (pos.state === 'after') return m.together_ended();
		if (tileStates[id] === 'buffering' && playing) return m.together_buffering();
		return null;
	}

	function statusOf(id: string): string {
		const pos = where(id);
		if (pos.state === 'before') return m.together_starts_in({ time: clockDuration(pos.startsIn) });
		if (pos.state === 'after') return m.together_ended();
		return clockDuration(pos.at);
	}

	const youtubeAt = (id: string) => {
		const pos = where(id);
		const t = pos.state === 'playing' ? Math.floor(pos.at) : 0;
		return t > 0 ? `${youtubeWatchUrl(id)}&t=${t}s` : youtubeWatchUrl(id);
	};
</script>

<svelte:window {onkeydown} />

<svelte:head>
	<title>
		{m.together_title()}{context ? ` · ${context}` : ''} · {m.site_name()}
	</title>
</svelte:head>

<div class="together">
	<header class="head">
		<h1 id="together-h" tabindex="-1">{m.together_title()}</h1>
		{#if context && data.series}
			<p class="where">
				<a href={resolve('/(site)/series/[slug]', { slug: data.series.slug })}>{context}</a>
			</p>
		{/if}
		<p class="intro">{m.together_intro()}</p>
		{#if data.dropped > 0}
			<p class="note">{m.together_dropped({ count: data.dropped })}</p>
		{/if}
	</header>

	{#if selected.length === 0}
		<p class="empty">
			{m.together_empty()}
			<a href={resolve('/(site)/series')}>{m.together_browse_series()}</a>
		</p>
	{:else}
		<div class="controls" role="group" aria-label={m.together_controls()}>
			<button type="button" class="btn primary" onclick={toggle}>
				<span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
				{playing ? m.together_pause() : m.together_play()}
			</button>
			<button type="button" class="btn ghost" onclick={() => seekTo(position - 10)}>
				<span aria-hidden="true">−10</span><span class="sr-only">{m.together_back()}</span>
			</button>
			<button type="button" class="btn ghost" onclick={() => seekTo(position + 10)}>
				<span aria-hidden="true">+10</span><span class="sr-only">{m.together_forward()}</span>
			</button>
			<label class="scrub">
				<span class="sr-only">{m.together_position()}</span>
				<input
					type="range"
					min={Math.floor(span.start)}
					max={Math.ceil(span.end)}
					step="1"
					value={Math.floor(position)}
					aria-valuetext={m.together_position_text({
						position: clockDuration(position - span.start),
						total: clockDuration(span.end - span.start)
					})}
					oninput={(e) => seekTo(Number(e.currentTarget.value))}
				/>
			</label>
			<span class="time" data-testid="clock">
				{clockDuration(position - span.start)} / {clockDuration(span.end - span.start)}
			</span>
			{#if waiting}
				<span class="waiting">{m.together_waiting()}</span>
			{/if}
		</div>
		<div class="sr-only" aria-live="polite">{announcement}</div>

		<div class="options">
			<RadioGroup
				legend={m.together_layout()}
				name="layout"
				options={[
					{ value: 'grid', label: m.together_layout_grid() },
					{ value: 'focus', label: m.together_layout_focus() }
				]}
				value={layout}
				onchange={(v: 'grid' | 'focus') => (layout = v)}
			/>
			<button type="button" class="btn ghost" onclick={copyLink}>{m.together_copy_link()}</button>
		</div>

		<ul
			class="tiles"
			class:focus={layout === 'focus' && selected.length > 1}
			style:--others={Math.max(1, selected.length - 1)}
		>
			{#each selected as video (video.youtubeVideoId)}
				{@const id = video.youtubeVideoId}
				{@const hasSound = audio === id}
				<li
					class="tile"
					class:audio={hasSound}
					data-testid="pov"
					data-video={id}
					data-creator={video.creator.name}
				>
					<TogetherTile
						videoId={id}
						title={m.together_player_label({ creator: video.creator.name })}
						durationS={video.durationS}
						start={Math.max(
							0,
							where(id).state === 'playing' ? position - (span.offsets[id] ?? 0) : 0
						)}
						muted={!hasSound}
						{captions}
						overlay={overlayOf(id)}
						demoTime={clockDuration(
							where(id).state === 'playing' ? position - (span.offsets[id] ?? 0) : 0
						)}
						onplayer={(p: PovPlayer | null) => onplayer(id, p)}
						onstate={(s: PovState) => onstate(id, s)}
					/>
					<div class="bar">
						<h2 class="name">
							<CreatorAvatar
								name={video.creator.name}
								color={video.creator.color}
								avatarUrl={video.creator.avatarUrl}
								size={28}
							/>
							<span>{video.creator.name}</span>
						</h2>
						<span class="status">{statusOf(id)}</span>
						{#if hasSound}
							<span class="sound"><span aria-hidden="true">🔊 </span>{m.together_sound_on()}</span>
						{/if}
					</div>
					<div class="actions">
						<button
							type="button"
							class="btn ghost small"
							aria-pressed={hasSound}
							onclick={() => listen(id)}
							aria-label={m.together_listen_label({ creator: video.creator.name })}
						>
							{m.together_listen()}
						</button>
						<label class="nudge">
							<span>{m.together_shift()}</span>
							<input
								type="number"
								step="0.5"
								min="-600"
								max="600"
								value={nudges[id] ?? 0}
								aria-label={m.together_shift_label({ creator: video.creator.name })}
								aria-describedby="shift-hint"
								onchange={(e) => setNudge(id, Number(e.currentTarget.value))}
							/>
						</label>
						<a
							class="btn ghost small"
							href={youtubeAt(id)}
							rel="external noopener"
							aria-label={m.together_youtube_label({ creator: video.creator.name })}
						>
							{m.watch_on_youtube()}
						</a>
						<button
							type="button"
							class="btn ghost small"
							onclick={() => remove(video)}
							aria-label={m.together_remove_label({ creator: video.creator.name })}
						>
							{m.together_remove()}
						</button>
					</div>
				</li>
			{/each}
		</ul>
		<p id="shift-hint" class="hint">{m.together_shift_hint()}</p>

		{#if viewing.prefs.shortcuts.enabled}
			<p class="keys">
				<span>{m.shortcuts_hint_label()}</span>
				<span><kbd>K</kbd> {m.together_key_play()}</span>
				<span><kbd>J</kbd> <kbd>L</kbd> {m.together_key_seek()}</span>
				<a href="{resolve('/(site)/settings/display')}#shortcuts">{m.shortcuts_change_link()}</a>
			</p>
		{/if}

		<section class="add" aria-labelledby="add-h">
			<h2 id="add-h">{m.together_add_heading()}</h2>
			{#if ids.length >= TOGETHER_MAX}
				<p>{m.together_full({ max: TOGETHER_MAX })}</p>
			{:else if available.length === 0}
				<p>{m.together_add_none()}</p>
			{:else}
				<p class="hint">{m.together_bandwidth()}</p>
				<ul class="candidates">
					{#each available as video (video.youtubeVideoId)}
						<li>
							<button type="button" class="btn ghost" onclick={() => add(video)}>
								<CreatorAvatar
									name={video.creator.name}
									color={video.creator.color}
									avatarUrl={video.creator.avatarUrl}
									size={24}
								/>
								{m.together_add({ creator: video.creator.name })}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<style>
	.together {
		padding: 32px var(--page-pad) 0;
	}
	h1 {
		font-size: clamp(1.5rem, 4vw, 2rem);
		margin: 0 0 8px;
	}
	h1:focus {
		outline: none;
	}
	h1:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 4px;
	}
	.where,
	.intro,
	.note {
		margin: 0 0 8px;
		max-width: 48rem;
	}
	.intro,
	.note,
	.hint {
		color: var(--muted);
	}
	.controls {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin: 20px 0 12px;
		padding: 12px;
		background: var(--surface2);
		border: 1px solid var(--line);
		border-radius: 16px;
	}
	.scrub {
		flex: 1 1 220px;
		display: flex;
	}
	.scrub input {
		width: 100%;
		min-height: 24px;
		accent-color: var(--accent-text);
	}
	.time {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.waiting {
		color: var(--muted);
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 8px 24px;
		margin-bottom: 12px;
	}
	.options :global(fieldset) {
		margin: 0;
	}
	.tiles {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 20px;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
	}
	@media (min-width: 900px) {
		.tiles.focus {
			grid-template-columns: minmax(0, 3fr) minmax(0, 1fr);
		}
		.tiles.focus .tile.audio {
			order: -1;
			grid-row: span var(--others);
		}
	}
	.tile {
		min-width: 0;
	}
	.tile.audio :global(.video) {
		border: 3px solid var(--accent-text);
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
		margin: 10px 0 6px;
	}
	.name {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 1rem;
	}
	.status {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--muted);
	}
	.sound {
		font-weight: 700;
		color: var(--accent-text);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.actions .small {
		padding: 6px 12px;
		min-height: 36px;
		font-size: 0.875rem;
	}
	.actions button[aria-pressed='true'] {
		border-color: var(--accent-text);
	}
	.nudge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.875rem;
	}
	.nudge input {
		width: 5.5em;
		min-height: 36px;
		padding: 4px 8px;
		border: 1px solid var(--muted);
		border-radius: 8px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}
	.hint {
		margin: 12px 0 0;
		font-size: 0.875rem;
	}
	.keys {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		margin: 12px 0 0;
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
	.add {
		margin: 40px 0 0;
	}
	.add h2 {
		font-size: 1.25rem;
		margin: 0 0 8px;
	}
	.candidates {
		list-style: none;
		margin: 12px 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.candidates button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.empty {
		margin: 24px 0;
	}
</style>
