/**
 * Who I watch, spoiler-free and creator-captions rules, and the next episode on the timeline.
 * Pure functions on the cookie mirror, used by the server loads and by the browser.
 */
import type { ViewingMirror } from '#lib/prefs/mirror.js';

/** What the filters need to know about an episode. */
export type Viewable = {
	creator: { id: number };
	/** The series whose POV list and viewing options apply (the parent for an Extras video). */
	povSeriesId: number;
	hasCreatorCaptions: boolean;
};

/** Creator ids watched in a series, or null for everyone. */
export function effectiveCreators(mirror: ViewingMirror, seriesId: number): number[] | null {
	return mirror.custom[seriesId] ?? mirror.global;
}

export function isCustomSeries(mirror: ViewingMirror, seriesId: number): boolean {
	return seriesId in mirror.custom;
}

function flag(def: boolean, on: number[], off: number[], seriesId: number): boolean {
	if (on.includes(seriesId)) return true;
	if (off.includes(seriesId)) return false;
	return def;
}

export function isSpoilerFree(mirror: ViewingMirror, seriesId: number): boolean {
	return flag(mirror.spoilerDefault, mirror.spoilerOn, mirror.spoilerOff, seriesId);
}

export function isCreatorCaptionsOnly(mirror: ViewingMirror, seriesId: number): boolean {
	return flag(mirror.captionsDefault, mirror.captionsOn, mirror.captionsOff, seriesId);
}

/** True when the viewer wants to see this episode. */
export function isShown(mirror: ViewingMirror, video: Viewable): boolean {
	const list = effectiveCreators(mirror, video.povSeriesId);
	if (list !== null && !list.includes(video.creator.id)) return false;
	if (!video.hasCreatorCaptions && isCreatorCaptionsOnly(mirror, video.povSeriesId)) return false;
	return true;
}

export function filterForViewer<T extends Viewable>(videos: readonly T[], mirror: ViewingMirror) {
	return videos.filter((v) => isShown(mirror, v));
}

/**
 * Removes the real title of episodes in spoiler-free series, so it is not in the HTML or in
 * the page data. The browser shows it again for watched episodes or on request.
 */
export function redactForViewer<T extends Viewable & { title: string; titleHidden?: boolean }>(
	videos: readonly T[],
	mirror: ViewingMirror
): T[] {
	return videos.map((v) =>
		isSpoilerFree(mirror, v.povSeriesId) ? { ...v, title: '', titleHidden: true } : v
	);
}

/** Filter, then redact: what a public list shows to this viewer. */
export function forViewer<T extends Viewable & { title: string; titleHidden?: boolean }>(
	videos: readonly T[],
	mirror: ViewingMirror
): T[] {
	return redactForViewer(filterForViewer(videos, mirror), mirror);
}

/**
 * The episode after `currentId`: the next included item of the same group (week or session)
 * in timeline order, else the first included item of a later group. Groups and their items
 * must be in timeline order. `include` is the viewer filter (who I watch, captions); the
 * current episode itself does not have to pass it.
 */
export function nextEpisode<T extends { id: number }>(
	groups: readonly (readonly T[])[],
	currentId: number,
	include: (item: T) => boolean = () => true
): T | null {
	for (let g = 0; g < groups.length; g++) {
		const i = groups[g].findIndex((v) => v.id === currentId);
		if (i === -1) continue;
		const sameGroup = groups[g].slice(i + 1).find(include);
		if (sameGroup) return sameGroup;
		for (let n = g + 1; n < groups.length; n++) {
			const first = groups[n].find(include);
			if (first) return first;
		}
		return null;
	}
	return null;
}
