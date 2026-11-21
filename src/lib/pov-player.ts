/**
 * One POV in Watch together: a small control surface over the YouTube IFrame player, or over a
 * simulated player for the demo data (fake video ids), so the sync works and can be tested
 * without YouTube. Browser only.
 */
import { loadYouTubeApi, PLAYER_STATE, type YTPlayer } from './youtube-iframe.js';

export type PovState = 'loading' | 'paused' | 'playing' | 'buffering' | 'ended' | 'failed';

export interface PovPlayer {
	play(): void;
	pause(): void;
	seek(seconds: number): void;
	/** Current position in seconds. */
	time(): number;
	setMuted(muted: boolean): void;
	destroy(): void;
}

export type PovPlayerOptions = {
	videoId: string;
	/** Accessible name of the player frame. */
	title: string;
	start: number;
	muted: boolean;
	captions: { on: boolean; language: string };
	onstate: (state: PovState) => void;
};

/** A YouTube player without its own controls: the shared controls drive every POV. */
export async function createYouTubePov(el: HTMLElement, o: PovPlayerOptions): Promise<PovPlayer> {
	const YT = await loadYouTubeApi();
	return new Promise((resolve) => {
		const playerVars: Record<string, string | number> = {
			rel: 0,
			playsinline: 1,
			autoplay: 0,
			controls: 0,
			disablekb: 1,
			iv_load_policy: 3,
			cc_load_policy: o.captions.on ? 1 : 0
		};
		if (o.captions.on) playerVars.cc_lang_pref = o.captions.language;
		if (o.start > 0) playerVars.start = Math.floor(o.start);
		// Assigned right below; the methods only run once the player exists.
		// eslint-disable-next-line prefer-const
		let player: YTPlayer;
		const pov: PovPlayer = {
			play: () => player.playVideo(),
			pause: () => player.pauseVideo(),
			seek: (s) => player.seekTo(Math.max(0, s), true),
			time: () => {
				try {
					return player.getCurrentTime() ?? 0;
				} catch {
					return 0;
				}
			},
			setMuted: (muted) => (muted ? player.mute() : player.unMute()),
			destroy: () => player.destroy()
		};
		player = new YT.Player(el, {
			host: 'https://www.youtube-nocookie.com',
			videoId: o.videoId,
			width: '100%',
			height: '100%',
			playerVars,
			events: {
				onReady: ({ target }) => {
					target.getIframe().title = o.title;
					if (o.muted) target.mute();
					o.onstate('paused');
					resolve(pov);
				},
				onStateChange: ({ data }) => {
					if (data === PLAYER_STATE.PLAYING) o.onstate('playing');
					else if (data === PLAYER_STATE.BUFFERING) o.onstate('buffering');
					else if (data === PLAYER_STATE.ENDED) o.onstate('ended');
					else if (data === PLAYER_STATE.PAUSED) o.onstate('paused');
				}
			}
		});
	});
}

/** A stand-in for demo videos: a clock that plays, pauses and seeks like a player would. */
export function createSimulatedPov(
	o: Pick<PovPlayerOptions, 'start' | 'onstate'> & { durationS: number },
	now: () => number = () => performance.now()
): PovPlayer {
	let base = o.start;
	let since: number | null = null;
	const time = () => {
		const t = since === null ? base : base + (now() - since) / 1000;
		return o.durationS > 0 ? Math.min(t, o.durationS) : t;
	};
	queueMicrotask(() => o.onstate('paused'));
	return {
		play() {
			if (since !== null) return;
			since = now();
			o.onstate('playing');
		},
		pause() {
			if (since === null) return;
			base = time();
			since = null;
			o.onstate('paused');
		},
		seek(s) {
			base = Math.max(0, s);
			if (since !== null) since = now();
		},
		time,
		setMuted() {},
		destroy() {
			since = null;
		}
	};
}
