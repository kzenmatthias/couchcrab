<script lang="ts">
	import type { Snippet } from 'svelte';
	import { errorId, errorMessage, type Errors, fieldId } from './errors.js';

	type Attrs = {
		id: string;
		name: string;
		'aria-describedby': string | undefined;
		'aria-invalid': 'true' | undefined;
	};

	type Props = {
		name: string;
		label: string;
		hint?: string;
		errors?: Errors;
		/** Marks the label as required (the input itself carries `required`). */
		required?: boolean;
		children: Snippet<[Attrs]>;
	};

	let { name, label, hint, errors, required = false, children }: Props = $props();

	const error = $derived(errors?.[name]);
	const hintId = $derived(`${fieldId(name)}-hint`);
	const attrs = $derived<Attrs>({
		id: fieldId(name),
		name,
		'aria-describedby':
			[hint ? hintId : null, error ? errorId(name) : null].filter(Boolean).join(' ') || undefined,
		'aria-invalid': error ? 'true' : undefined
	});
</script>

<div class="field" class:invalid={!!error}>
	<label for={fieldId(name)}>
		{label}{#if required}<span class="req" aria-hidden="true"> *</span>{/if}
	</label>
	{#if hint}<p class="hint" id={hintId}>{hint}</p>{/if}
	{#if error}<p class="error" id={errorId(name)}>{errorMessage(error)}</p>{/if}
	{@render children(attrs)}
</div>
