<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { spokenDuration } from '#lib/video.js';
	import ErrorSummary from '../../../manage/ui/ErrorSummary.svelte';
	import Flash from '../../../manage/ui/Flash.svelte';
	import { errorMessage } from '../../../manage/ui/errors.js';
	import { groupName } from '../../../manage/series/names.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = getLocale();
	const self = $derived(resolve('/(site)/creator/videos'));

	const statusName = {
		unsorted: m.manage_status_unsorted,
		placed: m.creator_status_placed,
		ignored: m.manage_status_ignored
	} as const;

	const flash = $derived(
		form?.done === 'placed'
			? m.manage_video_placed({ title: form.title ?? '' })
			: form?.done === 'ignored'
				? m.manage_video_ignored({ title: form.title ?? '' })
				: form?.done === 'unsorted'
					? m.manage_video_unsorted({ title: form.title ?? '' })
					: null
	);
	const rowErrors = (id: number) =>
		form && 'videoId' in form && form.videoId === id ? form.errors : null;
	const filtered = $derived(data.filter.status !== null || data.filter.seriesId !== null);
</script>

<svelte:head>
	<title>{m.creator_videos_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.creator_videos_title()}</h1>
<p class="lead">{m.creator_videos_lead()}</p>

<form method="get" action={self} class="filters" aria-labelledby="filter-h">
	<h2 id="filter-h" class="sr-only">{m.creator_filter_heading()}</h2>
	<div class="field">
		<label for="filter-status">{m.creator_filter_status()}</label>
		<select id="filter-status" name="status">
			<option value="" selected={data.filter.status === null}>{m.creator_filter_all()}</option>
			{#each ['unsorted', 'placed', 'ignored'] as const as s (s)}
				<option value={s} selected={data.filter.status === s}>{statusName[s]()}</option>
			{/each}
		</select>
	</div>
	<div class="field">
		<label for="filter-series">{m.manage_field_series()}</label>
		<select id="filter-series" name="series">
			<option value="" selected={data.filter.seriesId === null}>{m.creator_filter_all()}</option>
			{#each data.series as s (s.id)}
				<option value={String(s.id)} selected={data.filter.seriesId === s.id}>{s.title}</option>
			{/each}
		</select>
	</div>
	<div class="actions">
		<button type="submit" class="btn ghost">{m.creator_filter_apply()}</button>
		{#if filtered}<a href={self}>{m.creator_filter_clear()}</a>{/if}
	</div>
</form>

<Flash message={flash} />
{#if form && 'errors' in form && form.errors && typeof form.videoId === 'number'}
	<ErrorSummary
		errors={form.errors}
		labels={{ series_id: m.manage_field_series(), group_id: m.manage_field_group() }}
		targets={{ series_id: `v${form.videoId}-series`, group_id: `v${form.videoId}-group` }}
	/>
{/if}

{#if data.series.length === 0}
	<p>{m.creator_no_series()}</p>
{/if}

{#if data.videos.length === 0}
	<p>{filtered ? m.creator_no_videos_filtered() : m.creator_no_videos()}</p>
{:else}
	<ul class="list plain">
		{#each data.videos as v (v.id)}
			{@const errs = rowErrors(v.id)}
			<li>
				<article aria-labelledby="v{v.id}-title">
					<h2 id="v{v.id}-title">{v.title || m.manage_untitled()}</h2>
					<p class="meta">
						<span class="tag">{statusName[v.status]()}</span>
						{#if v.status === 'placed' && v.seriesTitle}
							{m.creator_placed_in({ series: v.seriesTitle })} ·
						{/if}
						{v.channelTitle} ·
						{formatDate(v.publishedAt, locale, { dateStyle: 'medium', timeZone: 'UTC' })} ·
						{spokenDuration(v.durationS, locale)}
						{#if v.isLiveVod}· <span class="tag">{m.manage_live_vod()}</span>{/if}
						{#if v.isShort}· <span class="tag">{m.manage_short()}</span>{/if}
					</p>
					{#if data.series.length > 0}
						<form method="post" action="?/place" use:enhance>
							<input type="hidden" name="video_id" value={v.id} />
							<div class="cols">
								<div class="field">
									<label for="v{v.id}-series">{m.manage_field_series()}</label>
									{#if errs?.series_id}
										<p class="error" id="v{v.id}-series-error">{errorMessage(errs.series_id)}</p>
									{/if}
									<select
										id="v{v.id}-series"
										name="series_id"
										required
										aria-invalid={errs?.series_id ? 'true' : undefined}
										aria-describedby={errs?.series_id ? `v${v.id}-series-error` : undefined}
									>
										<option value="">{m.manage_choose_series()}</option>
										{#each data.series as s (s.id)}
											<option value={String(s.id)} selected={v.seriesId === s.id}>{s.title}</option>
										{/each}
									</select>
								</div>
								<div class="field">
									<label for="v{v.id}-group">{m.creator_field_group()}</label>
									{#if errs?.group_id}
										<p class="error" id="v{v.id}-group-error">{errorMessage(errs.group_id)}</p>
									{/if}
									<select
										id="v{v.id}-group"
										name="group_id"
										aria-invalid={errs?.group_id ? 'true' : undefined}
										aria-describedby={errs?.group_id ? `v${v.id}-group-error` : undefined}
									>
										<option value="">{m.manage_no_group()}</option>
										{#each data.series as s (s.id)}
											{@const gs = data.groups.filter((g) => g.seriesId === s.id)}
											{#if gs.length > 0}
												<optgroup label={s.title}>
													{#each gs as g (g.id)}
														<option value={String(g.id)} selected={v.groupId === g.id}>
															{groupName(g)}
														</option>
													{/each}
												</optgroup>
											{/if}
										{/each}
									</select>
								</div>
							</div>
							<div class="actions">
								<button type="submit" class="btn primary">
									{m.manage_place()}<span class="sr-only">: {v.title}</span>
								</button>
								{#if v.status === 'ignored'}
									<button type="submit" class="btn ghost" formaction="?/unsort" formnovalidate>
										{m.manage_back_to_unsorted()}<span class="sr-only">: {v.title}</span>
									</button>
								{:else}
									<button type="submit" class="btn ghost" formaction="?/ignore" formnovalidate>
										{m.manage_ignore()}<span class="sr-only">: {v.title}</span>
									</button>
								{/if}
							</div>
						</form>
					{/if}
				</article>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0 20px;
		align-items: flex-end;
		margin: 0 0 16px;
	}
	.filters .field {
		flex: 1 1 12rem;
	}
	.filters .actions {
		margin-bottom: 18px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	article {
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 4px 18px 4px;
		background: var(--surface2);
	}
	article h2 {
		font-size: 1.0625rem;
		margin: 12px 0 4px;
		overflow-wrap: anywhere;
	}
	.meta {
		margin: 0 0 12px;
		color: var(--muted);
		font-size: 0.875rem;
	}
	.cols {
		display: flex;
		gap: 0 20px;
		flex-wrap: wrap;
	}
	.cols .field {
		flex: 1 1 14rem;
		min-width: 0;
	}
</style>
