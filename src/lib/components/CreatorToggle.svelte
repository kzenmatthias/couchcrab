<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import CreatorAvatar from './CreatorAvatar.svelte';

	type Props = {
		creator: { name: string; color: string; avatarUrl: string | null };
		pressed: boolean;
		onclick: () => void;
	};

	let { creator, pressed, onclick }: Props = $props();
</script>

<!--
	A toggle button: the name is the accessible name, aria-pressed carries the state, and the
	state is also written out ("Watching" / "Add") for sighted users.
-->
<button type="button" class="ct" aria-pressed={pressed} {onclick}>
	<CreatorAvatar
		name={creator.name}
		color={creator.color}
		avatarUrl={creator.avatarUrl}
		size={72}
	/>
	<span class="name">{creator.name}</span>
	<span class="state" aria-hidden="true">
		{pressed ? `✓ ${m.creator_toggle_watching()}` : `+ ${m.creator_toggle_add()}`}
	</span>
</button>

<style>
	.ct {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 10px 6px;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-lg);
		text-align: center;
	}
	.ct:hover .name {
		text-decoration: underline;
	}
	.ct :global(.av) {
		outline: 3px solid transparent;
		outline-offset: 3px;
		filter: grayscale(0.85);
		opacity: 0.75;
	}
	.ct[aria-pressed='true'] :global(.av) {
		outline-color: var(--sea-text);
		filter: none;
		opacity: 1;
	}
	.name {
		font-size: 0.875rem;
		overflow-wrap: anywhere;
	}
	.state {
		font-size: 0.75rem;
		font-weight: 700;
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 1px 10px;
	}
	[aria-pressed='true'] .state {
		border-color: var(--sea-text);
		color: var(--sea-text);
	}
</style>
