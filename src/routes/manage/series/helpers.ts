/** Turns a stored series into form values for the series form. */
import { normalizePoster, posterInput, type PosterSettings } from '#lib/poster.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

export function seriesValues(
	s: {
		title: string;
		slug: string;
		kind: string;
		status: string;
		grouping: string;
		startedAt: Date | null;
		endedAt: Date | null;
		poster: PosterSettings | null;
	},
	translations: { locale: string; description: string }[],
	creatorIds: number[]
): Record<string, string | string[]> {
	const poster = normalizePoster(s.poster);
	return {
		title: s.title,
		slug: s.slug,
		kind: s.kind,
		status: s.status,
		grouping: s.grouping,
		started_at: day(s.startedAt),
		ended_at: day(s.endedAt),
		...posterInput(poster),
		creators: creatorIds.map(String),
		...Object.fromEntries(translations.map((t) => [`description_${t.locale}`, t.description]))
	};
}
