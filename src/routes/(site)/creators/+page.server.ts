import { listCreators } from '#lib/server/catalog.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ creators: listCreators() });
