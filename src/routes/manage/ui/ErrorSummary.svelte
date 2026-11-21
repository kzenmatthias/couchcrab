<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { errorMessage, type Errors, fieldId } from './errors.js';

	type Props = {
		errors: Errors;
		/** Visible label per field name, used in the links. */
		labels: Record<string, string>;
		/** Element ids to link to, when a field does not use the default `f-<name>` id. */
		targets?: Record<string, string>;
	};

	let { errors, labels, targets = {} }: Props = $props();
	let box = $state<HTMLElement>();
	const entries = $derived(Object.entries(errors ?? {}));

	// Move focus to the summary whenever a submit comes back with errors.
	$effect(() => {
		if (entries.length > 0) box?.focus();
	});
</script>

{#if entries.length > 0}
	<div class="summary" tabindex="-1" bind:this={box} aria-labelledby="error-summary-title">
		<h2 id="error-summary-title">{m.manage_error_summary({ count: entries.length })}</h2>
		<ul>
			{#each entries as [field, code] (field)}
				<li>
					<a href="#{targets[field] ?? fieldId(field)}">
						{labels[field] ?? field}: {errorMessage(code)}
					</a>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.summary {
		border: 2px solid var(--accent);
		border-radius: var(--radius);
		background: var(--surface2);
		padding: 14px 18px;
		margin: 0 0 24px;
	}
	h2 {
		font-size: 1.0625rem;
		margin: 0 0 6px;
	}
	ul {
		margin: 0;
		padding-left: 1.2em;
	}
	a {
		color: var(--accent-text);
		text-decoration: underline;
	}
</style>
