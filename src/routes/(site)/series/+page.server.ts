import { listSeries } from '#lib/server/catalog.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ series: listSeries() });
