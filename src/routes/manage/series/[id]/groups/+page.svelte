<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import ConfirmPanel from '../../../ui/ConfirmPanel.svelte';
	import ErrorSummary from '../../../ui/ErrorSummary.svelte';
	import Field from '../../../ui/Field.svelte';
	import Flash from '../../../ui/Flash.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = $derived(data.detail.series);
	const self = $derived(resolve('/manage/series/[id]/groups', { id: String(s.id) }));
	const local = (d: Date | null) => (d ? d.toISOString().slice(0, 16) : '');
	const defaultKind = $derived(s.grouping === 'week' ? 'week' : 'session');
	const nextNumber = $derived(
		Math.max(0, ...data.groups.filter((g) => g.kind === defaultKind).map((g) => g.number)) + 1
	);
	const kindName = (k: 'session' | 'week') =>
		k === 'session' ? m.manage_group_kind_session() : m.manage_group_kind_week();
	const groupName = (g: { kind: 'session' | 'week'; number: number }) =>
		g.kind === 'session'
			? m.manage_session_n({ number: g.number })
			: m.manage_week_n({ number: g.number });

	const labels = $derived({
		kind: m.manage_field_group_kind(),
		number: m.manage_field_number(),
		title: m.manage_field_group_title(),
		starts_at: m.manage_field_starts(),
		ends_at: m.manage_field_ends()
	});
	const createErrors = $derived(form?.action === 'create' ? form.errors : null);
	const v = (name: string) =>
		form?.action === 'create' && typeof form.values?.[name] === 'string' ? form.values[name] : '';
	const confirmGroup = $derived(
		typeof form?.confirm === 'number' ? data.groups.find((g) => g.id === form.confirm) : undefined
	);
	const flash = $derived(
		form?.saved === 'created'
			? m.manage_group_created()
			: form?.saved === 'updated'
				? m.manage_saved()
				: form?.saved === 'deleted'
					? m.manage_group_deleted()
					: null
	);
</script>

<svelte:head>
	<title>{m.manage_series_tab_groups()} · {s.title} · {m.site_name()}</title>
</svelte:head>

<h2 class="first">{m.manage_groups_title()}</h2>
<p class="lead">
	{s.grouping === 'session'
		? m.manage_groups_lead_session()
		: s.grouping === 'week'
			? m.manage_groups_lead_week()
			: m.manage_groups_lead_none()}
</p>

<Flash message={flash} />
{#if confirmGroup}
	<ConfirmPanel
		title={m.manage_confirm_delete_group({ name: groupName(confirmGroup) })}
		action="?/delete"
		confirmLabel={m.manage_delete()}
		cancelHref={self}
		fields={{ group_id: confirmGroup.id }}
	>
		<p>{m.manage_confirm_delete_group_text()}</p>
	</ConfirmPanel>
{/if}
<ErrorSummary errors={form?.action === 'update' ? form.errors : null} {labels} />

{#if data.groups.length === 0}
	<p>{m.manage_no_groups()}</p>
{:else}
	<ul class="plain">
		{#each data.groups as g (g.id)}
			<li>
				<form method="post" action="?/update" use:enhance>
					<input type="hidden" name="group_id" value={g.id} />
					<input type="hidden" name="kind" value={g.kind} />
					<fieldset>
						<legend>{groupName(g)}{g.title ? `: ${g.title}` : ''}</legend>
						<div class="cols">
							<div class="field">
								<label for="g{g.id}-number">{labels.number}</label>
								<input
									id="g{g.id}-number"
									name="number"
									type="number"
									min="1"
									max="9999"
									value={g.number}
									required
								/>
							</div>
							<div class="field">
								<label for="g{g.id}-title">{labels.title}</label>
								<input
									id="g{g.id}-title"
									name="title"
									type="text"
									maxlength="120"
									value={g.title ?? ''}
								/>
							</div>
						</div>
						<div class="cols">
							<div class="field">
								<label for="g{g.id}-start">{labels.starts_at}</label>
								<input
									id="g{g.id}-start"
									name="starts_at"
									type="datetime-local"
									value={local(g.startsAt)}
									required
								/>
							</div>
							<div class="field">
								<label for="g{g.id}-end">{labels.ends_at}</label>
								<input
									id="g{g.id}-end"
									name="ends_at"
									type="datetime-local"
									value={local(g.endsAt)}
								/>
							</div>
						</div>
						<div class="actions">
							<button type="submit" class="btn primary">{m.manage_save()}</button>
							<button type="submit" class="btn ghost" formaction="?/askDelete">
								{m.manage_delete()}
							</button>
						</div>
					</fieldset>
				</form>
			</li>
		{/each}
	</ul>
{/if}

<h2>{m.manage_group_add()}</h2>
<p class="hint">{m.manage_hint_times_utc()}</p>
<ErrorSummary errors={createErrors} {labels} />
<form method="post" action="?/create" use:enhance>
	<Field name="kind" label={labels.kind} errors={createErrors}>
		{#snippet children(a)}
			<select {...a}>
				{#each ['session', 'week'] as const as kind (kind)}
					<option value={kind} selected={(v('kind') || defaultKind) === kind}>
						{kindName(kind)}
					</option>
				{/each}
			</select>
		{/snippet}
	</Field>
	<Field name="number" label={labels.number} errors={createErrors} required>
		{#snippet children(a)}
			<input
				{...a}
				type="number"
				min="1"
				max="9999"
				required
				value={v('number') || String(nextNumber)}
			/>
		{/snippet}
	</Field>
	<Field name="title" label={labels.title} errors={createErrors}>
		{#snippet children(a)}
			<input {...a} type="text" maxlength="120" value={v('title')} />
		{/snippet}
	</Field>
	<Field name="starts_at" label={labels.starts_at} errors={createErrors} required>
		{#snippet children(a)}
			<input {...a} type="datetime-local" required value={v('starts_at')} />
		{/snippet}
	</Field>
	<Field
		name="ends_at"
		label={labels.ends_at}
		hint={m.manage_hint_ends_open()}
		errors={createErrors}
	>
		{#snippet children(a)}
			<input {...a} type="datetime-local" value={v('ends_at')} />
		{/snippet}
	</Field>
	<div class="actions">
		<button type="submit" class="btn primary">{m.manage_group_add()}</button>
	</div>
</form>

<style>
	.first {
		margin-top: 0;
	}
	.cols {
		display: flex;
		gap: 0 20px;
		flex-wrap: wrap;
	}
	.cols .field {
		flex: 1 1 12rem;
	}
</style>
