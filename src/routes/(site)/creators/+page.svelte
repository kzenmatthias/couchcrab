<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import VerifiedBadge from '#lib/components/VerifiedBadge.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.creators_list_title()} · {m.site_name()}</title>
</svelte:head>

<div class="page">
	<h1>{m.creators_list_title()}</h1>
	{#if data.creators.length}
		<ul class="grid">
			{#each data.creators as c (c.slug)}
				<li>
					<a href={resolve('/(site)/creators/[slug]', { slug: c.slug })}>
						<CreatorAvatar name={c.name} color={c.color} avatarUrl={c.avatarUrl} size={96} />
						<span class="name">{c.name}</span>
					</a>
					{#if c.claimedAt}<VerifiedBadge />{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p>{m.creators_empty()}</p>
	{/if}
</div>

<style>
	.page {
		padding: 32px var(--page-pad) 0;
	}
	h1 {
		font-size: clamp(2rem, 5vw, 3rem);
		letter-spacing: -0.03em;
		margin: 0 0 32px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 28px 12px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		text-align: center;
	}
	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 8px;
		border-radius: 14px;
		text-decoration: none;
	}
	a:hover .name {
		text-decoration: underline;
	}
	.name {
		font-weight: 700;
	}
</style>
