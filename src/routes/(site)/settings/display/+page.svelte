<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import RadioGroup from '#lib/components/RadioGroup.svelte';
	import Switch from '#lib/components/Switch.svelte';
	import {
		CAPTION_LANGUAGES,
		SHORTCUT_ACTIONS,
		isShortcutKey,
		type Countdown,
		type Motion,
		type ShortcutAction,
		type TextSize
	} from '#lib/prefs/schema.js';
	import { getViewing } from '#lib/prefs/store.svelte.js';

	const viewing = getViewing();
	const p = $derived(viewing.prefs);

	const languageNames = $derived(new Intl.DisplayNames([getLocale()], { type: 'language' }));
	const languages = $derived(
		CAPTION_LANGUAGES.map((code) => ({ code, name: languageNames.of(code) ?? code })).sort((a, b) =>
			a.name.localeCompare(b.name, getLocale())
		)
	);

	const actionLabel: Record<ShortcutAction, () => string> = {
		next: m.shortcut_next,
		title: m.shortcut_title,
		watched: m.shortcut_watched
	};

	/* ---------- changing a shortcut key (WCAG 2.1.4) ---------- */

	let capturing: ShortcutAction | null = $state(null);
	let shortcutStatus = $state('');

	function startCapture(action: ShortcutAction) {
		capturing = action;
		shortcutStatus = m.shortcut_press_key({ action: actionLabel[action]() });
	}

	function captureKey(event: KeyboardEvent, action: ShortcutAction) {
		if (capturing !== action) return;
		if (event.key === 'Tab') return;
		event.preventDefault();
		if (event.key === 'Escape') {
			capturing = null;
			shortcutStatus = m.shortcut_unchanged();
			return;
		}
		const key = event.key.toLowerCase();
		if (!isShortcutKey(key)) {
			shortcutStatus = m.shortcut_invalid_key();
			return;
		}
		const other = SHORTCUT_ACTIONS.find((a) => a !== action && p.shortcuts.keys[a] === key);
		if (other) {
			shortcutStatus = m.shortcut_key_taken({
				key: key.toUpperCase(),
				action: actionLabel[other]()
			});
			return;
		}
		viewing.update((d) => {
			d.shortcuts.keys[action] = key;
		});
		capturing = null;
		shortcutStatus = m.shortcut_saved({ action: actionLabel[action](), key: key.toUpperCase() });
	}
</script>

<svelte:head>
	<title>{m.settings_display_title()} · {m.site_name()}</title>
</svelte:head>

<h1>{m.settings_display_title()}</h1>

<section aria-labelledby="text-h">
	<h2 id="text-h">{m.settings_text_heading()}</h2>
	<RadioGroup
		legend={m.setting_text_size()}
		name="text-size"
		options={[
			{ value: 'default', label: m.setting_text_size_default() },
			{ value: 'large', label: m.setting_text_size_large() },
			{ value: 'larger', label: m.setting_text_size_larger() }
		] satisfies { value: TextSize; label: string }[]}
		value={p.display.textSize}
		onchange={(v: TextSize) =>
			viewing.update((d) => {
				d.display.textSize = v;
			})}
	/>
	<Switch
		id="set-underline"
		label={m.setting_underline_links()}
		checked={p.display.underlineLinks}
		onchange={(on: boolean) =>
			viewing.update((d) => {
				d.display.underlineLinks = on;
			})}
	/>
	<Switch
		id="set-text-only"
		label={m.setting_text_only()}
		description={m.setting_text_only_help()}
		checked={p.display.textOnly}
		onchange={(on: boolean) =>
			viewing.update((d) => {
				d.display.textOnly = on;
			})}
	/>
</section>

<section aria-labelledby="motion-h">
	<h2 id="motion-h">{m.settings_motion_heading()}</h2>
	<RadioGroup
		legend={m.setting_motion()}
		name="motion"
		options={[
			{ value: 'system', label: m.setting_motion_system() },
			{ value: 'reduce', label: m.setting_motion_reduce() },
			{ value: 'allow', label: m.setting_motion_allow() }
		] satisfies { value: Motion; label: string }[]}
		value={p.display.motion}
		onchange={(v: Motion) =>
			viewing.update((d) => {
				d.display.motion = v;
			})}
	/>
</section>

<section aria-labelledby="playback-h">
	<h2 id="playback-h">{m.settings_playback_heading()}</h2>
	<Switch
		id="set-autoplay"
		label={m.setting_autoplay()}
		checked={p.playback.autoplay}
		onchange={(on: boolean) =>
			viewing.update((d) => {
				d.playback.autoplay = on;
			})}
	/>
	<div class="gap"></div>
	<RadioGroup
		legend={m.setting_countdown()}
		name="countdown"
		options={[
			{ value: 10, label: m.setting_countdown_seconds({ seconds: 10 }) },
			{ value: 15, label: m.setting_countdown_seconds({ seconds: 15 }) },
			{ value: 30, label: m.setting_countdown_seconds({ seconds: 30 }) },
			{ value: 'wait', label: m.setting_countdown_wait() }
		] satisfies { value: Countdown; label: string }[]}
		value={p.playback.countdown}
		onchange={(v: Countdown) =>
			viewing.update((d) => {
				d.playback.countdown = v;
			})}
	/>
	<Switch
		id="set-spoiler-default"
		label={m.setting_spoiler_default()}
		description={m.setting_spoiler_default_help()}
		checked={p.spoilerFree.default}
		onchange={(on: boolean) =>
			viewing.update((d) => {
				d.spoilerFree.default = on;
			})}
	/>
</section>

<section aria-labelledby="captions-h">
	<h2 id="captions-h">{m.settings_captions_heading()}</h2>
	<Switch
		id="set-captions-on"
		label={m.setting_captions_on()}
		checked={p.playback.captionsOn}
		onchange={(on: boolean) =>
			viewing.update((d) => {
				d.playback.captionsOn = on;
			})}
	/>
	<div class="field">
		<label for="caption-language">{m.setting_caption_language()}</label>
		<select
			id="caption-language"
			value={p.playback.captionLanguage}
			onchange={(e) => {
				const value = e.currentTarget.value;
				viewing.update((d) => {
					d.playback.captionLanguage = value;
				});
			}}
		>
			{#each languages as l (l.code)}
				<option value={l.code} lang={l.code}>{l.name}</option>
			{/each}
		</select>
	</div>
	<Switch
		id="set-creator-captions"
		label={m.setting_creator_captions_only()}
		description={m.setting_creator_captions_only_help()}
		checked={p.creatorCaptionsOnly.default}
		onchange={(on: boolean) =>
			viewing.update((d) => {
				d.creatorCaptionsOnly.default = on;
			})}
	/>
</section>

<section aria-labelledby="shortcuts">
	<h2 id="shortcuts" tabindex="-1">{m.settings_shortcuts_heading()}</h2>
	<Switch
		id="set-shortcuts"
		label={m.setting_shortcuts()}
		description={m.setting_shortcuts_help()}
		checked={p.shortcuts.enabled}
		onchange={(on: boolean) =>
			viewing.update((d) => {
				d.shortcuts.enabled = on;
			})}
	/>
	<table>
		<caption class="sr-only">{m.shortcuts_table_caption()}</caption>
		<thead>
			<tr>
				<th scope="col">{m.shortcuts_col_key()}</th>
				<th scope="col">{m.shortcuts_col_action()}</th>
				<th scope="col"><span class="sr-only">{m.shortcuts_col_change()}</span></th>
			</tr>
		</thead>
		<tbody>
			{#each SHORTCUT_ACTIONS as action (action)}
				<tr>
					<td><kbd>{p.shortcuts.keys[action].toUpperCase()}</kbd></td>
					<td>{actionLabel[action]()}</td>
					<td>
						<button
							type="button"
							class="btn ghost"
							aria-label={capturing === action
								? undefined
								: m.shortcut_change_label({ action: actionLabel[action]() })}
							aria-describedby="shortcut-status"
							onclick={() => startCapture(action)}
							onkeydown={(e) => captureKey(e, action)}
							onblur={() => {
								if (capturing === action) {
									capturing = null;
									shortcutStatus = m.shortcut_unchanged();
								}
							}}
						>
							{#if capturing === action}
								{m.shortcut_press_any()}
							{:else}
								{m.shortcut_change()}
							{/if}
						</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p id="shortcut-status" class="status" role="status">{shortcutStatus}</p>
</section>

<style>
	section {
		margin-bottom: 32px;
		max-width: 40rem;
	}
	h2 {
		font-size: 1.25rem;
		margin: 24px 0 12px;
	}
	.gap {
		height: 16px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 0;
		border-bottom: 1px solid var(--line);
	}
	.field label {
		font-weight: 700;
		font-size: 0.875rem;
	}
	select {
		min-height: 44px;
		padding: 8px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface2);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 12px;
	}
	th,
	td {
		text-align: start;
		padding: 8px;
		border-bottom: 1px solid var(--line);
	}
	th {
		font-size: 0.875rem;
	}
	td:last-child {
		text-align: end;
	}
	kbd {
		font-family: var(--font-mono);
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0 6px;
	}
	.status {
		min-height: 1.5em;
		color: var(--muted);
	}
</style>
