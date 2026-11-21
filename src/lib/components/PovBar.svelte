<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getViewing } from '#lib/prefs/store.svelte.js';
	import type { CreatorRef } from '#lib/video.js';
	import CreatorAvatar from './CreatorAvatar.svelte';

	type Props = {
		series: { id: number; slug: string };
		/** The creators of this series. */
		creators: CreatorRef[];
	};

	let { series, creators }: Props = $props();

	const viewing = getViewing();
	const list = $derived(viewing.watching(series.id));
	const custom = $derived(viewing.isCustom(series.id));
	const shown = $derived(creators.filter((c) => list === null || list.includes(c.id)));
	const AVATARS = 6;
</script>

<section class="pov" aria-labelledby="pov-h">
	<div class="avs" aria-hidden="true">
		{#each shown.slice(0, AVATARS) as c (c.id)}
			<CreatorAvatar name={c.name} color={c.color} avatarUrl={c.avatarUrl} size={30} />
		{/each}
		{#if shown.length > AVATARS}<span class="more">+{shown.length - AVATARS}</span>{/if}
	</div>
	<div class="txt">
		<h2 id="pov-h">
			{m.pov_watching({ count: shown.length, total: creators.length })}
		</h2>
		<p>
			<span class="badge" class:custom>
				{custom ? m.pov_badge_custom() : m.pov_badge_global()}
			</span>
			<span class="note">{custom ? m.pov_note_custom() : m.pov_note_global()}</span>
		</p>
	</div>
	<div class="acts">
		<a class="btn ghost" href={resolve('/(site)/settings/creators/[slug]', { slug: series.slug })}>
			{m.pov_change()}
		</a>
		{#if custom}
			<button
				type="button"
				class="btn ghost"
				onclick={() => viewing.setSeriesMode(series.id, 'global', [])}
			>
				{m.pov_reset()}
			</button>
		{/if}
	</div>
</section>

<style>
	.pov {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 20px;
		margin: 0 var(--page-pad) 24px;
		padding: 14px 20px;
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}
	.avs {
		display: flex;
	}
	.avs > :global(.av) {
		border: 2px solid var(--surface);
		margin-inline-start: -8px;
	}
	.avs > :global(.av:first-child) {
		margin-inline-start: 0;
	}
	.more {
		align-self: center;
		margin-inline-start: 6px;
		font-size: 0.8125rem;
		font-weight: 700;
	}
	.txt {
		flex: 1 1 14rem;
		min-width: 0;
	}
	h2 {
		font-size: 1rem;
		margin: 0;
	}
	.txt p {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		align-items: center;
		margin: 4px 0 0;
		font-size: 0.8125rem;
		color: var(--muted);
	}
	.badge {
		border: 1px solid var(--sea-text);
		color: var(--sea-text);
		border-radius: 999px;
		padding: 1px 10px;
	}
	.badge.custom {
		border-color: var(--accent-text);
		color: var(--accent-text);
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
