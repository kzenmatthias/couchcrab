<script lang="ts">
	import type { Snippet } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';

	type Props = {
		title: string;
		/** Form action, e.g. `?/delete`. */
		action: string;
		confirmLabel: string;
		cancelHref: string;
		/** Hidden fields for the confirming form. */
		fields?: Record<string, string | number>;
		children?: Snippet;
	};

	let { title, action, confirmLabel, cancelHref, fields = {}, children }: Props = $props();
	let box = $state<HTMLElement>();

	// A confirmation step instead of a confirm() dialog: focus moves here when it appears.
	$effect(() => {
		box?.focus();
	});
</script>

<section class="confirm" tabindex="-1" bind:this={box} aria-labelledby="confirm-title">
	<h2 id="confirm-title">{title}</h2>
	{@render children?.()}
	<form method="post" {action}>
		{#each Object.entries(fields) as [name, value] (name)}
			<input type="hidden" {name} {value} />
		{/each}
		<button type="submit" class="btn primary">{confirmLabel}</button>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass a resolved path -->
		<a class="btn ghost" href={cancelHref}>{m.manage_cancel()}</a>
	</form>
</section>

<style>
	.confirm {
		border: 2px solid var(--accent);
		border-radius: var(--radius-lg);
		background: var(--surface2);
		padding: 18px 22px;
		margin: 0 0 24px;
	}
	h2 {
		margin: 0 0 8px;
		font-size: 1.25rem;
	}
	form {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		margin-top: 12px;
	}
</style>
