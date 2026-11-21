<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { communityError, fieldId } from '#lib/community/errors.js';

	type Props = {
		errors: Record<string, string> | null | undefined;
		/** Visible label per field name, used in the links. */
		labels: Record<string, string>;
		/** Element ids to link to, when a field does not use the default `f-<name>` id. */
		targets?: Record<string, string>;
		title?: string;
	};

	let { errors, labels, targets = {}, title }: Props = $props();
	let box = $state<HTMLElement>();
	const entries = $derived(Object.entries(errors ?? {}));

	// Move focus to the summary whenever a submit comes back with errors.
	$effect(() => {
		if (entries.length > 0) box?.focus();
	});
</script>

{#if entries.length > 0}
	<div class="summary" tabindex="-1" bind:this={box} aria-labelledby="error-summary-title">
		<h2 id="error-summary-title">{title ?? m.community_error_summary()}</h2>
		<ul>
			{#each entries as [field, code] (field)}
				<li>
					<a href="#{targets[field] ?? fieldId(field)}">
						{#if labels[field]}{labels[field]}:
						{/if}{communityError(code)}
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
