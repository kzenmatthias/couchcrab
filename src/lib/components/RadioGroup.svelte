<script lang="ts" generics="T extends string | number">
	type Props = {
		legend: string;
		/** Hide the legend visually (it stays the group's accessible name). */
		legendHidden?: boolean;
		name: string;
		options: { value: T; label: string }[];
		value: T;
		onchange: (value: T) => void;
	};

	let { legend, legendHidden = false, name, options, value, onchange }: Props = $props();
	const uid = $props.id();
</script>

<!-- Real radio buttons in a fieldset; arrow keys move between them. -->
<fieldset class="radios">
	<legend class:sr-only={legendHidden}>{legend}</legend>
	<div class="opts">
		{#each options as option, i (option.value)}
			<label class:checked={option.value === value}>
				<input
					type="radio"
					name="{name}-{uid}"
					id="{uid}-{i}"
					value={String(option.value)}
					checked={option.value === value}
					onchange={() => onchange(option.value)}
				/>
				{option.label}
			</label>
		{/each}
	</div>
</fieldset>

<style>
	fieldset {
		border: 0;
		margin: 0 0 16px;
		padding: 0;
		min-width: 0;
	}
	legend {
		font-weight: 700;
		font-size: 0.875rem;
		padding: 0;
		margin-bottom: 8px;
	}
	.opts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 8px 16px 8px 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface2);
		cursor: pointer;
	}
	label.checked {
		border: 2px solid var(--sea-text);
		font-weight: 700;
	}
	input {
		margin: 0;
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}
	label:has(input:focus-visible) {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: 2px;
	}
	input:focus-visible {
		outline: none;
	}
</style>
