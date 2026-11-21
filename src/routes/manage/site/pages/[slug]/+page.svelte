<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { locales } from '#lib/paraglide/runtime.js';
	import ErrorSummary from '../../../ui/ErrorSummary.svelte';
	import Field from '../../../ui/Field.svelte';
	import Flash from '../../../ui/Flash.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const p = $derived(data.page);
	const localeName: Record<string, () => string> = { en: m.language_en, nl: m.language_nl };
	const pageTitle: Record<string, () => string> = {
		about: m.manage_page_about,
		disclaimer: m.manage_page_disclaimer,
		accessibility: m.manage_page_accessibility,
		privacy: m.manage_page_privacy,
		community: m.manage_page_community
	};
	const name = $derived(pageTitle[p.slug]?.() ?? p.slug);
	const value = (field: 'title' | 'body', l: string) => {
		const v = form?.values?.[`${field}_${l}`];
		if (typeof v === 'string') return v;
		return p.translations.find((t) => t.locale === l)?.[field] ?? '';
	};
	const ln = (l: string) => localeName[l]?.() ?? l;
	const labels = $derived(
		Object.fromEntries(
			locales.flatMap((l) => [
				[`title_${l}`, m.manage_field_page_title({ language: ln(l) })],
				[`body_${l}`, m.manage_field_page_body({ language: ln(l) })]
			])
		)
	);
	let previewBox = $state<HTMLElement>();
	$effect(() => {
		if (form?.preview) previewBox?.focus();
	});
</script>

<svelte:head>
	<title>{name} · {m.manage_site_title()} · {m.site_name()}</title>
</svelte:head>

<p><a href={resolve('/manage/site')}>{m.manage_back_site()}</a></p>
<h1>{name}</h1>
<p class="lead">
	{m.manage_page_lead()}
	<a href={resolve('/(site)/[page]', { page: p.slug })}>{m.manage_view_on_site()}</a>
</p>

<Flash message={form?.saved ? m.manage_saved() : null} />
<ErrorSummary errors={form?.errors} {labels} />

<form
	method="post"
	action="?/save"
	use:enhance={() =>
		({ update }) =>
			update({ reset: false })}
>
	{#each locales as l (l)}
		<fieldset>
			<legend>{ln(l)}</legend>
			{#if l !== 'en'}<p class="hint">{m.manage_hint_page_fallback()}</p>{/if}
			<Field
				name="title_{l}"
				label={labels[`title_${l}`]}
				errors={form?.errors}
				required={l === 'en'}
			>
				{#snippet children(a)}
					<input
						{...a}
						lang={l}
						type="text"
						maxlength="120"
						required={l === 'en'}
						value={value('title', l)}
					/>
				{/snippet}
			</Field>
			<Field
				name="body_{l}"
				label={labels[`body_${l}`]}
				hint={m.manage_hint_markdown()}
				errors={form?.errors}
				required={l === 'en'}
			>
				{#snippet children(a)}
					<textarea
						{...a}
						lang={l}
						rows="14"
						maxlength="20000"
						required={l === 'en'}
						value={value('body', l)}></textarea>
				{/snippet}
			</Field>
			<button
				type="submit"
				class="btn ghost"
				formaction="?/preview"
				formnovalidate
				name="preview_locale"
				value={l}
			>
				{m.manage_preview_in({ language: ln(l) })}
			</button>
		</fieldset>
	{/each}
	<div class="actions">
		<button type="submit" class="btn primary">{m.manage_save_page()}</button>
	</div>
</form>

{#if form?.preview}
	<section class="preview" tabindex="-1" bind:this={previewBox} aria-labelledby="preview-title">
		<h2 id="preview-title">{m.manage_preview_title({ language: ln(form.preview.locale) })}</h2>
		<p class="hint">{m.manage_preview_not_saved()}</p>
		<div class="prose" lang={form.preview.locale}>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- Markdown sanitised on the server -->
			{@html form.preview.html}
		</div>
	</section>
{/if}

<style>
	.preview {
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 4px 20px 12px;
		margin: 24px 0;
	}
	.prose {
		line-height: 1.6;
	}
	.prose :global(a) {
		text-decoration: underline;
	}
</style>
