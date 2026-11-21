<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import { contrastRatio, isHexColor } from '#lib/color.js';
	import { slugify } from '#lib/slug.js';
	import { textOn } from '#lib/video.js';
	import ErrorSummary from '../ui/ErrorSummary.svelte';
	import Field from '../ui/Field.svelte';
	import type { Errors } from '../ui/errors.js';

	type Values = Record<string, string | string[] | boolean | null | undefined>;

	type Props = {
		values: Values;
		errors: Errors;
		isAdmin: boolean;
		/** Claimed profile edited by an editor: colour, avatar and bio belong to the creator. */
		locked: boolean;
		/** New creator: the slug follows the name until someone edits it. */
		isNew: boolean;
		submitLabel: string;
	};

	let { values, errors, isAdmin, locked, isNew, submitLabel }: Props = $props();

	const str = (v: Values[string]) => (typeof v === 'string' ? v : '');
	let name = $state(untrack(() => str(values.name)));
	let slug = $state(untrack(() => str(values.slug)));
	let slugEdited = $state(untrack(() => !isNew || str(values.slug) !== ''));
	let color = $state(untrack(() => str(values.color) || '#7bd389'));
	let avatarUrl = $state(untrack(() => str(values.avatar_url)));

	const shownSlug = $derived(slugEdited ? slug : slugify(name));
	const valid = $derived(isHexColor(color));
	const onAvatar = $derived(valid ? contrastRatio(color, textOn(color)) : null);
	const onDark = $derived(valid ? contrastRatio(color, '#07131a') : null);
	const onLight = $derived(valid ? contrastRatio(color, '#faf7f2') : null);
	const fmt = (n: number | null) => (n === null ? '–' : `${n.toFixed(1)}:1`);

	const labels = $derived({
		name: m.manage_field_name(),
		slug: m.manage_field_slug(),
		color: m.manage_field_color(),
		avatar_url: m.manage_field_avatar(),
		bio: m.manage_field_bio(),
		opted_out: m.manage_field_opted_out()
	});
</script>

<ErrorSummary {errors} {labels} />

<form
	method="post"
	action="?/save"
	use:enhance={() =>
		({ update }) =>
			update({ reset: false })}
>
	<Field name="name" label={labels.name} {errors} required>
		{#snippet children(a)}
			<input {...a} type="text" required maxlength="80" bind:value={name} autocomplete="off" />
		{/snippet}
	</Field>

	<Field name="slug" label={labels.slug} hint={m.manage_hint_slug()} {errors}>
		{#snippet children(a)}
			<input
				{...a}
				type="text"
				maxlength="80"
				value={shownSlug}
				oninput={(e) => {
					slug = e.currentTarget.value;
					slugEdited = true;
				}}
				autocomplete="off"
				spellcheck="false"
			/>
		{/snippet}
	</Field>

	{#if locked}
		<p class="locked">{m.manage_claimed_locked_note()}</p>
		<input type="hidden" name="color" value={color} />
		<input type="hidden" name="avatar_url" value={avatarUrl} />
		<input type="hidden" name="bio" value={str(values.bio)} />
		<dl class="readonly">
			<dt>{labels.color}</dt>
			<dd><code>{color}</code></dd>
			<dt>{labels.avatar_url}</dt>
			<dd>{avatarUrl || m.manage_none()}</dd>
			<dt>{labels.bio}</dt>
			<dd>{str(values.bio) || m.manage_none()}</dd>
		</dl>
	{:else}
		<Field name="color" label={labels.color} hint={m.manage_hint_color()} {errors} required>
			{#snippet children(a)}
				<input {...a} type="color" bind:value={color} />
			{/snippet}
		</Field>
		<Field name="avatar_url" label={labels.avatar_url} hint={m.manage_hint_avatar()} {errors}>
			{#snippet children(a)}
				<input {...a} type="url" maxlength="500" bind:value={avatarUrl} />
			{/snippet}
		</Field>
		<Field name="bio" label={labels.bio} hint={m.manage_hint_bio()} {errors}>
			{#snippet children(a)}
				<textarea {...a} maxlength="500" rows="3" value={str(values.bio)}></textarea>
			{/snippet}
		</Field>
	{/if}

	<section class="preview" aria-labelledby="avatar-preview-title">
		<h2 id="avatar-preview-title">{m.manage_avatar_preview()}</h2>
		<div class="row">
			<CreatorAvatar name={name || '?'} {color} avatarUrl={avatarUrl || null} size={56} />
			<CreatorAvatar name={name || '?'} {color} size={56} />
			<span class="nm">{name || m.manage_field_name()}</span>
		</div>
		<ul class="ratios">
			<li>
				{m.manage_contrast_initials({ ratio: fmt(onAvatar) })}
				{(onAvatar ?? 0) >= 4.5 ? m.manage_contrast_pass() : m.manage_contrast_fail()}
			</li>
			<li>
				{m.manage_contrast_dark({ ratio: fmt(onDark) })}
				{(onDark ?? 0) >= 3 ? m.manage_contrast_pass() : m.manage_contrast_low()}
			</li>
			<li>
				{m.manage_contrast_light({ ratio: fmt(onLight) })}
				{(onLight ?? 0) >= 3 ? m.manage_contrast_pass() : m.manage_contrast_low()}
			</li>
		</ul>
	</section>

	{#if isAdmin}
		<div class="check">
			<input
				id="f-opted_out"
				type="checkbox"
				name="opted_out"
				value="1"
				checked={values.opted_out === true || values.opted_out === '1'}
				aria-describedby="f-opted_out-hint"
			/>
			<label for="f-opted_out">{labels.opted_out}</label>
		</div>
		<p class="hint" id="f-opted_out-hint">{m.manage_hint_opted_out()}</p>
	{/if}

	<div class="actions">
		<button type="submit" class="btn primary">{submitLabel}</button>
	</div>
</form>

<style>
	.locked {
		border-left: 4px solid var(--sand);
		padding: 6px 12px;
		max-width: 40rem;
	}
	.readonly {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 6px 16px;
		margin: 0 0 18px;
	}
	dt {
		font-weight: 700;
	}
	dd {
		margin: 0;
	}
	.preview {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 4px 16px 8px;
		margin: 0 0 18px;
		max-width: 36rem;
	}
	.preview h2 {
		font-size: 1rem;
		margin: 10px 0;
	}
	.row {
		display: flex;
		gap: 14px;
		align-items: center;
	}
	.nm {
		font-weight: 700;
	}
	.ratios {
		margin: 10px 0 4px;
		padding-left: 1.2em;
		font-size: 0.875rem;
	}
</style>
