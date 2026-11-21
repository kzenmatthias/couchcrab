<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { FieldChange } from '#lib/community/change.js';
	import { fieldLabel, valText } from '#lib/community/labels.js';

	type Props = { changes: FieldChange[] };
	let { changes }: Props = $props();
	const locale = getLocale();
</script>

<!-- Before and After are written out: the meaning never depends on colour or strike-through. -->
{#if changes.length}
	<div class="diff">
		{#each changes as ch, i (i)}
			<div class="row">
				<p class="f">{fieldLabel(ch.field, ch.locale)}</p>
				<p>
					<span class="w">{m.community_before()}:</span>
					<del>{valText(ch.before, locale)}</del>
				</p>
				<p>
					<span class="w">{m.community_after()}:</span>
					<ins>{valText(ch.after, locale)}</ins>
				</p>
			</div>
		{/each}
	</div>
{/if}

<style>
	.diff {
		margin: 10px 0;
		background: var(--surface2);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 0.9375rem;
		overflow-wrap: anywhere;
	}
	p {
		margin: 0;
	}
	.f {
		font-weight: 700;
	}
	.w {
		display: inline-block;
		min-width: 3.5em;
		color: var(--muted);
	}
	del {
		text-decoration: line-through;
	}
	ins {
		text-decoration: none;
		font-weight: 700;
	}
</style>
