<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { PosterSettings } from '#lib/server/db/schema.js';
	import { isRealYoutubeId, seedFrom, youtubeWatchUrl } from '#lib/video.js';
	import { loadYouTubeApi, type YTPlayer } from '#lib/youtube-iframe.js';
	import PosterArt from './PosterArt.svelte';

	type Props = {
		videoId: string;
		/** Video title, used to name the player frame. */
		title: string;
		poster: PosterSettings | null;
		tint?: string | null;
	};

	let { videoId, title, poster, tint = null }: Props = $props();

	const real = $derived(isRealYoutubeId(videoId));
	let target: HTMLDivElement | undefined = $state();
	let failed = $state(false);

	$effect(() => {
		if (!real || !target) return;
		const el = target;
		let player: YTPlayer | null = null;
		let cancelled = false;
		loadYouTubeApi()
			.then((YT) => {
				if (cancelled) return;
				player = new YT.Player(el, {
					host: 'https://www.youtube-nocookie.com',
					videoId,
					width: '100%',
					height: '100%',
					// Captions follow the viewer's YouTube setting for now (a setting comes later).
					playerVars: { cc_load_policy: 0, rel: 0, playsinline: 1, autoplay: 0 },
					events: {
						onReady: ({ target: p }) => {
							p.getIframe().title = m.watch_player_label({ title });
						}
					}
				});
			})
			.catch(() => (failed = true));
		return () => {
			cancelled = true;
			player?.destroy();
		};
	});
</script>

<div class="video">
	{#if real && !failed}
		<div class="frame" bind:this={target}>
			<!-- Replaced by the YouTube player once its script has loaded. -->
			<p class="fallback">
				{m.watch_player_loading()}
				<a href={youtubeWatchUrl(videoId)} rel="external noopener">
					{m.watch_on_youtube()}<span class="sr-only">{m.opens_youtube()}</span>
				</a>
			</p>
		</div>
	{:else}
		<div class="placeholder">
			<PosterArt
				palette={poster?.type === 'art' ? poster.palette : undefined}
				seed={seedFrom(videoId)}
				width={160}
				height={90}
				{tint}
			/>
			<p class="msg">
				{#if failed}
					{m.watch_player_failed()}
				{:else}
					{m.watch_demo_placeholder()}
				{/if}
			</p>
		</div>
	{/if}
</div>

<style>
	.video {
		position: relative;
		aspect-ratio: 16 / 9;
		border-radius: 20px;
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
		padding: 24px;
	}
	.fallback a {
		color: #fff;
	}
	.placeholder {
		display: grid;
		place-items: center;
		isolation: isolate;
	}
	.placeholder :global(.art) {
		z-index: -1;
	}
	.msg {
		margin: 16px;
		max-width: 32rem;
		background: #000000e6;
		border-radius: 12px;
		padding: 14px 18px;
		text-align: center;
		font-weight: 700;
	}
</style>
