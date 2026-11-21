<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
</script>

<span class="verified"><span aria-hidden="true">✓</span> {m.creator_verified()}</span>

<style>
	.verified {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--sea-text);
		border: 1px solid var(--sea-text);
		border-radius: 999px;
		padding: 1px 8px;
		text-shadow: none;
	}
</style>
