// A calendar note's ```nimble-calendar block, drawn as a month you can page
// through: today highlighted, and every note in the campaign with a
// `world-date` that day listed on it. It's a read-only overview; the block's
// text is the calendar itself, so editing the note edits the calendar.

import { MarkdownPostProcessorContext, MarkdownRenderChild, setIcon, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { CalendarDef, daysPerYear, formatMoment, minutesPerDay, parseCalendar, parseWorldDate, toDate, toMoment, weekdayOf } from './calendar-def';
import type { Campaign } from './campaign-model';

/** Days shown per page for a calendar without months. */
const PAGE = 28;

export function registerCalendarBlock(plugin: NimbleStatblocksPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('nimble-calendar', (source, el, ctx) => {
		ctx.addChild(new CalendarBlock(plugin, el, source, ctx));
	});
}

class CalendarBlock extends MarkdownRenderChild {
	private cal: CalendarDef;
	/** Which page is shown: a month counted from the first month of year 1, or a 28-day page for a day count. */
	private page: number | null = null;

	constructor(private plugin: NimbleStatblocksPlugin, el: HTMLElement, source: string, private ctx: MarkdownPostProcessorContext) {
		super(el);
		this.cal = parseCalendar(source);
		const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
		if (this.cal.name === 'Calendar' && file) this.cal.name = file.basename;
	}

	onload(): void {
		void this.render();
		this.registerEvent(this.plugin.clock.on('changed', () => void this.render()));
	}

	/** The campaign whose "today" this shows: the active one if it uses this calendar, else any that does, else the note's own. */
	private campaign(): Campaign | undefined {
		const store = this.plugin.campaigns;
		const uses = (c: Campaign) => this.plugin.clock.calendarFileOf(c)?.path === this.ctx.sourcePath;
		if (store.active && uses(store.active)) return store.active;
		return store.campaigns.find(uses) ?? store.of(this.ctx.sourcePath);
	}

	private pageOf(moment: number): number {
		const d = toDate(this.cal, moment);
		if (!this.cal.months.length) return Math.floor((d.day - 1) / PAGE);
		return (d.year - this.cal.yearStart) * this.cal.months.length + d.month - 1;
	}

	/** Every note in the campaign with a world-date, by day index. */
	private dated(c: Campaign | undefined): Map<number, TFile[]> {
		const out = new Map<number, TFile[]>();
		if (!c) return out;
		const mpd = minutesPerDay(this.cal);
		for (const f of this.plugin.app.vault.getMarkdownFiles()) {
			if (!f.path.startsWith(`${c.folder}/`) || f.path === c.home.path) continue;
			const raw: unknown = this.plugin.app.metadataCache.getFileCache(f)?.frontmatter?.['world-date'];
			const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '';
			const m = text ? parseWorldDate(this.cal, text) : null;
			if (m === null) continue;
			const day = Math.floor(m / mpd);
			const list = out.get(day) ?? [];
			list.push(f);
			out.set(day, list);
		}
		return out;
	}

	private async render(): Promise<void> {
		const el = this.containerEl;
		const c = this.campaign();
		const uses = c && this.plugin.clock.calendarFileOf(c)?.path === this.ctx.sourcePath;
		const now = uses ? (await this.plugin.clock.state(c)).now : null;
		el.empty();
		el.addClass('nimble-calendar');
		const cal = this.cal;
		this.page ??= this.pageOf(now ?? 0);
		const mpd = minutesPerDay(cal);

		const head = el.createDiv({ cls: 'nimble-calendar-head' });
		head.createDiv({ cls: 'nimble-calendar-name', text: cal.name });
		if (now !== null) head.createDiv({ cls: 'nimble-calendar-now', text: `Today: ${formatMoment(cal, now)}` });
		const nav = el.createDiv({ cls: 'nimble-calendar-nav' });
		const prev = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': cal.months.length ? 'Previous month' : 'Earlier days' } });
		setIcon(prev, 'chevron-left');
		const title = nav.createDiv({ cls: 'nimble-calendar-title' });
		const next = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': cal.months.length ? 'Next month' : 'Later days' } });
		setIcon(next, 'chevron-right');
		prev.disabled = this.page <= 0;
		prev.onclick = () => { this.page = Math.max(0, (this.page ?? 0) - 1); void this.render(); };
		next.onclick = () => { this.page = (this.page ?? 0) + 1; void this.render(); };
		if (now !== null && this.page !== this.pageOf(now)) {
			const today = nav.createEl('button', { cls: 'nimble-calendar-today-btn', text: 'Today' });
			today.onclick = () => { this.page = this.pageOf(now); void this.render(); };
		}

		// The page's first day (as a day index from the start) and length.
		let first: number;
		let length: number;
		if (cal.months.length) {
			const y = Math.floor(this.page / cal.months.length);
			const mi = this.page % cal.months.length;
			first = Math.floor(toMoment(cal, { year: cal.yearStart + y, month: mi + 1, day: 1, hour: 0, minute: 0 }) / mpd);
			length = cal.months[mi].days;
			title.setText(`${cal.months[mi].name} ${cal.yearStart + y}${cal.era ? ` ${cal.era}` : ''}`);
		} else {
			first = this.page * PAGE;
			length = PAGE;
			title.setText(`Days ${first + 1}–${first + PAGE}`);
		}
		if (daysPerYear(cal) === 0 && !cal.week.length) title.addClass('is-count');

		const cols = cal.week.length || 7;
		const grid = el.createDiv({ cls: 'nimble-calendar-grid' });
		grid.setCssProps({ '--cal-cols': String(cols) });
		if (cal.week.length) for (const w of cal.week) grid.createDiv({ cls: 'nimble-calendar-wd', text: w.slice(0, 3), attr: { title: w } });
		const lead = cal.week.length ? weekdayOf(cal, first * mpd) : 0;
		for (let i = 0; i < lead; i++) grid.createDiv({ cls: 'nimble-calendar-day is-blank' });
		const dated = this.dated(c);
		const todayIdx = now === null ? -1 : Math.floor(now / mpd);
		for (let i = 0; i < length; i++) {
			const idx = first + i;
			const d = toDate(cal, idx * mpd);
			const cell = grid.createDiv({ cls: `nimble-calendar-day${idx === todayIdx ? ' is-today' : ''}`, attr: { 'aria-label': formatMoment(cal, idx * mpd, cal.months.length ? '{weekday} {day} {month} {year}' : '{weekday} Day {day}') } });
			cell.createDiv({ cls: 'nimble-calendar-num', text: String(d.day) });
			for (const f of dated.get(idx) ?? []) {
				const a = cell.createEl('a', { cls: 'nimble-calendar-note internal-link', text: f.basename, href: f.path, attr: { 'data-href': f.path } });
				a.addEventListener('click', (e) => { e.preventDefault(); void this.plugin.app.workspace.openLinkText(f.path, this.ctx.sourcePath, e.metaKey || e.ctrlKey); });
				a.addEventListener('mouseover', (event) => this.plugin.app.workspace.trigger('hover-link', { event, source: 'nimble-gm', hoverParent: this, targetEl: a, linktext: f.path, sourcePath: this.ctx.sourcePath }));
			}
		}
		if (!uses) {
			el.createDiv({ cls: 'nimble-calendar-hint', text: 'No campaign uses this calendar yet. Add calendar: "[[' + (this.plugin.app.vault.getFileByPath(this.ctx.sourcePath)?.basename ?? 'this note') + ']]" to a campaign home\'s properties, or use the clock\'s Use a calendar….' });
		}
	}
}
