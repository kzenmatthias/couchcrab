<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';

	type Props = {
		/** Visible label; also the accessible name of the switch. */
		label: string;
		/** Optional help text under the label (the accessible description). */
		description?: string;
		checked: boolean;
		onchange: (checked: boolean) => void;
		id?: string;
	};

	let { label, description, checked, onchange, id }: Props = $props();
	const uid = $props.id();
	const base = $derived(id ?? uid);
</script>

<!-- A real button with role="switch"; the state is also written out ("On" / "Off"). -->
<div class="sw-row">
	<span class="text">
		<span class="label" id="{base}-label">{label}</span>
		{#if description}<span class="desc" id="{base}-desc">{description}</span>{/if}
	</span>
	<button
		type="button"
		role="switch"
		id={base}
		aria-checked={checked}
		aria-labelledby="{base}-label"
		aria-describedby={description ? `${base}-desc` : undefined}
		onclick={() => onchange(!checked)}
	>
		<span class="track" aria-hidden="true"><span class="knob"></span></span>
		<span class="state" aria-hidden="true">{checked ? m.switch_on() : m.switch_off()}</span>
	</button>
</div>

<style>
	.sw-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px 20px;
		padding: 12px 0;
		border-bottom: 1px solid var(--line);
	}
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.desc {
		color: var(--muted);
		font-size: 0.8125rem;
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		min-width: 44px;
		padding: 4px;
		background: none;
		border: 0;
		border-radius: 999px;
		flex: 0 0 auto;
	}
	.track {
		position: relative;
		width: 44px;
		height: 26px;
		border-radius: 999px;
		background: var(--sw-off);
		border: 2px solid var(--sw-off);
	}
	.knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--sw-knob);
		transition: transform 0.15s;
	}
	[aria-checked='true'] .track {
		background: var(--sw-on);
		border-color: var(--sw-on);
	}
	[aria-checked='true'] .knob {
		transform: translateX(18px);
	}
	.state {
		min-width: 2.2em;
		font-size: 0.8125rem;
		font-weight: 700;
		text-align: start;
	}
</style>
