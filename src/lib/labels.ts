/** Translated labels for enum values from the database. */
import { m } from '#lib/paraglide/messages.js';

export type SeriesKind = 'season' | 'live_series' | 'event' | 'other';
export type SeriesStatus = 'upcoming' | 'ongoing' | 'ended';

export function kindLabel(kind: SeriesKind): string {
	switch (kind) {
		case 'season':
			return m.series_kind_season();
		case 'live_series':
			return m.series_kind_live_series();
		case 'event':
			return m.series_kind_event();
		default:
			return m.series_kind_other();
	}
}

export function statusLabel(status: SeriesStatus): string {
	switch (status) {
		case 'upcoming':
			return m.series_status_upcoming();
		case 'ongoing':
			return m.series_status_ongoing();
		default:
			return m.series_status_ended();
	}
}
