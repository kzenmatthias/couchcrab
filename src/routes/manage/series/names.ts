/** Display names for series and groups, used by rule tests and the Unsorted queue. */
import { m } from '#lib/paraglide/messages.js';

export function groupName(g: { kind: 'session' | 'week'; number: number; title: string | null }) {
	const base =
		g.kind === 'session'
			? m.manage_session_n({ number: g.number })
			: m.manage_week_n({ number: g.number });
	return g.title ? `${base}: ${g.title}` : base;
}
