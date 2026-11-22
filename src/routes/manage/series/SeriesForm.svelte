<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import { locales } from '#lib/paraglide/runtime.js';
	import CreatorAvatar from '#lib/components/CreatorAvatar.svelte';
	import PosterImage from '#lib/components/PosterImage.svelte';
	import { kindLabel, statusLabel } from '#lib/labels.js';
	import {
		frameUrls,
		isPosterFrame,
		POSTER_FRAMES,
		type PosterFrame,
		posterSources,
		posterSurface,
		type PosterView
	} from '#lib/poster.js';
	import { isRealYoutubeId } from '#lib/video.js';
	import { slugify } from '#lib/slug.js';
	import ErrorSummary from '../ui/ErrorSummary.svelte';
	import Field from '../ui/Field.svelte';
	import type { Errors } from '../ui/errors.js';

	type Values = Record<string, string | string[] | undefined>;
	type Creator = { id: number; name: string; color: string; avatarUrl: string | null };
	/** An episode that can be the poster (`posterVideoChoices`), oldest first. */
	type PosterVideo = { youtubeVideoId: string; title: string; creator: string };

	type Props = {
		values: Values;
		errors: Errors;
		creators: Creator[];
		isNew: boolean;
		submitLabel: string;
		/** Episodes of this series to choose the poster from. Empty for a new series. */
		posterVideos?: PosterVideo[];
		/** What the automatic poster shows now, for the preview. */
		autoPoster?: PosterView;
	};

	let {
		values,
		errors,
		creators,
		isNew,
		submitLabel,
		posterVideos = [],
		autoPoster = null
	}: Props = $props();

	const str = (v: Values[string]) => (typeof v === 'string' ? v : '');
	const list = (v: Values[string]) => (Array.isArray(v) ? v : v ? [v] : []);

	let title = $state(untrack(() => str(values.title)));
	let slug = $state(untrack(() => str(values.slug)));
	let slugEdited = $state(untrack(() => !isNew || str(values.slug) !== ''));
	let posterType = $state(
		untrack(() => (str(values.poster_type) === 'art' ? '' : str(values.poster_type)) || 'auto')
	);
	let posterVideo = $state(
		untrack(() => str(values.poster_video) || posterVideos[0]?.youtubeVideoId || '')
	);
	let posterFrame = $state<PosterFrame>(
		untrack(() => {
			const f = str(values.poster_frame);
			return isPosterFrame(f) ? f : 'thumbnail';
		})
	);
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
	const frameLabel = (f: PosterFrame) =>
		f === 'thumbnail' ? m.manage_poster_frame_thumbnail() : m.manage_poster_frame_n({ number: f });

	/** The stored video may no longer be in the list (moved or ignored): keep it as a choice. */
	const videoChoices = $derived(
		posterVideo && !posterVideos.some((v) => v.youtubeVideoId === posterVideo)
			? [{ youtubeVideoId: posterVideo, title: posterVideo, creator: '' }, ...posterVideos]
			: posterVideos
	);
	const preview = $derived<PosterView>(
		posterType === 'image'
			? posterUrl
				? { kind: 'image', url: posterUrl }
				: null
			: posterType === 'video' && posterVideo
				? { kind: 'video', youtubeVideoId: posterVideo, frame: posterFrame }
				: posterType === 'auto'
					? autoPoster
					: null
	);

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
		poster_video: m.manage_field_poster_video(),
		poster_frame: m.manage_field_poster_frame(),
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

	<fieldset id="f-poster_type">
		<legend>{labels.poster_type}</legend>
		<div class="poster">
			<div class="poster-fields">
				<div class="check">
					<input
						id="poster-auto"
						type="radio"
						name="poster_type"
						value="auto"
						aria-describedby="poster-auto-hint"
						bind:group={posterType}
					/>
					<label for="poster-auto">{m.manage_poster_auto()}</label>
				</div>
				<p class="hint indent" id="poster-auto-hint">{m.manage_hint_poster_auto()}</p>
				<div class="check">
					<input
						id="poster-video"
						type="radio"
						name="poster_type"
						value="video"
						bind:group={posterType}
					/>
					<label for="poster-video">{m.manage_poster_video()}</label>
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
				{#if posterType === 'video'}
					{#if videoChoices.length === 0}
						<p class="hint" id="f-poster_video">{m.manage_poster_no_videos()}</p>
					{:else}
						<Field
							name="poster_video"
							label={labels.poster_video}
							hint={m.manage_hint_poster_video()}
							{errors}
							required
						>
							{#snippet children(a)}
								<select {...a} bind:value={posterVideo} required>
									{#each videoChoices as v (v.youtubeVideoId)}
										<option value={v.youtubeVideoId}>
											{v.creator
												? m.manage_poster_video_option({ title: v.title, creator: v.creator })
												: v.title}
										</option>
									{/each}
								</select>
							{/snippet}
						</Field>
						<fieldset id="f-poster_frame" class="frames" aria-describedby="poster-frame-hint">
							<legend>{labels.poster_frame}</legend>
							<p class="hint" id="poster-frame-hint">{m.manage_hint_poster_frame()}</p>
							<ul class="plain frame-list">
								{#each POSTER_FRAMES as f (f)}
									<li>
										<input
											id="poster-frame-{f}"
											type="radio"
											name="poster_frame"
											value={f}
											bind:group={posterFrame}
										/>
										<label for="poster-frame-{f}">
											<span class="still" aria-hidden="true">
												{#if isRealYoutubeId(posterVideo)}
													<PosterImage sources={frameUrls(posterVideo, f)} />
												{/if}
											</span>
											<span>{frameLabel(f)}</span>
										</label>
									</li>
								{/each}
							</ul>
						</fieldset>
					{/if}
				{:else if posterType === 'image'}
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
				<div class="frame" style:background-color={posterSurface(shownSlug || title)}>
					<PosterImage sources={posterSources(preview)} />
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
	.indent {
		margin: -4px 0 8px 30px;
	}
	.frames {
		margin-top: 8px;
	}
	.frame-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(9rem, 100%), 1fr));
		gap: 12px;
	}
	.frame-list li {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.frame-list input {
		margin-top: 4px;
		width: 24px;
		height: 24px;
		flex: 0 0 auto;
	}
	.frame-list label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
	}
	.still {
		position: relative;
		display: block;
		aspect-ratio: 16 / 9;
		border-radius: 6px;
		overflow: hidden;
		background: var(--surface2);
		border: 1px solid var(--line);
	}
	.ttl {
		position: absolute;
		z-index: 1;
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
