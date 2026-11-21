<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import FirstVisitNotice from '#lib/components/FirstVisitNotice.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import TabBar from '#lib/components/TabBar.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<div class="shell">
	<a class="skip" href="#main">{m.skip_to_content()}</a>
	<SiteHeader user={data.user} theme={data.theme} />
	<!-- Narrow screens only; shown last (CSS order), sticky at the bottom of the viewport. -->
	<TabBar />
	<FirstVisitNotice />
	<main id="main" tabindex="-1">
		{@render children()}
	</main>
	<SiteFooter />
</div>

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
	/*
	 * Narrow screens: a full-height column, so the sticky tab bar (last via `order`) rests at the
	 * bottom of the viewport on short pages and below the footer at the end of long ones.
	 */
	@media (max-width: 900px) {
		.shell {
			display: flex;
			flex-direction: column;
			min-height: 100vh;
			min-height: 100dvh;
		}
		main {
			flex: 1 0 auto;
		}
	}
</style>
