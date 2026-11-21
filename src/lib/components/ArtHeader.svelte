<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PosterSettings } from '#lib/server/db/schema.js';
	import PosterArt from './PosterArt.svelte';

	type Props = {
		poster: PosterSettings | null;
		/** Optional sun or moon colour, e.g. a creator colour. */
		tint?: string | null;
		/** Seed when the poster has none (e.g. a creator header). */
		seed?: number;
		/** `tall` for the home hero. */
		size?: 'tall' | 'normal';
		children: Snippet;
	};

	let { poster, tint = null, seed = 1, size = 'normal', children }: Props = $props();
</script>

<!--
	Large header with poster art behind the text. The art is decorative; the text always sits on
	a scrim in the page background colour, so contrast does not depend on the art.
-->
<div class="head {size}">
	<div class="art-wrap" aria-hidden="true">
		{#if poster?.type === 'image'}
			<img src={poster.url} alt="" />
		{:else}
			<PosterArt
				palette={poster?.type === 'art' ? poster.palette : undefined}
				seed={poster?.type === 'art' ? poster.seed : seed}
				width={160}
				height={90}
				{tint}
			/>
		{/if}
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
	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
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
