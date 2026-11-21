<script lang="ts">
	import type { Snippet } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';

	type Props = {
		/** Visible heading of the row; also names the scroll buttons. */
		title: string;
		/** Optional small text after the heading. */
		note?: string;
		/** Larger cards, for Continue watching. */
		size?: 'normal' | 'big';
		/** The `<li>` items. */
		children: Snippet;
	};

	let { title, note, size = 'normal', children }: Props = $props();

	const uid = $props.id();
	let list: HTMLUListElement | undefined = $state();
	let overflows = $state(false);

	function prefersReducedMotion() {
		return (
			document.documentElement.dataset.motion === 'reduce' ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		);
	}

	function scrollByPage(direction: -1 | 1) {
		if (!list) return;
		list.scrollBy({
			left: direction * list.clientWidth * 0.9,
			behavior: prefersReducedMotion() ? 'auto' : 'smooth'
		});
	}

	$effect(() => {
		if (!list) return;
		const el = list;
		const measure = () => (overflows = el.scrollWidth > el.clientWidth + 1);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<section class="row" aria-labelledby="{uid}-h">
	<div class="row-h">
		<h2 id="{uid}-h">
			{title}
			{#if note}<small>{note}</small>{/if}
		</h2>
		<!-- The buttons need JavaScript and only help when the row overflows; Tab and
		     scrolling work without them. -->
		{#if overflows}
			<div class="rail-btns">
				<button type="button" aria-label={m.rail_back({ title })} onclick={() => scrollByPage(-1)}>
					<span aria-hidden="true">‹</span>
				</button>
				<button
					type="button"
					aria-label={m.rail_forward({ title })}
					onclick={() => scrollByPage(1)}
				>
					<span aria-hidden="true">›</span>
				</button>
			</div>
		{/if}
	</div>
	<ul class="rail" class:big={size === 'big'} bind:this={list}>
		{@render children()}
	</ul>
</section>

<style>
	.row {
		padding: 32px var(--page-pad) 24px;
	}
	.row-h {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 20px;
	}
	h2 {
		font-size: 1.5rem;
		letter-spacing: -0.01em;
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 4px 12px;
		flex-wrap: wrap;
	}
	small {
		color: var(--muted);
		font-weight: 400;
		font-size: 0.8125rem;
		letter-spacing: 0;
	}
	.rail-btns {
		margin-left: auto;
		display: flex;
		gap: 8px;
	}
	.rail-btns button {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--surface2);
		border: 1px solid var(--line);
		font-size: 1.25rem;
		line-height: 1;
	}
	.rail {
		display: flex;
		gap: 24px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scroll-padding-inline: 6px;
		scroll-behavior: smooth;
		list-style: none;
		/* Room for the focus outline of the cards. */
		padding: 6px 6px 14px;
		margin: -6px -6px 0;
		scrollbar-width: thin;
	}
	.rail > :global(li) {
		scroll-snap-align: start;
		flex: 0 0 auto;
	}
	.rail :global(.ep) {
		width: min(380px, 78vw);
	}
	.rail.big :global(.ep) {
		width: min(520px, 85vw);
	}
	.rail :global(.poster) {
		width: min(260px, 62vw);
	}
	@media (prefers-reduced-motion: reduce) {
		.rail {
			scroll-behavior: auto;
		}
	}
</style>
