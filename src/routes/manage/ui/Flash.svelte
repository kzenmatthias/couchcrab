<script lang="ts">
	type Props = { message: string | null | undefined };
	let { message }: Props = $props();
</script>

<!-- Success messages after a save; a live region so screen readers hear them. -->
<div class="flash-region" role="status">
	{#if message}<p class="flash">{message}</p>{/if}
</div>

<style>
	.flash {
		border: 1px solid var(--line);
		border-left: 4px solid var(--sw-on);
		border-radius: var(--radius);
		background: var(--surface2);
		padding: 10px 14px;
		margin: 0 0 20px;
	}
</style>
