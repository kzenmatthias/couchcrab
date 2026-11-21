/** Messages for the error codes of the community forms, on top of the management codes. */
import { m } from '#lib/paraglide/messages.js';
import { errorMessage } from '../../routes/manage/ui/errors.js';
import type { RevertBlock } from './change.js';
import { blockLabel } from './labels.js';

const COMMUNITY: Record<string, () => string> = {
	no_change: m.community_error_no_change,
	rate_limited: m.community_error_rate_limited,
	invalid_email: m.community_error_invalid_email,
	target_missing: m.community_error_target_missing,
	use_claims: m.community_error_use_claims,
	apply_failed: m.community_error_apply_failed
};

const BLOCKS = new Set<string>([
	'already_reverted',
	'not_revertible',
	'from_youtube',
	'conflict',
	'missing',
	'failed'
]);

export function communityError(code: string): string {
	if (COMMUNITY[code]) return COMMUNITY[code]();
	if (BLOCKS.has(code)) return blockLabel(code as RevertBlock);
	return errorMessage(code);
}

export const fieldId = (name: string) => `f-${name}`;
export const errorId = (name: string) => `f-${name}-error`;
