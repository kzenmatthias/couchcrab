<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import ErrorSummary from '../ui/ErrorSummary.svelte';
	import Field from '../ui/Field.svelte';
	import type { Errors } from '../ui/errors.js';

	type Values = Record<string, string | string[] | boolean | number | null | undefined>;
	type Channel = { id: number; title: string; creatorName: string };

	type Props = {
		values: Values;
		errors: Errors;
		channels: Channel[];
		hasExtras: boolean;
		/** False when the series has no start date: a date-bound rule then matches nothing. */
		hasStartDate: boolean;
		submitLabel: string;
	};

	let { values, errors, channels, hasExtras, hasStartDate, submitLabel }: Props = $props();
	const str = (v: Values[string]) => (v == null ? '' : String(v));
	const enabled = $derived(
		values.enabled === undefined || values.enabled === true || values.enabled === '1'
	);

	const withinSeriesDates = $derived(
		values.within_series_dates === true || values.within_series_dates === '1'
	);

	const labels = $derived({
		pattern: m.manage_field_pattern(),
		match: m.manage_field_match(),
		channel_id: m.manage_field_rule_channel(),
		target: m.manage_field_target(),
		priority: m.manage_field_priority(),
		enabled: m.manage_field_enabled(),
		within_series_dates: m.manage_field_within_series_dates()
	});
</script>

<ErrorSummary {errors} {labels} />

<form
	method="post"
	action="?/save"
	use:enhance={() =>
		({ update }) =>
			update({ reset: false })}
>
	<Field name="pattern" label={labels.pattern} hint={m.manage_hint_pattern()} {errors} required>
		{#snippet children(a)}
			<input
				{...a}
				type="text"
				required
				maxlength="200"
				value={str(values.pattern)}
				spellcheck="false"
				autocomplete="off"
			/>
		{/snippet}
	</Field>
	<fieldset>
		<legend>{labels.match}</legend>
		<div class="check">
			<input
				id="match-contains"
				type="radio"
				name="match"
				value="contains"
				checked={str(values.match) !== 'regex'}
			/>
			<label for="match-contains">{m.manage_match_contains()}</label>
		</div>
		<div class="check">
			<input
				id="match-regex"
				type="radio"
				name="match"
				value="regex"
				checked={str(values.match) === 'regex'}
			/>
			<label for="match-regex">{m.manage_match_regex()}</label>
		</div>
	</fieldset>
	<Field name="channel_id" label={labels.channel_id} hint={m.manage_hint_rule_channel()} {errors}>
		{#snippet children(a)}
			<select {...a}>
				<option value="">{m.manage_all_channels()}</option>
				{#each channels as ch (ch.id)}
					<option value={String(ch.id)} selected={str(values.channel_id) === String(ch.id)}>
						{ch.creatorName}: {ch.title}
					</option>
				{/each}
			</select>
		{/snippet}
	</Field>
	<Field
		name="target"
		label={labels.target}
		hint={hasExtras ? m.manage_hint_target() : m.manage_hint_target_no_extras()}
		{errors}
	>
		{#snippet children(a)}
			<select {...a}>
				<option value="main" selected={str(values.target) !== 'extras'}>
					{m.manage_target_main()}
				</option>
				<option value="extras" selected={str(values.target) === 'extras'}>
					{m.manage_target_extras()}
				</option>
			</select>
		{/snippet}
	</Field>
	<Field name="priority" label={labels.priority} hint={m.manage_hint_priority()} {errors}>
		{#snippet children(a)}
			<input {...a} type="number" min="-1000" max="1000" value={str(values.priority) || '0'} />
		{/snippet}
	</Field>
	<div class="check">
		<input
			id="f-within_series_dates"
			type="checkbox"
			name="within_series_dates"
			value="1"
			checked={withinSeriesDates}
			aria-describedby={hasStartDate
				? 'f-within_series_dates-hint'
				: 'f-within_series_dates-hint f-within_series_dates-warn'}
		/>
		<label for="f-within_series_dates">{labels.within_series_dates}</label>
	</div>
	<p class="hint" id="f-within_series_dates-hint">{m.manage_hint_within_series_dates()}</p>
	{#if !hasStartDate}
		<p class="hint" id="f-within_series_dates-warn">
			{m.manage_warn_within_series_dates_no_start()}
		</p>
	{/if}
	<div class="check">
		<input id="f-enabled" type="checkbox" name="enabled" value="1" checked={enabled} />
		<label for="f-enabled">{labels.enabled}</label>
	</div>
	<div class="actions">
		<button type="submit" class="btn primary">{submitLabel}</button>
		<button type="submit" class="btn ghost" formaction="?/test">{m.manage_rule_test()}</button>
	</div>
</form>
