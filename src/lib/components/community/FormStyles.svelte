<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Shared form styles for the public community pages (the management tool has its own). */
	let { children }: { children: Snippet } = $props();
</script>

<div class="cform">{@render children()}</div>

<style>
	/* Parts of the form hidden after hydration (see the suggest page). */
	.cform :global([hidden]) {
		display: none !important;
	}
	.cform :global(.field) {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 0 0 18px;
		max-width: 36rem;
	}
	.cform :global(.field label),
	.cform :global(legend) {
		font-weight: 700;
	}
	.cform :global(.hint) {
		margin: 0;
		color: var(--muted);
		font-size: 0.875rem;
	}
	.cform :global(.error) {
		margin: 0;
		color: var(--accent-text);
		font-weight: 700;
		font-size: 0.875rem;
	}
	.cform :global(.error)::before {
		content: '! ';
	}
	.cform :global(input:not([type='checkbox'], [type='radio'])),
	.cform :global(select),
	.cform :global(textarea) {
		background: var(--surface2);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 8px 10px;
		min-height: 44px;
		width: 100%;
	}
	.cform :global(textarea) {
		min-height: 6rem;
		resize: vertical;
	}
	.cform :global([aria-invalid='true']) {
		border-color: var(--accent) !important;
		border-width: 2px !important;
	}
	.cform :global(input[type='radio']) {
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
		flex: none;
	}
	.cform :global(fieldset) {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 12px 16px 4px;
		margin: 0 0 18px;
		max-width: 40rem;
	}
	.cform :global(.radio) {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 36px;
		padding: 2px 0;
	}
	.cform :global(.actions) {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		align-items: center;
		margin: 8px 0 16px;
	}
	.cform :global(button.btn) {
		font: inherit;
		font-weight: 700;
	}
</style>
