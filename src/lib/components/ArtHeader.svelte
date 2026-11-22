<script lang="ts">
	import type { Snippet } from 'svelte';
	import { posterSources, type PosterView } from '#lib/poster.js';
	import PosterImage from './PosterImage.svelte';

	type Props = {
		/** The series poster; `null` shows only the surface colour. */
		poster: PosterView;
		/** Colour behind the image, and all there is without one (`posterSurface`, a creator colour). */
		surface: string;
		/** `tall` for the home hero. */
		size?: 'tall' | 'normal';
		children: Snippet;
	};

	let { poster, surface, size = 'normal', children }: Props = $props();
</script>

<!--
	Large header with the poster image behind the text. The image is decorative; the text always
	sits on a scrim in the page background colour, so contrast does not depend on the image.
	Not lazy: it is at the top of the page.
-->
<div class="head {size}">
	<div class="art-wrap" aria-hidden="true" style:background-color={surface}>
		<PosterImage sources={posterSources(poster)} />
	</div>
	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	.head {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		min-height: 460px;
		padding: 120px var(--page-pad) 48px;
	}
	.head.tall {
		min-height: 600px;
		padding-bottom: 64px;
	}
	.art-wrap {
		position: absolute;
		inset: 0;
		z-index: -1;
	}
	.art-wrap::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, var(--bg) 0 40%, transparent 85%),
			linear-gradient(0deg, var(--bg) 0 15%, transparent 60%);
	}
	.content {
		max-width: 40rem;
		/* Keeps text readable even where the art shows through the scrim. */
		text-shadow: 0 0 12px var(--bg);
	}
	/* Narrow screens: the art becomes a band on top and the text sits on the page background. */
	@media (max-width: 900px) {
		.head,
		.head.tall {
			min-height: 0;
			padding-top: 0;
			padding-bottom: 32px;
		}
		.art-wrap {
			position: relative;
			inset: auto;
			height: 200px;
			margin: 0 calc(-1 * var(--page-pad)) 20px;
		}
		.art-wrap::after {
			background: linear-gradient(0deg, var(--bg) 0, transparent 60%);
		}
		.content {
			text-shadow: none;
		}
	}
</style>
