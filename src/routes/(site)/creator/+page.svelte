<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import VerifiedBadge from '#lib/components/VerifiedBadge.svelte';
	import {
		INITIALS_MIN_CONTRAST,
		initialsContrast,
		PROFILE_COLORS,
		type ProfileColorKey
	} from '#lib/creator-colors.js';
	import ConfirmPanel from '../../manage/ui/ConfirmPanel.svelte';
	import ErrorSummary from '../../manage/ui/ErrorSummary.svelte';
	import Field from '../../manage/ui/Field.svelte';
	import Flash from '../../manage/ui/Flash.svelte';
	import { errorId, errorMessage } from '../../manage/ui/errors.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const c = $derived(data.creator);

	const colorName: Record<ProfileColorKey, () => string> = {
		teal: m.creator_color_teal,
		green: m.creator_color_green,
		sky: m.creator_color_sky,
		violet: m.creator_color_violet,
		pink: m.creator_color_pink,
		coral: m.creator_color_coral,
		red: m.creator_color_red,
		gold: m.creator_color_gold,
		plum: m.creator_color_plum,
		forest: m.creator_color_forest,
		navy: m.creator_color_navy,
		slate: m.creator_color_slate
	};

	type Values = Record<string, string | string[]>;
	const str = (v: Values[string] | undefined) => (typeof v === 'string' ? v : '');
	const failed = $derived(form?.action === 'save' && form.values ? form.values : null);
	const errors = $derived(form?.action === 'save' ? form.errors : null);

	let color = $state(untrack(() => data.creator.color));
	let avatarUrl = $state(untrack(() => data.creator.avatarUrl ?? ''));
	// After a failed save, show what was submitted.
	$effect(() => {
		if (failed) {
			color = str(failed.color) || data.creator.color;
			avatarUrl = str(failed.avatar_url);
		}
	});

	const bio = $derived(failed ? str(failed.bio) : (c.bio ?? ''));
	const links = $derived(failed ? str(failed.links) : c.links.join('\n'));
	/** The current colour, when an admin set one that is not among the choices. */
	const customColor = $derived(
		PROFILE_COLORS.some((p) => p.hex === c.color.toLowerCase()) ? null : c.color
	);
	const ratio = $derived(initialsContrast(color));

	const labels = $derived({
		bio: m.manage_field_bio(),
		avatar_url: m.manage_field_avatar(),
		color: m.creator_field_color(),
		links: m.creator_field_links()
	});

	const flash = $derived(
		form?.saved === 'profile'
			? m.creator_profile_saved()
			: form?.saved === 'opted_out'
				? m.creator_opted_out_done()
				: form?.saved === 'opted_in'
					? m.creator_opted_in_done()
					: null
	);
	const self = $derived(resolve('/(site)/creator'));
</script>

<svelte:head>
	<title>{m.creator_dashboard_title()} · {m.site_name()}</title>
</svelte:head>

<p class="badge"><VerifiedBadge /></p>
<h1>{c.name}</h1>
<p class="lead">
	{m.creator_dashboard_lead()}
	{#if !c.optedOut}
		<a href={resolve('/(site)/creators/[slug]', { slug: c.slug })}>{m.creator_view_public()}</a>
	{/if}
</p>

<Flash message={flash} />

{#if c.optedOut}
	<section class="hidden-note" aria-labelledby="hidden-h">
		<h2 id="hidden-h">{m.creator_hidden_title()}</h2>
		<p>{m.creator_hidden_body()}</p>
		<form method="post" action="?/optIn" use:enhance>
			<button type="submit" class="btn primary">{m.creator_opt_in_button()}</button>
		</form>
	</section>
{/if}

<ErrorSummary {errors} {labels} />

<form
	method="post"
	action="?/save"
	use:enhance={() =>
		({ update }) =>
			update({ reset: false })}
>
	<h2 class="first">{m.creator_profile_heading()}</h2>
	<Field name="bio" label={labels.bio} hint={m.manage_hint_bio()} {errors}>
		{#snippet children(a)}
			<textarea {...a} maxlength="500" rows="3" defaultValue={bio}></textarea>
		{/snippet}
	</Field>

	<Field name="avatar_url" label={labels.avatar_url} hint={m.manage_hint_avatar()} {errors}>
		{#snippet children(a)}
			<input {...a} type="url" maxlength="500" bind:value={avatarUrl} autocomplete="url" />
		{/snippet}
	</Field>

	<fieldset aria-describedby="color-hint{errors?.color ? ` ${errorId('color')}` : ''}">
		<legend>{labels.color}</legend>
		<p class="hint" id="color-hint">{m.creator_color_hint()}</p>
		{#if errors?.color}
			<p class="error" id={errorId('color')}>{errorMessage(errors.color)}</p>
		{/if}
		<div class="swatches">
			{#if customColor}
				<label class="swatch">
					<input type="radio" name="color" value={customColor} id="f-color" bind:group={color} />
					<span class="chip" style:--c={customColor} aria-hidden="true"></span>
					{m.creator_color_current()}
				</label>
			{/if}
			{#each PROFILE_COLORS as p, i (p.key)}
				<label class="swatch">
					<input
						type="radio"
						name="color"
						value={p.hex}
						id={i === 0 && !customColor ? 'f-color' : undefined}
						bind:group={color}
					/>
					<span class="chip" style:--c={p.hex} aria-hidden="true"></span>
					{colorName[p.key]()}
				</label>
			{/each}
		</div>
	</fieldset>

	<section class="preview" aria-labelledby="preview-h">
		<h3 id="preview-h">{m.manage_avatar_preview()}</h3>
		<div class="row">
			<CreatorAvatar name={c.name} {color} avatarUrl={avatarUrl || null} size={56} />
			<CreatorAvatar name={c.name} {color} size={56} />
			<span class="nm">{c.name}</span>
		</div>
		<p class="hint">
			{m.manage_contrast_initials({ ratio: `${ratio.toFixed(1)}:1` })}
			{ratio >= INITIALS_MIN_CONTRAST ? m.manage_contrast_pass() : m.manage_contrast_fail()}
		</p>
	</section>

	<Field name="links" label={labels.links} hint={m.creator_hint_links()} {errors}>
		{#snippet children(a)}
			<textarea {...a} rows="3" defaultValue={links} spellcheck="false"></textarea>
		{/snippet}
	</Field>

	<div class="actions">
		<button type="submit" class="btn primary">{m.creator_save_profile()}</button>
	</div>
</form>

<section class="videos" aria-labelledby="videos-h">
	<h2 id="videos-h">{m.creator_your_videos()}</h2>
	<p class="muted">{m.creator_unsorted_count({ count: data.unsorted })}</p>
	<a class="btn ghost" href={resolve('/(site)/creator/videos')}>{m.creator_place_videos()}</a>
</section>

{#if !c.optedOut}
	{#if form?.confirm === 'optOut'}
		<ConfirmPanel
			title={m.creator_opt_out_confirm_title()}
			action="?/optOut"
			confirmLabel={m.creator_opt_out_confirm()}
			cancelHref={self}
		>
			<p>{m.creator_opt_out_confirm_body()}</p>
		</ConfirmPanel>
	{:else}
		<section class="danger" aria-labelledby="optout-h">
			<h2 id="optout-h">{m.creator_opt_out_title()}</h2>
			<p>{m.creator_opt_out_body()}</p>
			<form method="post" action="?/askOptOut" use:enhance>
				<button type="submit" class="btn ghost">{m.creator_opt_out_button()}</button>
			</form>
		</section>
	{/if}
{/if}

<style>
	.badge {
		margin: 0;
	}
	h2.first {
		margin-top: 0;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 8px;
	}
	.swatch {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 6px 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		cursor: pointer;
		font-weight: 400;
	}
	.swatch:has(input:checked) {
		border: 2px solid var(--text);
		font-weight: 700;
	}
	.chip {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--c);
		border: 1px solid var(--line);
	}
	.preview {
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 4px 16px 12px;
		margin: 0 0 18px;
		max-width: 36rem;
	}
	.preview h3 {
		font-size: 1rem;
		margin: 10px 0 8px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 8px;
	}
	.nm {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.danger,
	.hidden-note {
		border: 2px solid var(--accent);
		border-radius: var(--radius-lg);
		padding: 4px 20px 16px;
		margin: 32px 0 24px;
		max-width: 40rem;
	}
	.hidden-note {
		margin-top: 0;
	}
	.danger h2,
	.hidden-note h2 {
		margin-top: 16px;
	}
</style>
