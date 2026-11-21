<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { Countdown } from '#lib/prefs/schema.js';

	type Props = {
		/** What plays next, e.g. "Pebblewick, episode 4". */
		label: string;
		/** Seconds to count down, or `wait` to wait for the viewer. */
		countdown: Countdown;
		onplay: () => void;
		oncancel: () => void;
		/** Polite live region of the page; gets one announcement when the box appears. */
		announce: (text: string) => void;
	};

	let { label, countdown, onplay, oncancel, announce }: Props = $props();

	const waits = $derived(countdown === 'wait');
	// The starting value only: the countdown is not restarted when the setting changes.
	let remaining = $state(0);
	let hovered = $state(false);
	let focused = $state(false);
	const paused = $derived(hovered || focused);

	onMount(() => {
		remaining = countdown === 'wait' ? 0 : countdown;
		// Announced once; the visible number is not a live region, so it is not read every second.
		announce(
			countdown === 'wait'
				? m.upnext_announce_wait({ next: label })
				: m.upnext_announce({ seconds: countdown, next: label })
		);
	});

	$effect(() => {
		if (waits || paused || remaining <= 0) return;
		const timer = setInterval(() => {
			remaining -= 1;
			if (remaining <= 0) {
				clearInterval(timer);
				onplay();
			}
		}, 1000);
		return () => clearInterval(timer);
	});
</script>

<!-- No animation: the remaining time is plain text. Hover or focus pauses the countdown. -->
<section
	class="upnext"
	aria-labelledby="upnext-h"
	onmouseenter={() => (hovered = true)}
	onmouseleave={() => (hovered = false)}
	onfocusin={() => (focused = true)}
	onfocusout={(e) => {
		const next = e.relatedTarget as Node | null;
		if (!next || !e.currentTarget.contains(next)) focused = false;
	}}
>
	<p id="upnext-h">
		{#if waits}
			<b>{m.upnext_wait()}</b> {label}
		{:else}
			<b>{m.upnext_in({ seconds: remaining })}</b> {label}
		{/if}
		{#if paused && !waits}<span class="paused">{m.upnext_paused()}</span>{/if}
	</p>
	<div class="btns">
		<button type="button" class="btn primary" onclick={onplay}>{m.upnext_play_now()}</button>
		<button type="button" class="btn ghost" onclick={oncancel}>{m.upnext_cancel()}</button>
	</div>
</section>

<style>
	.upnext {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 16px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
		color: var(--text);
	}
	p {
		margin: 0;
		flex: 1 1 12rem;
	}
	.paused {
		display: block;
		font-size: 0.8125rem;
		color: var(--muted);
	}
	.btns {
		display: flex;
		gap: 8px;
	}
</style>
