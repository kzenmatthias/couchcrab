import { error } from '@sveltejs/kit';
import { getCreatorBySlug } from '#lib/server/catalog.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const data = getCreatorBySlug(params.slug);
	if (!data) error(404, 'Not found');
	return data;
};
