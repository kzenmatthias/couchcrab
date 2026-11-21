<script lang="ts">
	import { initials, textOn } from '#lib/video.js';

	type Props = {
		name: string;
		color: string;
		avatarUrl?: string | null;
		/** Diameter in px. */
		size?: number;
	};

	let { name, color, avatarUrl = null, size = 24 }: Props = $props();
</script>

<!-- Decorative: the creator's name is always written next to the avatar. -->
<span
	class="av"
	aria-hidden="true"
	style:--c={color}
	style:--fg={textOn(color)}
	style:--size="{size}px"
>
	{#if avatarUrl}
		<img src={avatarUrl} alt="" loading="lazy" />
	{:else}
		{initials(name)}
	{/if}
</span>

<style>
	.av {
		width: var(--size);
		height: var(--size);
		flex: 0 0 auto;
		border-radius: 50%;
		background: var(--c);
		color: var(--fg);
		display: inline-grid;
		place-items: center;
		overflow: hidden;
		font-weight: 800;
		font-size: calc(var(--size) * 0.36);
		line-height: 1;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
