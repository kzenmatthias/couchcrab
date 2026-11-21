/** Glue between the creator dashboard routes (`/creator`) and `creator-self.ts`. */
import { error, redirect } from '@sveltejs/kit';
import type { CreatorActor } from './creator-self.js';

/**
 * The acting creator for a dashboard route. Signed out goes to the sign-in page; a signed-in
 * user who has not claimed a creator profile gets a 403 (the page explains how to claim). Every
 * load and every action calls this on the server; the service layer checks the claim again.
 */
export function creatorActorFor(locals: App.Locals): CreatorActor {
	if (!locals.user) redirect(303, '/signin');
	if (locals.user.creatorId === null) error(403, 'Not a claimed creator');
	return { id: locals.user.id, creatorId: locals.user.creatorId };
}
