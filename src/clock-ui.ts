// The clock widget, built once and used everywhere: under the party in the
// Campaign panel, as a chip on every map in the campaign, and as a
// ```nimble-clock block. The + opens a popover (a bottom sheet on phones) with
// the calendar's steps, its quick jumps, a "+3 days 4 hours" field, Set date…
// and Undo. Every change goes through plugin.clock, which tells every clock.

import { App, Component, MarkdownPostProcessorContext, MarkdownRenderChild, Notice, setIcon, SuggestModal } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { formatMoment, formatWorldDate, parseWorldDate, stepButtons } from './calendar-def';
import { CALENDAR_PRESETS, calendarNote, CalendarPreset } from './calendar-presets';
import type { Campaign } from './campaign-model';
import type { ClockState } from './clock';
import { closePopover, isPopoverOpenFor, openPopover } from './popover';

export type ClockVariant = 'panel' | 'chip' | 'block';

/**
 * Draw a campaign's clock into `el` and keep it current until `owner` unloads.
 * Returns a function that redraws it.
 */
export function renderClock(el: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign, owner: Component, variant: ClockVariant): () => void {
	const box = el.createDiv({ cls: `nimble-clock is-${variant}`, attr: { 'data-campaign': c.folder } });
	let seq = 0;
	const draw = async () => {
		const mine = ++seq;
		const st = await plugin.clock.state(c);
		if (mine !== seq) return;
		box.empty();
		if (variant !== 'chip') setIcon(box.createSpan({ cls: 'nimble-clock-icon' }), 'calendar-clock');
		const text = box.createDiv({ cls: 'nimble-clock-text' });
		text.createSpan({ cls: 'nimble-clock-date', text: formatMoment(st.calendar, st.now) });
		if (variant === 'block') text.createSpan({ cls: 'nimble-clock-cal', text: st.calendarFile ? st.calendar.name : 'Day count' });
		const plus = box.createEl('button', { cls: 'nimble-clock-plus clickable-icon', attr: { 'aria-label': 'Advance the clock' } });
		setIcon(plus, 'plus');
		plus.onclick = (e) => { e.stopPropagation(); openClockPopover(plus, plugin, c); };
	};
	owner.registerEvent(plugin.clock.on('changed', (folder: string | null) => { if (!folder || folder === c.folder) void draw(); }));
	void draw();
	return () => void draw();
}

/** The + popover: steps, quick jumps, a typed length, Set date…, Undo. */
export function openClockPopover(anchor: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign): void {
	if (isPopoverOpenFor(anchor, 'nimble-clock-pop')) { closePopover(); return; }
	let ref: ReturnType<typeof plugin.clock.on> | null = null;
	openPopover(anchor, (pop) => {
		pop.addClass('nimble-clock-pop');
		const body = pop.createDiv();
		let seq = 0;
		const fill = async () => {
			const mine = ++seq;
			const st = await plugin.clock.state(c);
			if (mine !== seq) return;
			// Keep what's being typed if the clock changed elsewhere while this was open.
			const typing = body.querySelector<HTMLInputElement>('input:focus');
			if (typing?.value) return;
			body.empty();
			buildPopover(body, plugin, c, st, () => void fill());
		};
		// Another clock (or a hand edit) moved time: show it here too.
		ref = plugin.clock.on('changed', (folder: string | null) => { if (!folder || folder === c.folder) void fill(); });
		void fill();
	}, { width: 300, cls: 'nimble-clock-pop', onClose: () => { if (ref) plugin.clock.offref(ref); } });
}

function buildPopover(el: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign, st: ClockState, refresh: () => void): void {
	const cal = st.calendar;
	el.createDiv({ cls: 'popover-title nimble-clock-now', text: formatMoment(cal, st.now) });
	const run = async (jump: string, label?: string) => {
		if (!(await plugin.clock.advance(c, jump, label))) { new Notice(`The ${cal.name} calendar doesn't understand "${jump}".`); return; }
		refresh();
	};
	const steps = el.createDiv({ cls: 'nimble-clock-steps' });
	for (const b of stepButtons(cal)) {
		const btn = steps.createEl('button', { cls: 'nimble-clock-step', text: b.label });
		btn.onclick = () => void run(b.jump, b.label);
	}
	if (cal.quick.length) {
		const quick = el.createDiv({ cls: 'nimble-clock-quick' });
		for (const q of cal.quick) {
			const btn = quick.createEl('button', { cls: 'nimble-clock-step', attr: { title: q.jump } });
			btn.createSpan({ text: q.label });
			btn.onclick = () => void run(q.jump, q.label);
		}
	}

	// "+3 days 4 hours"
	const typed = el.createDiv({ cls: 'nimble-clock-field' });
	const input = typed.createEl('input', { attr: { type: 'text', placeholder: '+3 days 4 hours', 'aria-label': 'Advance by', spellcheck: 'false' } });
	const go = typed.createEl('button', { cls: 'mod-cta', text: 'Add' });
	const err = el.createDiv({ cls: 'nimble-clock-error' });
	const add = async () => {
		const v = input.value.trim();
		if (!v) return;
		if (!(await plugin.clock.advance(c, v, v.startsWith('+') ? v : `+${v}`))) { err.setText(`Try "2 days", "4 hours" or "until ${cal.segments[0]?.name ?? '06:00'}".`); return; }
		refresh();
	};
	input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } };
	go.onclick = () => void add();

	const foot = el.createDiv({ cls: 'nimble-clock-foot' });
	const setBtn = foot.createEl('button', { text: 'Set date…' });
	setBtn.onclick = () => {
		foot.empty();
		const row = foot.createDiv({ cls: 'nimble-clock-field' });
		const field = row.createEl('input', { attr: { type: 'text', 'aria-label': 'Date', spellcheck: 'false' } });
		field.value = formatWorldDate(cal, st.now);
		const ok = row.createEl('button', { cls: 'mod-cta', text: 'Set' });
		const hint = foot.createDiv({ cls: 'nimble-clock-hint', text: cal.months.length ? 'Year-month-day hour:minute, like 1247-03-12 14:30' : 'Day and time, like day 14 08:00' });
		const apply = async () => {
			const m = parseWorldDate(cal, field.value);
			if (m === null) { hint.setText(cal.months.length ? 'Use year-month-day, like 1247-03-12 14:30' : 'Use a day number, like day 14'); hint.addClass('is-error'); return; }
			await plugin.clock.set(c, m, 'Set date');
			refresh();
		};
		field.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); void apply(); } };
		ok.onclick = () => void apply();
		window.setTimeout(() => { field.focus(); field.select(); }, 0);
	};
	const last = plugin.clock.history(c).slice(-1)[0];
	const undo = foot.createEl('button', { text: last ? `Undo ${last.label ?? 'last change'}` : 'Undo last change' });
	undo.disabled = !last;
	undo.onclick = async () => { await plugin.clock.undo(c); refresh(); };
	const calRow = el.createDiv({ cls: 'nimble-clock-calendar' });
	calRow.createSpan({ text: st.calendarFile ? `Calendar: ${cal.name}` : 'Counting days. ' });
	if (st.calendarFile) {
		const open = calRow.createEl('a', { text: 'Open', href: '#' });
		open.onclick = (e) => { e.preventDefault(); closePopover(); void plugin.app.workspace.getLeaf(false).openFile(st.calendarFile!); };
	} else {
		const pick = calRow.createEl('a', { text: 'Use a calendar…', href: '#' });
		pick.onclick = (e) => { e.preventDefault(); closePopover(); newCalendar(plugin, c); };
	}
}

// ----------------------------------------------------------------------------
// New calendar

class PresetPicker extends SuggestModal<CalendarPreset> {
	constructor(app: App, private pick: (p: CalendarPreset) => void) {
		super(app);
		this.setPlaceholder('Pick a calendar to start from…');
	}
	getSuggestions(q: string): CalendarPreset[] {
		const s = q.toLowerCase();
		return CALENDAR_PRESETS.filter(p => p.name.toLowerCase().includes(s) || p.desc.toLowerCase().includes(s));
	}
	renderSuggestion(p: CalendarPreset, el: HTMLElement): void {
		el.createDiv({ text: p.name });
		el.createEl('small', { cls: 'nimble-suggest-sub', text: p.desc });
	}
	onChooseSuggestion(p: CalendarPreset): void { this.pick(p); }
}

/**
 * New calendar: pick a preset, write it into a note next to the campaign home,
 * point the campaign at it (keeping the date), and open it for editing.
 */
export function newCalendar(plugin: NimbleStatblocksPlugin, c: Campaign | undefined): void {
	if (!c) { new Notice('Open a note in a campaign first: a calendar belongs to a campaign.'); return; }
	new PresetPicker(plugin.app, (p) => void (async () => {
		const before = await plugin.clock.state(c);
		const path = plugin.campaigns.available(`${c.folder}/${p.name === 'Day count' ? 'Calendar' : p.name}.md`);
		const file = await plugin.app.vault.create(path, calendarNote(p));
		const home = plugin.app.vault.getFileByPath(c.home.path);
		if (home) {
			const link = plugin.app.metadataCache.fileToLinktext(file, c.home.path, true);
			await plugin.app.fileManager.processFrontMatter(home, (fm: Record<string, unknown>) => {
				fm.calendar = `[[${link}]]`;
				// Keep the day you were on (as a day count from the start) so the clock doesn't jump.
				if (before.set) fm['world-date'] = `day ${Math.floor(before.now / (before.calendar.hours * before.calendar.minutes)) + 1}`;
			});
		}
		await plugin.app.workspace.getLeaf(false).openFile(file, { state: { mode: 'source' } });
		plugin.clock.trigger('changed', c.folder);
	})()).open();
}

// ----------------------------------------------------------------------------
// ```nimble-clock

export function registerClockBlock(plugin: NimbleStatblocksPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('nimble-clock', (_source, el, ctx: MarkdownPostProcessorContext) => {
		const child = new MarkdownRenderChild(el);
		ctx.addChild(child);
		const c = plugin.campaigns.of(ctx.sourcePath) ?? plugin.campaigns.active;
		if (!c) {
			el.createDiv({ cls: 'nimble-error', text: 'This clock isn\'t in a campaign. Put the note in a campaign folder, or open a campaign first.' });
			return;
		}
		renderClock(el, plugin, c, child, 'block');
	});
}
