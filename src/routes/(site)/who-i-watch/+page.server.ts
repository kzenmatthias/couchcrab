import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageServerLoad } from './$types';

/** The "Who I watch" link in the header leads to the creator settings. */
export const load: PageServerLoad = () => {
	redirect(307, resolve('/(site)/settings/creators'));
};
