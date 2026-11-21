<script lang="ts">
	import { posterArt } from '#lib/poster-art.js';

	type Props = {
		palette?: string;
		seed?: number;
		width?: number;
		height?: number;
		tint?: string | null;
		motif?: string | null;
		class?: string;
	};

	let {
		palette,
		seed = 1,
		width = 100,
		height = 150,
		tint = null,
		motif = null,
		class: className = ''
	}: Props = $props();

	const uid = $props.id();
	const markup = $derived(
		posterArt({ palette, seed, width, height, tint, motif, id: `art-${uid}` })
	);
</script>

<!-- Decorative: the art carries no information and never contains text. -->
<svg
	class="art {className}"
	viewBox="0 0 {width} {height}"
	preserveAspectRatio="xMidYMid slice"
	aria-hidden="true"
	focusable="false"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- generated from numbers and palette colours only -->
	{@html markup}
</svg>

<style>
	.art {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
