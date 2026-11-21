<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import { spokenDuration } from '#lib/video.js';
	import ErrorSummary from '../ui/ErrorSummary.svelte';
	import Flash from '../ui/Flash.svelte';
	import { errorMessage } from '../ui/errors.js';
	import { groupName } from '../series/names.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = getLocale();
	const ignored = $derived(data.status === 'ignored');
	const titles = $derived(Object.fromEntries(data.series.map((s) => [s.id, s.title])));
	const flash = $derived(
		form?.done === 'placed'
			? m.manage_video_placed({ title: form.title ?? '' })
			: form?.done === 'ignored'
				? m.manage_video_ignored({ title: form.title ?? '' })
				: form?.done === 'unsorted'
					? m.manage_video_unsorted({ title: form.title ?? '' })
					: null
	);
	const rowErrors = (id: number) => (form?.videoId === id ? form.errors : null);
</script>

<svelte:head>
	<title>{m.manage_unsorted_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{ignored ? m.manage_ignored_title() : m.manage_unsorted_title()}</h1>
<p class="lead">{ignored ? m.manage_ignored_lead() : m.manage_unsorted_lead()}</p>

<nav class="toggle" aria-label={m.manage_unsorted_toggle_label()}>
	<ul>
		<li>
			<a href={resolve('/manage/unsorted')} aria-current={!ignored ? 'page' : undefined}>
				{m.manage_status_unsorted()}
			</a>
		</li>
		<li>
			<a
				href="{resolve('/manage/unsorted')}?show=ignored"
				aria-current={ignored ? 'page' : undefined}
			>
				{m.manage_status_ignored()}
			</a>
		</li>
	</ul>
</nav>

<Flash message={flash} />
{#if form?.errors && typeof form.videoId === 'number'}
	<ErrorSummary
		errors={form.errors}
		labels={{ series_id: m.manage_field_series(), group_id: m.manage_field_group() }}
		targets={{ series_id: `v${form.videoId}-series`, group_id: `v${form.videoId}-group` }}
	/>
{/if}
{#if !ignored}
	<p><a href={resolve('/manage/rules')}>{m.manage_go_apply_rules()}</a></p>
{/if}

{#if data.videos.length === 0}
	<p>{ignored ? m.manage_no_ignored() : m.manage_no_unsorted()}</p>
{:else}
	<ul class="queue plain">
		{#each data.videos as v (v.id)}
			{@const errs = rowErrors(v.id)}
			<li>
				<article aria-labelledby="v{v.id}-title">
					<h2 id="v{v.id}-title">{v.title || m.manage_untitled()}</h2>
					<p class="meta">
						{v.creatorName} · {v.channelTitle} ·
						{formatDate(v.publishedAt, locale, { dateStyle: 'medium', timeZone: 'UTC' })} ·
						{spokenDuration(v.durationS, locale)}
						{#if v.isLiveVod}· <span class="tag">{m.manage_live_vod()}</span>{/if}
						{#if v.isShort}· <span class="tag">{m.manage_short()}</span>{/if}
					</p>
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
										<option value={String(s.id)}>{s.title}</option>
									{/each}
								</select>
							</div>
							<div class="field">
								<label for="v{v.id}-group">{m.manage_field_group()}</label>
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
											<optgroup label={titles[s.id]}>
												{#each gs as g (g.id)}
													<option value={String(g.id)}>{groupName(g)}</option>
												{/each}
											</optgroup>
										{/if}
									{/each}
								</select>
							</div>
						</div>
						<div class="actions">
							<button type="submit" class="btn primary">{m.manage_place()}</button>
							{#if ignored}
								<button type="submit" class="btn ghost" formaction="?/unsort" formnovalidate>
									{m.manage_back_to_unsorted()}
								</button>
							{:else}
								<button type="submit" class="btn ghost" formaction="?/ignore" formnovalidate>
									{m.manage_ignore()}
								</button>
							{/if}
						</div>
					</form>
				</article>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.toggle ul {
		display: flex;
		gap: 8px;
		list-style: none;
		padding: 0;
		margin: 0 0 20px;
	}
	.toggle a {
		display: inline-block;
		padding: 8px 14px;
		border: 1px solid var(--line);
		border-radius: 999px;
		text-decoration: none;
	}
	.toggle a[aria-current] {
		background: var(--surface);
		font-weight: 700;
	}
	.queue {
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
	}
</style>
