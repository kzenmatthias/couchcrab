import { providersEnabled } from '#lib/server/auth/config.js';
import { safeReturnPath } from '#lib/server/auth/oauth.js';
import { SIGNIN_ERRORS, type SignInError } from '#lib/server/auth/signin.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, locals }) => {
	const error = url.searchParams.get('error');
	return {
		providers: providersEnabled(),
		error: SIGNIN_ERRORS.find((code): code is SignInError => code === error) ?? null,
		returnTo: safeReturnPath(url.searchParams.get('redirect_to')),
		signedInAs: locals.user?.name ?? null
	};
};
