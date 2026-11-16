// The campaign clock: where "now" is for each campaign, and every change to it.
//
// "Now" lives in the campaign home's frontmatter as readable text:
//
//   calendar: "[[Reckoning of Balbom]]"
//   world-date: 1247-03-12 14:30
//
// With no `calendar:` the campaign counts days (the Day count preset), so the
// clock works with nothing set up. Several campaigns can share one calendar
// note; each keeps its own world-date. Every change fires one `changed` event,
// so every clock on screen (panel, map chips, nimble-clock blocks) updates together.

import { Events, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { applyJump, CalendarDef, formatWorldDate, parseCalendar, parseWorldDate } from './calendar-def';
import { DAY_COUNT } from './calendar-presets';
import type { Campaign } from './campaign-model';

/** One change to a campaign's clock, kept so it can be undone. */
export interface ClockChange { from: number; to: number; at: number; label?: string }

export interface ClockState {
	calendar: CalendarDef;
	/** The calendar note, or null for the built-in day count. */
	calendarFile: TFile | null;
	now: number;
	/** The campaign home has a world-date (otherwise the clock shows the calendar's first day). */
	set: boolean;
}

const HISTORY = 20;
const FENCE = /^[ \t>]*(`{3,}|~{3,})[ \t]*nimble-calendar\b[^\n]*\n([\s\S]*?)^[ \t>]*\1[ \t]*$/m;

/** The body of the first ```nimble-calendar block in a note's text. */
export function calendarBlockOf(text: string): string | null {
	const m = FENCE.exec(text);
	return m ? m[2].split('\n').map(l => l.replace(/^[ \t]*>[ \t]?/, '')).join('\n') : null;
}

export class ClockStore extends Events {
	private cache = new Map<string, { mtime: number; def: CalendarDef }>();
	/**
	 * What each campaign's clock was last set to, until the metadata cache has
	 * caught up with the write (it can lag, or briefly have no frontmatter).
	 */
	private written = new Map<string, ClockState>();

	constructor(private plugin: NimbleStatblocksPlugin) {
		super();
	}

	private get app() { return this.plugin.app; }

	/** Watch calendar notes and campaign homes: a hand edit updates every clock. */
	start(): void {
		this.plugin.registerEvent(this.app.metadataCache.on('changed', (file) => {
			const isCalendar = this.cache.has(file.path) || this.app.metadataCache.getFileCache(file)?.frontmatter?.nimble === 'calendar';
			const isHome = this.plugin.campaigns.campaigns.some(c => c.home.path === file.path);
			if (isCalendar) this.cache.delete(file.path);
			if (isCalendar || isHome) this.trigger('changed', null);
		}));
	}

	/** The calendar note a campaign names in `calendar:`, if it exists. */
	calendarFileOf(c: Campaign): TFile | null {
		const home = this.app.vault.getFileByPath(c.home.path);
		const raw: unknown = home && this.app.metadataCache.getFileCache(home)?.frontmatter?.calendar;
		const link = typeof raw === 'string' ? raw.trim().replace(/^\[\[|\]\]$/g, '').split('|')[0].trim() : '';
		return link ? this.app.metadataCache.getFirstLinkpathDest(link, c.home.path) : null;
	}

	/** Read a calendar note's block (cached until the note changes). Null when it holds no calendar. */
	async readCalendar(file: TFile): Promise<CalendarDef | null> {
		const hit = this.cache.get(file.path);
		if (hit && hit.mtime === file.stat.mtime) return hit.def;
		const body = calendarBlockOf(await this.app.vault.cachedRead(file));
		if (body === null) return null;
		const def = parseCalendar(body);
		if (def.name === 'Calendar') def.name = file.basename;
		this.cache.set(file.path, { mtime: file.stat.mtime, def });
		return def;
	}

	async state(c: Campaign): Promise<ClockState> {
		const st = await this.read(c);
		const mine = this.written.get(c.folder);
		if (!mine) return st;
		if (st.set && st.now === mine.now && st.calendar.name === mine.calendar.name) { this.written.delete(c.folder); return st; }
		return mine;
	}

	private async read(c: Campaign): Promise<ClockState> {
		const file = this.calendarFileOf(c);
		const own = file ? await this.readCalendar(file) : null;
		const calendar = own ?? parseCalendar(DAY_COUNT.body);
		const home = this.app.vault.getFileByPath(c.home.path);
		const raw: unknown = home && this.app.metadataCache.getFileCache(home)?.frontmatter?.['world-date'];
		const parsed = raw === undefined || raw === null ? null : parseWorldDate(calendar, typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '');
		return { calendar, calendarFile: own ? file : null, now: parsed ?? 0, set: parsed !== null };
	}

	/** Undo history for a campaign, newest last. */
	history(c: Campaign): ClockChange[] {
		return this.plugin.settings.clockHistory?.[c.folder] ?? [];
	}

	/** Move a campaign's clock to a moment. Writes the home note and records the change for Undo. */
	async set(c: Campaign, to: number, label?: string, record = true): Promise<void> {
		const st = await this.state(c);
		const home = this.app.vault.getFileByPath(c.home.path);
		if (!home) return;
		const moment = Math.max(0, Math.round(to));
		this.written.set(c.folder, { ...st, now: moment, set: true });
		await this.app.fileManager.processFrontMatter(home, (fm: Record<string, unknown>) => {
			fm['world-date'] = formatWorldDate(st.calendar, moment);
		});
		// Don't hold on to it forever if the note is edited by hand meanwhile.
		window.setTimeout(() => { if (this.written.get(c.folder)?.now === moment) this.written.delete(c.folder); }, 4000);
		if (record && moment !== st.now) {
			const all = (this.plugin.settings.clockHistory ||= {});
			const list = (all[c.folder] ||= []);
			list.push({ from: st.now, to: moment, at: Date.now(), label });
			if (list.length > HISTORY) list.splice(0, list.length - HISTORY);
			await this.plugin.saveSettings();
		}
		this.trigger('changed', c.folder, { from: st.now, to: moment, label });
	}

	/** Advance by a jump the calendar understands ("1 quarter", "until Morning", "+3 days 4 hours"). False when it doesn't. */
	async advance(c: Campaign, jump: string, label?: string): Promise<boolean> {
		const st = await this.state(c);
		const to = applyJump(st.calendar, st.now, jump);
		if (to === null) return false;
		await this.set(c, to, label ?? jump);
		return true;
	}

	/** Put the clock back where it was before the last change. */
	async undo(c: Campaign): Promise<ClockChange | null> {
		const list = this.history(c);
		const last = list.pop();
		if (!last) return null;
		await this.plugin.saveSettings();
		await this.set(c, last.from, undefined, false);
		return last;
	}

	/** A note's own `world-date`, read in its campaign's calendar. */
	async noteDate(c: Campaign, path: string): Promise<number | null> {
		const f = this.app.vault.getFileByPath(path);
		const raw: unknown = f && this.app.metadataCache.getFileCache(f)?.frontmatter?.['world-date'];
		if (raw === undefined || raw === null) return null;
		const st = await this.state(c);
		return parseWorldDate(st.calendar, typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '');
	}
}
