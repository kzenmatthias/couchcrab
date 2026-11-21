<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import FirstVisitNotice from '#lib/components/FirstVisitNotice.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<a class="skip" href="#main">{m.skip_to_content()}</a>
<SiteHeader user={data.user} theme={data.theme} />
<FirstVisitNotice />
<main id="main" tabindex="-1">
	{@render children()}
</main>
<SiteFooter />

<style>
	.skip {
		position: absolute;
		left: 12px;
		top: -80px;
		z-index: 10;
		background: var(--accent);
		color: var(--on-accent);
		padding: 10px 14px;
		border-radius: 8px;
		font-weight: 700;
		text-decoration: none;
	}
	.skip:focus {
		top: 12px;
	}
	main:focus {
		outline: none;
	}
</style>
