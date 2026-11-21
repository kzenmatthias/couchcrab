<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/i18n.js';
	import ErrorSummary from '../ui/ErrorSummary.svelte';
	import Field from '../ui/Field.svelte';
	import Flash from '../ui/Flash.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = getLocale();
	const localeName: Record<string, () => string> = { en: m.language_en, nl: m.language_nl };
	const keys = [
		{
			key: 'notice',
			label: m.manage_text_notice,
			fallback: m.notice_text,
			hint: m.manage_hint_notice
		},
		{
			key: 'footer_disclaimer',
			label: m.manage_text_footer,
			fallback: m.footer_disclaimer,
			hint: m.manage_hint_footer
		}
	] as const;

	const stored = (key: string, l: string) =>
		data.texts.find((t) => t.key === key && t.locale === l)?.value ?? '';
	const value = (key: string, l: string) => {
		const v = form?.values?.[`${key}_${l}`];
		return typeof v === 'string' ? v : stored(key, l);
	};
	const labels = $derived(
		Object.fromEntries(
			keys.flatMap((k) =>
				locales.map((l) => [`${k.key}_${l}`, `${k.label()} (${localeName[l]?.() ?? l})`])
			)
		)
	);
	const pageTitle: Record<string, () => string> = {
		about: m.manage_page_about,
		disclaimer: m.manage_page_disclaimer,
		accessibility: m.manage_page_accessibility,
		privacy: m.manage_page_privacy
	};
</script>

<svelte:head>
	<title>{m.manage_site_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.manage_site_title()}</h1>
<p class="lead">{m.manage_site_lead()}</p>

<h2>{m.manage_pages_title()}</h2>
<div class="table-wrap">
	<table>
		<caption class="sr-only">{m.manage_pages_title()}</caption>
		<thead>
			<tr>
				<th scope="col">{m.manage_col_page()}</th>
				<th scope="col">{m.manage_col_languages()}</th>
				<th scope="col">{m.manage_col_updated()}</th>
			</tr>
		</thead>
		<tbody>
			{#each data.pages as p (p.slug)}
				<tr>
					<th scope="row">
						<a href={resolve('/manage/site/pages/[slug]', { slug: p.slug })}>
							{pageTitle[p.slug]?.() ?? p.slug}
						</a>
					</th>
					<td>
						{p.locales.length > 0
							? p.locales.map((l) => localeName[l]?.() ?? l).join(', ')
							: m.manage_page_missing()}
					</td>
					<td>{p.updatedAt ? formatDate(p.updatedAt, locale) : m.manage_never()}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<h2>{m.manage_texts_title()}</h2>
<p>{m.manage_texts_lead()}</p>
<Flash message={form?.saved ? m.manage_saved() : null} />
<ErrorSummary errors={form?.errors} {labels} />
<form
	method="post"
	action="?/texts"
	use:enhance={() =>
		({ update }) =>
			update({ reset: false })}
>
	{#each keys as k (k.key)}
		<fieldset>
			<legend>{k.label()}</legend>
			<p class="hint">{k.hint()}</p>
			{#each locales as l (l)}
				<Field
					name="{k.key}_{l}"
					label={labels[`${k.key}_${l}`]}
					hint={l === 'en' ? undefined : m.manage_hint_fallback_en()}
					errors={form?.errors}
					required={l === 'en'}
				>
					{#snippet children(a)}
						<textarea
							{...a}
							lang={l}
							rows="4"
							maxlength="1000"
							required={l === 'en'}
							placeholder={l === 'en' ? k.fallback() : value(k.key, 'en')}
							value={value(k.key, l)}></textarea>
					{/snippet}
				</Field>
			{/each}
		</fieldset>
	{/each}
	<div class="actions">
		<button type="submit" class="btn primary">{m.manage_save_texts()}</button>
	</div>
</form>
