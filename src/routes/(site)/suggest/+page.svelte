<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { kindLabel, statusLabel } from '#lib/labels.js';
	import { communityError, errorId, fieldId } from '#lib/community/errors.js';
	import { fieldLabel, groupLabel, suggestionTypeLabel } from '#lib/community/labels.js';
	import ErrorSummary from '#lib/components/community/ErrorSummary.svelte';
	import FormStyles from '#lib/components/community/FormStyles.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = getLocale();

	const SERIES_TYPES = ['series_field', 'participant', 'rule', 'other'];
	const CREATOR_TYPES = ['creator_field', 'participant', 'rule', 'other'];
	const VIDEO_TYPES = [
		'video_series',
		'video_group',
		'video_live_vod',
		'video_captions',
		'video_ignore',
		'other'
	];

	const target = $derived(data.target);
	const types = $derived(
		!target
			? []
			: target.type === 'video'
				? VIDEO_TYPES
				: target.type === 'series'
					? SERIES_TYPES
					: CREATOR_TYPES
	);
	const values = $derived((form && 'values' in form ? form.values : {}) as Record<string, unknown>);
	const errors = $derived(
		(form && 'errors' in form ? form.errors : null) as Record<string, string> | null
	);
	const v = (name: string) => {
		const value = values[name];
		return typeof value === 'string' ? value : '';
	};

	// Without JavaScript every part of the form is visible; with it only the chosen part.
	let enhanced = $state(false);
	let chosen = $state('');
	let field = $state('');
	onMount(() => {
		enhanced = true;
	});
	$effect(() => {
		chosen = v('type');
		field = v('field');
	});
	const shown = (type: string) => !enhanced || chosen === type;

	const attrs = (name: string, hint = false) => ({
		id: fieldId(name),
		name,
		'aria-invalid': errors?.[name] ? ('true' as const) : undefined,
		'aria-describedby':
			[hint ? `${fieldId(name)}-hint` : null, errors?.[name] ? errorId(name) : null]
				.filter(Boolean)
				.join(' ') || undefined
	});

	const back = $derived(
		!target
			? resolve('/(site)')
			: target.type === 'video'
				? resolve('/(site)/watch/[videoId]', { videoId: target.key })
				: target.type === 'series'
					? resolve('/(site)/series/[slug]', { slug: target.key })
					: resolve('/(site)/creators/[slug]', { slug: target.key })
	);

	const seriesFieldLabels: Record<string, string> = {
		title: fieldLabel('title'),
		kind: fieldLabel('kind'),
		status: fieldLabel('status'),
		started_at: fieldLabel('started_at'),
		ended_at: fieldLabel('ended_at'),
		description: fieldLabel('description', 'English')
	};
	const labels = $derived<Record<string, string>>({
		form: '',
		type: m.community_suggest_type_legend(),
		series_id:
			target?.type === 'creator'
				? m.community_field_missing_series()
				: m.community_field_new_series(),
		group_id: m.community_field_group(),
		new_group_id: m.community_field_new_group(),
		captions: m.community_captions_legend(),
		field: m.community_field_which(),
		...Object.fromEntries(
			Object.entries(seriesFieldLabels).map(([k, label]) => [
				k,
				m.community_correct_value({ field: label })
			])
		),
		name: m.community_correct_value({ field: fieldLabel('name') }),
		bio: m.community_correct_value({ field: fieldLabel('bio') }),
		creator_id: m.community_field_missing_creator(),
		creator_name: m.community_field_creator_name(),
		rule_series_id: m.community_field_rule_series(),
		pattern: m.community_field_rule_pattern(),
		match: m.community_field_match(),
		rule_target: m.community_field_rule_target(),
		channel_id: m.community_field_rule_channel(),
		note: m.community_note_label()
	});
	const targets = {
		type: 'f-type-0',
		captions: 'f-captions-0',
		field: 'f-field-0',
		match: 'f-match-0',
		rule_target: 'f-rule_target-0'
	};

	const typeLabel = (type: string) => suggestionTypeLabel(type, target?.type);
	const date = (d: Date | null | undefined) =>
		d ? formatDate(d, locale, { dateStyle: 'medium', timeZone: 'UTC' }) : '';
	const placeLabel = $derived.by(() => {
		if (target?.type !== 'video') return '';
		const g = target.groups.find((x) => x.id === target.groupId);
		return g ? `${target.seriesTitle} · ${groupLabel(g)}` : target.seriesTitle;
	});
	const seriesOption = (s: { title: string; parentId: number | null }) =>
		s.parentId === null ? s.title : `— ${s.title}`;

	let thanks = $state<HTMLElement>();
	$effect(() => {
		if (form && 'sent' in form && form.sent) void tick().then(() => thanks?.focus());
	});
</script>

<svelte:head>
	<title>{m.community_suggest_title()} · {m.site_name()}</title>
</svelte:head>

{#snippet fieldError(name: string)}
	{#if errors?.[name]}<p class="error" id={errorId(name)}>{communityError(errors[name])}</p>{/if}
{/snippet}

<div class="page">
	<FormStyles>
		<h1>{m.community_suggest_title()}</h1>
		{#if !target}
			<p>{m.community_not_found()}</p>
		{:else if form && 'sent' in form && form.sent}
			<section class="thanks" tabindex="-1" bind:this={thanks} aria-labelledby="thanks-h">
				<h2 id="thanks-h">{m.community_sent_title()}</h2>
				<p>{m.community_sent_text()}</p>
				<p class="links">
					<a href={resolve('/(site)/me/suggestions')}>{m.community_my_link()}</a>
					<a href={back}>{m.community_back_to_item()}</a>
				</p>
			</section>
		{:else}
			<p class="lead">{m.community_suggest_lead()}</p>
			<p class="meta" id="target-desc">
				{#if target.type === 'video'}
					{target.title
						? m.community_suggest_for_video({
								creator: target.creatorName,
								title: target.title,
								date: date(target.publishedAt)
							})
						: m.community_suggest_for_video_hidden({
								creator: target.creatorName,
								date: date(target.publishedAt)
							})}
					<br />{m.community_suggest_now_in({ place: placeLabel })}
				{:else if target.type === 'series'}
					{m.community_suggest_for_series({ title: target.title })}
				{:else}
					{m.community_suggest_for_creator({ name: target.name })}
				{/if}
			</p>

			<ErrorSummary {errors} {labels} {targets} />

			<form method="post" novalidate use:enhance aria-describedby="target-desc">
				<fieldset aria-describedby={errors?.type ? errorId('type') : undefined}>
					<legend>{m.community_suggest_type_legend()}</legend>
					{@render fieldError('type')}
					{#each types as type, i (type)}
						<label class="radio">
							<input
								type="radio"
								name="type"
								value={type}
								id="f-type-{i}"
								checked={v('type') === type}
								onchange={() => (chosen = type)}
							/>
							{typeLabel(type)}
						</label>
					{/each}
				</fieldset>

				{#if target.type === 'video'}
					<section class="part" hidden={!shown('video_series')} aria-labelledby="p-video_series">
						<h2 id="p-video_series">
							{m.community_section_for({ type: typeLabel('video_series') })}
						</h2>
						<div class="field">
							<label for={fieldId('series_id')}>{labels.series_id}</label>
							{@render fieldError('series_id')}
							<select {...attrs('series_id')}>
								{#each target.series as s (s.id)}
									<option
										value={String(s.id)}
										selected={(v('series_id') || String(target.seriesId)) === String(s.id)}
									>
										{seriesOption(s)}
									</option>
								{/each}
							</select>
						</div>
						<div class="field">
							<label for={fieldId('group_id')}>{labels.group_id}</label>
							{@render fieldError('group_id')}
							<select {...attrs('group_id')}>
								<option value="" selected={v('group_id') === ''}>{m.community_no_group()}</option>
								{#each target.series as s (s.id)}
									{@const gs = target.groups.filter((g) => g.seriesId === s.id)}
									{#if gs.length}
										<optgroup label={s.title}>
											{#each gs as g (g.id)}
												<option value={String(g.id)} selected={v('group_id') === String(g.id)}>
													{groupLabel(g)}
												</option>
											{/each}
										</optgroup>
									{/if}
								{/each}
							</select>
						</div>
					</section>

					<section class="part" hidden={!shown('video_group')} aria-labelledby="p-video_group">
						<h2 id="p-video_group">
							{m.community_section_for({ type: typeLabel('video_group') })}
						</h2>
						{#if target.groups.some((g) => g.seriesId === target.seriesId)}
							<div class="field">
								<label for={fieldId('new_group_id')}>{labels.new_group_id}</label>
								{@render fieldError('new_group_id')}
								<select {...attrs('new_group_id')}>
									<option value="" selected={v('new_group_id') === ''}>
										{m.community_choose()}
									</option>
									{#each target.groups.filter((g) => g.seriesId === target.seriesId) as g (g.id)}
										<option value={String(g.id)} selected={v('new_group_id') === String(g.id)}>
											{groupLabel(g)}
										</option>
									{/each}
								</select>
							</div>
						{:else}
							<p id={fieldId('new_group_id')}>{m.community_no_groups_here()}</p>
							{@render fieldError('new_group_id')}
						{/if}
					</section>

					<section
						class="part"
						hidden={!shown('video_live_vod')}
						aria-labelledby="p-video_live_vod"
					>
						<h2 id="p-video_live_vod">
							{m.community_section_for({ type: typeLabel('video_live_vod') })}
						</h2>
						<p>
							{target.extras
								? m.community_live_vod_goes({ series: target.extras.title })
								: m.community_no_extras_here()}
						</p>
					</section>

					<section
						class="part"
						hidden={!shown('video_captions')}
						aria-labelledby="p-video_captions"
					>
						<h2 id="p-video_captions">
							{m.community_section_for({ type: typeLabel('video_captions') })}
						</h2>
						<fieldset>
							<legend>{m.community_captions_legend()}</legend>
							{@render fieldError('captions')}
							<label class="radio">
								<input
									type="radio"
									name="captions"
									value="yes"
									id="f-captions-0"
									checked={v('captions') === 'yes'}
								/>
								{m.community_captions_yes()}
							</label>
							<label class="radio">
								<input
									type="radio"
									name="captions"
									value="no"
									id="f-captions-1"
									checked={v('captions') === 'no'}
								/>
								{m.community_captions_no()}
							</label>
						</fieldset>
					</section>
				{/if}

				{#if target.type === 'series' || target.type === 'creator'}
					{@const fields =
						target.type === 'series'
							? ['title', 'kind', 'status', 'started_at', 'ended_at', 'description']
							: ['name', 'bio']}
					{@const fieldType = target.type === 'series' ? 'series_field' : 'creator_field'}
					<section class="part" hidden={!shown(fieldType)} aria-labelledby="p-field">
						<h2 id="p-field">{m.community_section_for({ type: typeLabel(fieldType) })}</h2>
						<fieldset>
							<legend>{m.community_field_which()}</legend>
							{@render fieldError('field')}
							{#each fields as f, i (f)}
								<label class="radio">
									<input
										type="radio"
										name="field"
										value={f}
										id="f-field-{i}"
										checked={v('field') === f}
										onchange={() => (field = f)}
									/>
									{f === 'description' ? fieldLabel('description', 'English') : fieldLabel(f)}
								</label>
							{/each}
						</fieldset>
						{#each fields as f (f)}
							<div class="field" hidden={enhanced && field !== f}>
								<label for={fieldId(f)}>{labels[f]}</label>
								{@render fieldError(f)}
								{#if f === 'kind' && target.type === 'series'}
									<select {...attrs('kind')}>
										{#each ['season', 'live_series', 'event', 'other'] as const as k (k)}
											<option value={k} selected={(v('kind') || target.kind) === k}>
												{kindLabel(k)}
											</option>
										{/each}
									</select>
								{:else if f === 'status' && target.type === 'series'}
									<select {...attrs('status')}>
										{#each ['upcoming', 'ongoing', 'ended'] as const as k (k)}
											<option value={k} selected={(v('status') || target.status) === k}>
												{statusLabel(k)}
											</option>
										{/each}
									</select>
								{:else if f === 'started_at' || f === 'ended_at'}
									<input type="date" {...attrs(f)} value={v(f)} />
								{:else if f === 'description' || f === 'bio'}
									<textarea {...attrs(f)} rows="4">{v(f)}</textarea>
								{:else}
									<input type="text" {...attrs(f)} value={v(f)} autocomplete="off" />
								{/if}
							</div>
						{/each}
					</section>

					<section class="part" hidden={!shown('participant')} aria-labelledby="p-participant">
						<h2 id="p-participant">
							{m.community_section_for({ type: typeLabel('participant') })}
						</h2>
						{#if target.type === 'series'}
							<div class="field">
								<label for={fieldId('creator_id')}>{labels.creator_id}</label>
								{@render fieldError('creator_id')}
								<select {...attrs('creator_id')}>
									<option value="" selected={v('creator_id') === ''}>{m.community_choose()}</option>
									{#each target.otherCreators as c (c.id)}
										<option value={String(c.id)} selected={v('creator_id') === String(c.id)}>
											{c.name}
										</option>
									{/each}
									<option value="new" selected={v('creator_id') === 'new'}>
										{m.community_creator_not_listed()}
									</option>
								</select>
							</div>
							<div class="field">
								<label for={fieldId('creator_name')}>{labels.creator_name}</label>
								{@render fieldError('creator_name')}
								<input type="text" {...attrs('creator_name')} value={v('creator_name')} />
							</div>
						{:else}
							<div class="field">
								<label for={fieldId('series_id')}>{labels.series_id}</label>
								{@render fieldError('series_id')}
								<select {...attrs('series_id')}>
									<option value="" selected={v('series_id') === ''}>{m.community_choose()}</option>
									{#each target.otherSeries as s (s.id)}
										<option value={String(s.id)} selected={v('series_id') === String(s.id)}>
											{s.title}
										</option>
									{/each}
								</select>
							</div>
						{/if}
					</section>

					<section class="part" hidden={!shown('rule')} aria-labelledby="p-rule">
						<h2 id="p-rule">{m.community_section_for({ type: typeLabel('rule') })}</h2>
						{#if target.type === 'creator'}
							<div class="field">
								<label for={fieldId('rule_series_id')}>{labels.rule_series_id}</label>
								{@render fieldError('rule_series_id')}
								<select {...attrs('rule_series_id')}>
									<option value="" selected={v('rule_series_id') === ''}>
										{m.community_choose()}
									</option>
									{#each target.inSeries as s (s.id)}
										<option value={String(s.id)} selected={v('rule_series_id') === String(s.id)}>
											{s.title}
										</option>
									{/each}
								</select>
							</div>
						{/if}
						<div class="field">
							<label for={fieldId('pattern')}>{labels.pattern}</label>
							<p class="hint" id="{fieldId('pattern')}-hint">
								{m.community_field_rule_pattern_hint()}
							</p>
							{@render fieldError('pattern')}
							<input
								type="text"
								{...attrs('pattern', true)}
								value={v('pattern')}
								autocomplete="off"
							/>
						</div>
						<fieldset>
							<legend>{labels.match}</legend>
							{@render fieldError('match')}
							{#each ['contains', 'regex'] as k, i (k)}
								<label class="radio">
									<input
										type="radio"
										name="match"
										value={k}
										id="f-match-{i}"
										checked={(v('match') || 'contains') === k}
									/>
									{k === 'regex' ? m.manage_match_regex() : m.manage_match_contains()}
								</label>
							{/each}
						</fieldset>
						<fieldset>
							<legend>{labels.rule_target}</legend>
							{@render fieldError('rule_target')}
							{#each ['main', 'extras'] as k, i (k)}
								<label class="radio">
									<input
										type="radio"
										name="rule_target"
										value={k}
										id="f-rule_target-{i}"
										checked={(v('rule_target') || 'main') === k}
									/>
									{k === 'extras' ? m.manage_target_extras() : m.manage_target_main()}
								</label>
							{/each}
						</fieldset>
						<div class="field">
							<label for={fieldId('channel_id')}>{labels.channel_id}</label>
							{@render fieldError('channel_id')}
							<select {...attrs('channel_id')}>
								<option value="" selected={v('channel_id') === ''}>
									{m.community_all_channels()}
								</option>
								{#each target.channels as ch (ch.id)}
									<option value={String(ch.id)} selected={v('channel_id') === String(ch.id)}>
										{ch.creatorName} · {ch.title}
									</option>
								{/each}
							</select>
						</div>
					</section>
				{/if}

				<div class="field">
					<label for={fieldId('note')}>
						{chosen === 'other' ? m.community_note_label_required() : m.community_note_label()}
					</label>
					<p class="hint" id="{fieldId('note')}-hint">
						{m.community_note_hint({ max: data.noteMax })}
					</p>
					{@render fieldError('note')}
					<textarea {...attrs('note', true)} rows="3" maxlength={data.noteMax}>{v('note')}</textarea
					>
				</div>

				<div class="actions">
					<button type="submit" class="btn primary">{m.community_send()}</button>
					<a class="btn ghost" href={back}>{m.community_cancel()}</a>
				</div>
			</form>
			<p class="meta">
				{m.community_your_trust({ approved: data.trust.approved, rejected: data.trust.rejected })}
				<a href={resolve('/(site)/me/suggestions')}>{m.community_my_link()}</a>
			</p>
		{/if}
	</FormStyles>
</div>

<style>
	.page {
		padding: 40px var(--page-pad) 0;
		max-width: 46rem;
	}
	h1 {
		font-size: clamp(1.75rem, 4vw, 2.25rem);
		margin: 0 0 8px;
	}
	.lead,
	.meta {
		color: var(--muted);
	}
	.meta {
		font-size: 0.9375rem;
	}
	.part h2 {
		font-size: 1.0625rem;
		margin: 8px 0 10px;
	}
	.part {
		margin: 0 0 8px;
	}
	.thanks {
		border: 1px solid var(--line);
		border-left: 4px solid var(--sw-on);
		border-radius: var(--radius);
		background: var(--surface2);
		padding: 14px 18px;
	}
	.thanks h2 {
		margin: 0 0 6px;
		font-size: 1.25rem;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 20px;
	}
</style>
