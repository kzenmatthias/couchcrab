<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { isRealYoutubeId, youtubeWatchUrl } from '#lib/video.js';
	import { loadYouTubeApi, PLAYER_STATE, type YTPlayer } from '#lib/youtube-iframe.js';

	type Props = {
		videoId: string;
		/** Video title, used to name the player frame. */
		title: string;
		/** Start playing at once (after "Play now" or the autoplay countdown). */
		autoplay?: boolean;
		/** Resume position in seconds. */
		startAt?: number;
		/** Captions on by default, and the preferred language. */
		captions?: { on: boolean; language: string };
		/** Called with the position on pause, every 15 s while playing and when leaving. */
		onposition?: (seconds: number, durationS: number) => void;
		onended?: () => void;
		/** Offer "Simulate end of video" on the demo placeholder (dev and e2e builds only). */
		testHooks?: boolean;
	};

	let {
		videoId,
		title,
		autoplay = false,
		startAt = 0,
		captions = { on: false, language: 'en' },
		onposition,
		onended,
		testHooks = false
	}: Props = $props();

	const SAVE_EVERY_MS = 15_000;
	const real = $derived(isRealYoutubeId(videoId));
	let target: HTMLDivElement | undefined = $state();
	let failed = $state(false);

	$effect(() => {
		if (!real || !target) return;
		const el = target;
		let player: YTPlayer | null = null;
		let timer: ReturnType<typeof setInterval> | null = null;
		let cancelled = false;

		/** Only a player that played has a position worth saving. */
		let started = false;
		const save = () => {
			if (!player || !started) return;
			try {
				onposition?.(player.getCurrentTime(), player.getDuration());
			} catch {
				/* player not ready */
			}
		};
		const stopTimer = () => {
			if (timer) clearInterval(timer);
			timer = null;
		};

		loadYouTubeApi()
			.then((YT) => {
				if (cancelled) return;
				// Read the options here (not tracked): changing a setting must not reload the video.
				const playerVars: Record<string, string | number> = {
					rel: 0,
					playsinline: 1,
					autoplay: autoplay ? 1 : 0,
					cc_load_policy: captions.on ? 1 : 0
				};
				if (captions.on) playerVars.cc_lang_pref = captions.language;
				if (startAt > 0) playerVars.start = Math.floor(startAt);
				player = new YT.Player(el, {
					host: 'https://www.youtube-nocookie.com',
					videoId,
					width: '100%',
					height: '100%',
					playerVars,
					events: {
						onReady: ({ target: p }) => {
							p.getIframe().title = m.watch_player_label({ title });
						},
						onStateChange: ({ data }) => {
							if (data === PLAYER_STATE.PLAYING) {
								started = true;
								stopTimer();
								timer = setInterval(save, SAVE_EVERY_MS);
							} else {
								stopTimer();
								if (data === PLAYER_STATE.PAUSED) save();
								if (data === PLAYER_STATE.ENDED) {
									save();
									onended?.();
								}
							}
						}
					}
				});
			})
			.catch(() => (failed = true));

		window.addEventListener('pagehide', save);
		return () => {
			cancelled = true;
			stopTimer();
			window.removeEventListener('pagehide', save);
			// Leaving for another page inside the app also saves the position.
			save();
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
			<div class="msg">
				<p>
					{#if failed}
						{m.watch_player_failed()}
					{:else}
						{m.watch_demo_placeholder()}
					{/if}
				</p>
				{#if testHooks && !real}
					<button type="button" class="btn ghost" onclick={() => onended?.()}>
						{m.watch_simulate_end()}
					</button>
				{/if}
			</div>
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
	.msg {
		margin: 16px;
		max-width: 32rem;
		background: #000000e6;
		border-radius: 12px;
		padding: 14px 18px;
		text-align: center;
		font-weight: 700;
	}
	.msg p {
		margin: 0;
	}
	.msg .btn {
		margin-top: 10px;
		background: #000;
		color: #fff;
		border-color: #fff;
	}
</style>
