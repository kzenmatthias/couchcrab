/**
 * Loads the YouTube IFrame Player API once (browser only).
 * Couchcrab never downloads or re-hosts video: playback always goes through this player.
 */

export type YTPlayer = {
	destroy(): void;
	getIframe(): HTMLIFrameElement;
	getCurrentTime(): number;
	getDuration(): number;
	getPlayerState(): number;
	playVideo(): void;
	pauseVideo(): void;
	seekTo(seconds: number, allowSeekAhead: boolean): void;
	mute(): void;
	unMute(): void;
};

/** `YT.PlayerState` values used here. */
export const PLAYER_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 } as const;

type YTNamespace = {
	Player: new (
		element: HTMLElement,
		options: {
			host?: string;
			videoId: string;
			width?: string | number;
			height?: string | number;
			playerVars?: Record<string, string | number>;
			events?: {
				onReady?: (event: { target: YTPlayer }) => void;
				onStateChange?: (event: { target: YTPlayer; data: number }) => void;
			};
		}
	) => YTPlayer;
};

declare global {
	interface Window {
		YT?: YTNamespace;
		onYouTubeIframeAPIReady?: () => void;
	}
}

let loading: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
	if (window.YT?.Player) return Promise.resolve(window.YT);
	loading ??= new Promise((resolve, reject) => {
		const previous = window.onYouTubeIframeAPIReady;
		window.onYouTubeIframeAPIReady = () => {
			previous?.();
			resolve(window.YT!);
		};
		const script = document.createElement('script');
		script.src = 'https://www.youtube.com/iframe_api';
		script.async = true;
		script.onerror = () => {
			loading = null;
			reject(new Error('The YouTube player could not be loaded.'));
		};
		document.head.append(script);
	});
	return loading;
}
