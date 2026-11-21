<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { NOTICE_STORAGE_KEY } from '#lib/prefs/notice.js';

	function dismiss() {
		try {
			localStorage.setItem(NOTICE_STORAGE_KEY, '1');
		} catch {
			/* storage unavailable: hide for this page view only */
		}
		document.documentElement.dataset.notice = 'dismissed';
		// The button disappears, so move focus to the main content instead of losing it.
		document.getElementById('main')?.focus();
	}
</script>

<aside class="notice" aria-label={m.notice_label()}>
	<p>
		{m.notice_text()}
		<a href={resolve('/(site)/[page]', { page: 'about' })}>{m.notice_about_link()}</a>
	</p>
	<button type="button" class="dismiss" aria-label={m.notice_dismiss()} onclick={dismiss}>
		<span aria-hidden="true">✕</span>
	</button>
</aside>

<style>
	.notice {
		margin: 8px var(--page-pad) 16px;
		background: var(--surface2);
		border: 1px solid var(--sand);
		border-radius: var(--radius-lg);
		padding: 14px 18px;
		font-size: 0.875rem;
		display: flex;
		gap: 12px;
		align-items: center;
	}
	:global([data-notice='dismissed']) .notice {
		display: none;
	}
	p {
		margin: 0;
	}
	.dismiss {
		margin-left: auto;
		flex: 0 0 auto;
		background: none;
		border: 1px solid var(--ghost-line);
		border-radius: 8px;
		min-width: 44px;
		min-height: 44px;
	}
</style>
