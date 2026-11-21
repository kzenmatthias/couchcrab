<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import { locales } from '#lib/paraglide/runtime.js';
	import PosterArt from '#lib/components/PosterArt.svelte';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import { kindLabel, statusLabel } from '#lib/labels.js';
	import { MOTIFS, PALETTES } from '#lib/poster-art.js';
	import { slugify } from '#lib/slug.js';
	import ErrorSummary from '../ui/ErrorSummary.svelte';
	import Field from '../ui/Field.svelte';
	import type { Errors } from '../ui/errors.js';

	type Values = Record<string, string | string[] | undefined>;
	type Creator = { id: number; name: string; color: string; avatarUrl: string | null };

	type Props = {
		values: Values;
		errors: Errors;
		creators: Creator[];
		isNew: boolean;
		submitLabel: string;
	};

	let { values, errors, creators, isNew, submitLabel }: Props = $props();

	const str = (v: Values[string]) => (typeof v === 'string' ? v : '');
	const list = (v: Values[string]) => (Array.isArray(v) ? v : v ? [v] : []);

	let title = $state(untrack(() => str(values.title)));
	let slug = $state(untrack(() => str(values.slug)));
	let slugEdited = $state(untrack(() => !isNew || str(values.slug) !== ''));
	let posterType = $state(untrack(() => str(values.poster_type) || 'art'));
	let palette = $state(untrack(() => str(values.palette) || 'meadow'));
	let motif = $state(untrack(() => str(values.motif)));
	let seed = $state(untrack(() => Number(str(values.seed)) || 1));
	let posterUrl = $state(untrack(() => str(values.poster_url)));
	let filter = $state('');
	const selected = new SvelteSet(untrack(() => list(values.creators)));

	const shownSlug = $derived(slugEdited ? slug : slugify(title));
	const shown = $derived(
		creators.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()))
	);

	const KINDS = ['season', 'live_series', 'event', 'other'] as const;
	const STATUSES = ['upcoming', 'ongoing', 'ended'] as const;
	const GROUPINGS = [
		['week', m.manage_grouping_week],
		['session', m.manage_grouping_session],
		['none', m.manage_grouping_none]
	] as const;
	const localeName: Record<string, () => string> = { en: m.language_en, nl: m.language_nl };
	const paletteName: Record<string, () => string> = {
		meadow: m.manage_palette_meadow,
		dusk: m.manage_palette_dusk,
		ember: m.manage_palette_ember,
		tide: m.manage_palette_tide,
		amber: m.manage_palette_amber,
		gold: m.manage_palette_gold,
		night: m.manage_palette_night,
		forest: m.manage_palette_forest,
		violet: m.manage_palette_violet
	};
	const motifName: Record<string, () => string> = {
		tree: m.manage_motif_tree,
		heart: m.manage_motif_heart,
		hearts2: m.manage_motif_hearts2,
		hearts3: m.manage_motif_hearts3,
		crown: m.manage_motif_crown,
		hourglass: m.manage_motif_hourglass,
		card: m.manage_motif_card
	};

	const labels = $derived({
		title: m.manage_field_title(),
		slug: m.manage_field_slug(),
		kind: m.manage_field_series_kind(),
		status: m.manage_field_status(),
		grouping: m.manage_field_grouping(),
		started_at: m.manage_field_started(),
		ended_at: m.manage_field_ended(),
		creators: m.manage_field_participants(),
		poster_type: m.manage_field_poster(),
		palette: m.manage_field_palette(),
		motif: m.manage_field_motif(),
		seed: m.manage_field_seed(),
		poster_url: m.manage_field_poster_url(),
		...Object.fromEntries(
			locales.map((l) => [
				`description_${l}`,
				m.manage_field_description({ language: localeName[l]?.() ?? l })
			])
		)
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
	<Field name="title" label={labels.title} hint={m.manage_hint_title()} {errors} required>
		{#snippet children(a)}
			<input {...a} type="text" required maxlength="120" bind:value={title} autocomplete="off" />
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
	<div class="cols">
		<Field name="kind" label={labels.kind} {errors} required>
			{#snippet children(a)}
				<select {...a} required>
					{#each KINDS as k (k)}
						<option value={k} selected={str(values.kind) === k}>{kindLabel(k)}</option>
					{/each}
				</select>
			{/snippet}
		</Field>
		<Field name="status" label={labels.status} {errors}>
			{#snippet children(a)}
				<select {...a}>
					{#each STATUSES as s (s)}
						<option value={s} selected={(str(values.status) || 'ongoing') === s}>
							{statusLabel(s)}
						</option>
					{/each}
				</select>
			{/snippet}
		</Field>
		<Field name="grouping" label={labels.grouping} hint={m.manage_hint_grouping()} {errors}>
			{#snippet children(a)}
				<select {...a}>
					{#each GROUPINGS as [g, label] (g)}
						<option value={g} selected={(str(values.grouping) || 'week') === g}>{label()}</option>
					{/each}
				</select>
			{/snippet}
		</Field>
	</div>
	<div class="cols">
		<Field name="started_at" label={labels.started_at} {errors}>
			{#snippet children(a)}
				<input {...a} type="date" value={str(values.started_at)} />
			{/snippet}
		</Field>
		<Field name="ended_at" label={labels.ended_at} hint={m.manage_hint_ended()} {errors}>
			{#snippet children(a)}
				<input {...a} type="date" value={str(values.ended_at)} />
			{/snippet}
		</Field>
	</div>

	<fieldset>
		<legend>{m.manage_descriptions()}</legend>
		<p class="hint">{m.manage_hint_descriptions()}</p>
		{#each locales as l (l)}
			<Field
				name="description_{l}"
				label={labels[`description_${l}` as keyof typeof labels]}
				hint={l === 'en' ? undefined : m.manage_hint_fallback_en()}
				{errors}
				required={l === 'en'}
			>
				{#snippet children(a)}
					<textarea
						{...a}
						lang={l}
						rows="4"
						maxlength="2000"
						required={l === 'en'}
						placeholder={l === 'en' ? undefined : str(values.description_en)}
						value={str(values[`description_${l}`])}></textarea>
				{/snippet}
			</Field>
		{/each}
	</fieldset>

	<fieldset
		id="f-creators"
		aria-describedby="participants-hint{errors?.creators ? ' f-creators-error' : ''}"
	>
		<legend>{labels.creators}</legend>
		<p class="hint" id="participants-hint">{m.manage_hint_participants()}</p>
		{#if errors?.creators}
			<p class="error" id="f-creators-error">{m.manage_error_invalid_choice()}</p>
		{/if}
		<div class="field">
			<label for="participant-filter">{m.manage_filter_creators()}</label>
			<input id="participant-filter" type="search" bind:value={filter} autocomplete="off" />
		</div>
		<p class="muted" role="status">
			{m.manage_participants_selected({ count: selected.size })}
		</p>
		<ul class="participants plain">
			{#each creators as c (c.id)}
				<li hidden={!shown.includes(c)}>
					<input
						id="p-{c.id}"
						type="checkbox"
						name="creators"
						value={String(c.id)}
						checked={selected.has(String(c.id))}
						onchange={(e) => {
							if (e.currentTarget.checked) selected.add(String(c.id));
							else selected.delete(String(c.id));
						}}
					/>
					<label for="p-{c.id}">
						<CreatorAvatar name={c.name} color={c.color} avatarUrl={c.avatarUrl} size={22} />
						{c.name}
					</label>
				</li>
			{/each}
		</ul>
	</fieldset>

	<fieldset>
		<legend>{labels.poster_type}</legend>
		<div class="poster">
			<div class="poster-fields">
				<div class="check">
					<input
						id="poster-art"
						type="radio"
						name="poster_type"
						value="art"
						bind:group={posterType}
					/>
					<label for="poster-art">{m.manage_poster_art()}</label>
				</div>
				<div class="check">
					<input
						id="poster-image"
						type="radio"
						name="poster_type"
						value="image"
						bind:group={posterType}
					/>
					<label for="poster-image">{m.manage_poster_image()}</label>
				</div>
				{#if posterType === 'art'}
					<Field name="palette" label={labels.palette} {errors}>
						{#snippet children(a)}
							<select {...a} bind:value={palette}>
								{#each Object.keys(PALETTES) as p (p)}
									<option value={p}>{paletteName[p]?.() ?? p}</option>
								{/each}
							</select>
						{/snippet}
					</Field>
					<Field name="motif" label={labels.motif} {errors}>
						{#snippet children(a)}
							<select {...a} bind:value={motif}>
								<option value="">{m.manage_motif_default()}</option>
								{#each MOTIFS as mo (mo)}
									<option value={mo}>{motifName[mo]?.() ?? mo}</option>
								{/each}
							</select>
						{/snippet}
					</Field>
					<Field name="seed" label={labels.seed} hint={m.manage_hint_seed()} {errors}>
						{#snippet children(a)}
							<input {...a} type="number" min="1" max="9999" bind:value={seed} />
						{/snippet}
					</Field>
				{:else}
					<Field
						name="poster_url"
						label={labels.poster_url}
						hint={m.manage_hint_poster_url()}
						{errors}
						required
					>
						{#snippet children(a)}
							<input {...a} type="url" maxlength="500" bind:value={posterUrl} required />
						{/snippet}
					</Field>
				{/if}
			</div>
			<figure class="preview">
				<div class="frame">
					{#if posterType === 'image' && posterUrl}
						<img src={posterUrl} alt="" />
					{:else}
						<PosterArt {palette} seed={seed || 1} motif={motif || null} />
					{/if}
					<span class="ttl">{title || m.manage_field_title()}</span>
				</div>
				<figcaption>{m.manage_poster_preview()}</figcaption>
			</figure>
		</div>
	</fieldset>

	<div class="actions">
		<button type="submit" class="btn primary">{submitLabel}</button>
	</div>
</form>

<style>
	.cols {
		display: flex;
		gap: 0 20px;
		flex-wrap: wrap;
	}
	.cols :global(.field) {
		flex: 1 1 12rem;
	}
	.participants {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(14rem, 100%), 1fr));
		gap: 4px 16px;
		margin: 0 0 12px;
	}
	.participants li {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
	}
	.participants li[hidden] {
		display: none;
	}
	.participants label {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.poster {
		display: flex;
		gap: 24px;
		flex-wrap: wrap;
	}
	.poster-fields {
		flex: 1 1 16rem;
	}
	.preview {
		margin: 0 0 12px;
	}
	.frame {
		position: relative;
		width: 160px;
		height: 240px;
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--surface);
	}
	.frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.ttl {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 24px 10px 10px;
		background: linear-gradient(transparent, var(--scrim));
		color: #fff;
		font-weight: 800;
		line-height: 1.2;
	}
	figcaption {
		font-size: 0.8125rem;
		color: var(--muted);
		margin-top: 6px;
	}
</style>
