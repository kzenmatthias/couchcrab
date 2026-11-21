<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales } from '#lib/paraglide/runtime.js';

	const locale = getLocale();
	const languageName: Record<(typeof locales)[number], () => string> = {
		en: m.language_en,
		nl: m.language_nl
	};
	const redirectTo = $derived(page.url.pathname + page.url.search);
	const prefs = resolve('/prefs');
	// Managed in the app (site texts); the message string is the fallback, so it is never empty.
	const disclaimer = $derived(
		(page.data as { siteTexts?: { footer_disclaimer: string | null } }).siteTexts
			?.footer_disclaimer || m.footer_disclaimer()
	);
</script>

<footer class="footer">
	<p><b>{m.footer_unofficial()}</b> {disclaimer}</p>

	<nav aria-label={m.footer_links_label()}>
		<ul>
			<li><a href={resolve('/(site)/[page]', { page: 'about' })}>{m.footer_about()}</a></li>
			<li>
				<a href={resolve('/(site)/[page]', { page: 'disclaimer' })}>{m.footer_disclaimer_link()}</a>
			</li>
			<li>
				<a href={resolve('/(site)/[page]', { page: 'accessibility' })}>
					{m.footer_accessibility()}
				</a>
			</li>
			<li>
				<a href={resolve('/(site)/[page]', { page: 'privacy' })}>{m.footer_privacy()}</a>
			</li>
		</ul>
	</nav>

	<div class="prefs">
		<form method="post" action={prefs}>
			<input type="hidden" name="redirect_to" value={redirectTo} />
			<label for="footer-locale">{m.footer_language()}</label>
			<select id="footer-locale" name="locale">
				{#each locales as l (l)}
					<option value={l} lang={l} selected={l === locale}>{languageName[l]()}</option>
				{/each}
			</select>
			<button type="submit">{m.footer_apply()}</button>
		</form>
	</div>
</footer>

<style>
	.footer {
		border-top: 1px solid var(--line);
		margin-top: 40px;
		padding: 40px var(--page-pad);
		color: var(--muted);
		font-size: 0.8125rem;
		display: flex;
		gap: 16px 30px;
		flex-wrap: wrap;
	}
	p {
		margin: 0;
		max-width: 640px;
	}
	b {
		color: var(--text);
	}
	ul {
		display: flex;
		gap: 6px 16px;
		flex-wrap: wrap;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	ul a {
		display: inline-block;
		padding: 4px 0;
		color: var(--text);
	}
	.prefs {
		display: flex;
		gap: 12px 24px;
		flex-wrap: wrap;
		flex: 1 1 100%;
	}
	form {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	label {
		color: var(--text);
		font-weight: 700;
	}
	select,
	button {
		background: var(--surface2);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 6px 10px;
		min-height: 36px;
	}
	button {
		font-weight: 700;
	}
</style>
