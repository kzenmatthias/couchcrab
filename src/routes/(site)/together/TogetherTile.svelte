<script lang="ts">
	import { untrack } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import {
		createSimulatedPov,
		createYouTubePov,
		type PovPlayer,
		type PovState
	} from '#lib/pov-player.js';
	import { isRealYoutubeId, youtubeWatchUrl } from '#lib/video.js';

	type Props = {
		videoId: string;
		/** Accessible name of the player frame. */
		title: string;
		durationS: number;
		/** Position in the video when the player is made (seconds). */
		start: number;
		muted: boolean;
		captions: { on: boolean; language: string };
		/** Shown over the video: "Starts in 2:10", "Stream ended". */
		overlay: string | null;
		/** The demo stand-in shows its position, so the sync can be seen without YouTube. */
		demoTime: string;
		onplayer: (player: PovPlayer | null) => void;
		onstate: (state: PovState) => void;
	};

	let {
		videoId,
		title,
		durationS,
		start,
		muted,
		captions,
		overlay,
		demoTime,
		onplayer,
		onstate
	}: Props = $props();

	const real = $derived(isRealYoutubeId(videoId));
	let target: HTMLDivElement | undefined = $state();
	let failed = $state(false);
	let player: PovPlayer | null = null;

	$effect(() => {
		if (real && !target) return;
		const el = target;
		let cancelled = false;
		// Made once per tile: later changes go through the player, not a reload.
		const o = untrack(() => ({ videoId, title, start, muted, captions, durationS }));
		const ready = (p: PovPlayer) => {
			if (cancelled) return p.destroy();
			player = p;
			onplayer(p);
		};
		if (real && el) {
			createYouTubePov(el, { ...o, onstate: (s) => !cancelled && onstate(s) })
				.then(ready)
				.catch(() => {
					failed = true;
					onstate('failed');
				});
		} else {
			ready(createSimulatedPov({ ...o, onstate: (s) => !cancelled && onstate(s) }));
		}
		return () => {
			cancelled = true;
			player?.destroy();
			player = null;
			onplayer(null);
		};
	});

	$effect(() => {
		player?.setMuted(muted);
	});
</script>

<div class="video">
	{#if real && !failed}
		<div class="frame" bind:this={target}>
			<p class="fallback">{m.watch_player_loading()}</p>
		</div>
	{:else}
		<div class="placeholder">
			<p class="msg">
				{#if failed}
					{m.watch_player_failed()}
					<a href={youtubeWatchUrl(videoId)} rel="external noopener">
						{m.watch_on_youtube()}<span class="sr-only">{m.opens_youtube()}</span>
					</a>
				{:else}
					{m.together_demo()}
					<span class="demo-time" data-testid="demo-time">{demoTime}</span>
				{/if}
			</p>
		</div>
	{/if}
	{#if overlay}
		<p class="overlay">{overlay}</p>
	{/if}
</div>

<style>
	.video {
		position: relative;
		aspect-ratio: 16 / 9;
		border-radius: 16px;
		overflow: hidden;
		background: #000;
		color: #fff;
		border: 1px solid var(--line);
	}
	.frame,
	.frame :global(iframe),
	.placeholder {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}
	.fallback {
		margin: 0;
		padding: 16px;
	}
	.placeholder {
		display: grid;
		place-items: center;
		isolation: isolate;
	}
	.msg {
		margin: 12px;
		background: #000000e6;
		border-radius: 10px;
		padding: 10px 14px;
		text-align: center;
		font-weight: 700;
		display: grid;
		gap: 4px;
	}
	.msg a {
		color: #fff;
	}
	.demo-time {
		font-family: var(--font-mono);
		font-size: 1.25rem;
	}
	.overlay {
		position: absolute;
		inset: auto 12px 12px auto;
		margin: 0;
		background: #000000e6;
		color: #fff;
		border-radius: 10px;
		padding: 6px 12px;
		font-weight: 700;
	}
</style>
