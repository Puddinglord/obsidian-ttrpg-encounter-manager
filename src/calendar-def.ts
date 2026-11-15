// Campaign calendars and the time model. Pure: no Obsidian imports.
//
// A moment is a whole number of minutes since the start of year 1 of a
// calendar. Every unit anyone sees (segment, hour, day, weekday, month, year)
// is worked out from that number, advancing time is addition, and every format
// is a function of the number.
//
//   ```nimble-calendar
//   name: Reckoning of Balbom
//   hours: 24
//   minutes: 60
//   segments: Morning 6, Day 12, Evening 18, Night 0
//   week: Firstday, Seconday, Thirdday, Fourthday, Fifthday, Sixthday, Restday
//   months:
//   - Deepfrost | 30
//   - Thaw | 30
//   year-start: 1
//   era: AB
//   step: segment
//   format: {weekday}, {day} {month} {year} {era} · {segment}
//   quick:
//   - Short rest | 1 hour
//   - Camp | until Morning
//   ```
//
// Without months the calendar is a plain day count ("Day 14"). Leap years,
// seasons and moons aren't here yet; the block keeps any line it doesn't know,
// so they can be added later without breaking anyone's notes.

export const STEPS = ['day', 'segment', 'hour', 'minute'] as const;
export type Step = typeof STEPS[number];

export interface Segment { name: string; /** Hour of the day it starts. */ start: number }
export interface Month { name: string; days: number }
export interface QuickJump { label: string; jump: string }

export interface CalendarDef {
	name: string;
	/** Hours in a day. */
	hours: number;
	/** Minutes in an hour. */
	minutes: number;
	/** Named parts of the day, sorted by start hour. */
	segments: Segment[];
	week: string[];
	months: Month[];
	/** The first year's number. */
	yearStart: number;
	era: string;
	step: Step;
	/** Empty: a default for the step. */
	format: string;
	quick: QuickJump[];
}

/** A moment split into what people read. */
export interface WorldDate {
	/** Year as written (yearStart for the first). Always yearStart in a calendar without months. */
	year: number;
	/** 1-based month; 0 in a calendar without months. */
	month: number;
	/** Day of the month, or the day count without months (1-based). */
	day: number;
	hour: number;
	minute: number;
}

export function emptyCalendar(name = 'Day count'): CalendarDef {
	return { name, hours: 24, minutes: 60, segments: [], week: [], months: [], yearStart: 1, era: '', step: 'day', format: '', quick: [] };
}

// ----------------------------------------------------------------------------
// Sizes

export const minutesPerDay = (c: CalendarDef) => c.hours * c.minutes;
export const daysPerYear = (c: CalendarDef) => c.months.reduce((n, m) => n + m.days, 0);
const floorDiv = (a: number, b: number) => Math.floor(a / b);
const mod = (a: number, b: number) => ((a % b) + b) % b;

// ----------------------------------------------------------------------------
// Minutes ↔ dates

export function toDate(c: CalendarDef, moment: number): WorldDate {
	const mpd = minutesPerDay(c);
	const m = Math.max(0, Math.floor(moment));
	const dayIndex = floorDiv(m, mpd);
	const inDay = m - dayIndex * mpd;
	const hour = floorDiv(inDay, c.minutes);
	const minute = inDay - hour * c.minutes;
	const ypd = daysPerYear(c);
	if (!ypd) return { year: c.yearStart, month: 0, day: dayIndex + 1, hour, minute };
	const y = floorDiv(dayIndex, ypd);
	let doy = dayIndex - y * ypd;
	let month = 0;
	while (month < c.months.length - 1 && doy >= c.months[month].days) { doy -= c.months[month].days; month++; }
	return { year: c.yearStart + y, month: month + 1, day: doy + 1, hour, minute };
}

/** The moment a date names. Out-of-range parts are clamped (day 31 of a 30-day month is its last day). */
export function toMoment(c: CalendarDef, d: WorldDate): number {
	const mpd = minutesPerDay(c);
	const hour = Math.max(0, Math.min(c.hours - 1, Math.floor(d.hour || 0)));
	const minute = Math.max(0, Math.min(c.minutes - 1, Math.floor(d.minute || 0)));
	const ypd = daysPerYear(c);
	let dayIndex: number;
	if (!ypd) dayIndex = Math.max(1, Math.floor(d.day || 1)) - 1;
	else {
		const y = Math.max(0, Math.floor(d.year) - c.yearStart);
		const mi = Math.max(1, Math.min(c.months.length, Math.floor(d.month || 1))) - 1;
		const day = Math.max(1, Math.min(c.months[mi].days, Math.floor(d.day || 1)));
		dayIndex = y * ypd + c.months.slice(0, mi).reduce((n, m) => n + m.days, 0) + day - 1;
	}
	return dayIndex * mpd + hour * c.minutes + minute;
}

/** 0-based weekday, counting on from the first day of year 1 (weeks run on across years). -1 without a week. */
export function weekdayOf(c: CalendarDef, moment: number): number {
	return c.week.length ? mod(floorDiv(Math.max(0, moment), minutesPerDay(c)), c.week.length) : -1;
}

/** The segment the moment falls in, or -1 without segments. Segments wrap around midnight. */
export function segmentOf(c: CalendarDef, moment: number): number {
	if (!c.segments.length) return -1;
	const inDay = mod(moment, minutesPerDay(c));
	let at = c.segments.length - 1; // before the first start, it's still the last segment of the night
	c.segments.forEach((s, i) => { if (s.start * c.minutes <= inDay) at = i; });
	return at;
}

// ----------------------------------------------------------------------------
// world-date: "1247-03-12 14:30", or "day 14 06:00" without months

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function formatWorldDate(c: CalendarDef, moment: number): string {
	const d = toDate(c, moment);
	const time = `${pad(d.hour)}:${pad(d.minute)}`;
	const showTime = c.step !== 'day' || d.hour || d.minute;
	const date = d.month ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : `day ${d.day}`;
	return showTime ? `${date} ${time}` : date;
}

/** Read a world-date. Null when it isn't one. */
export function parseWorldDate(c: CalendarDef, text: string): number | null {
	const s = String(text ?? '').trim().toLowerCase();
	const time = /(?:[ t,]+(\d{1,2}):(\d{2}))?\s*$/;
	const ymd = new RegExp(`^(-?\\d+)-(\\d{1,2})-(\\d{1,3})${time.source}`).exec(s);
	if (ymd) {
		const [, y, m, d, hh, mm] = ymd;
		// A day count calendar reads a full date as a day count from its first day.
		if (!c.months.length) return toMoment(c, { year: 0, month: 0, day: Number(d), hour: Number(hh ?? 0), minute: Number(mm ?? 0) });
		return toMoment(c, { year: Number(y), month: Number(m), day: Number(d), hour: Number(hh ?? 0), minute: Number(mm ?? 0) });
	}
	const day = new RegExp(`^(?:day\\s*)?(\\d+)${time.source}`).exec(s);
	if (day) {
		const n = Number(day[1]);
		if (!c.months.length) return toMoment(c, { year: 0, month: 0, day: n, hour: Number(day[2] ?? 0), minute: Number(day[3] ?? 0) });
		// "day 40" in a calendar with months: the 40th day of the first year.
		const mpd = minutesPerDay(c);
		return (Math.max(1, n) - 1) * mpd + Number(day[2] ?? 0) * c.minutes + Number(day[3] ?? 0);
	}
	return null;
}

// ----------------------------------------------------------------------------
// Formatting

export function defaultFormat(c: CalendarDef): string {
	let date = c.months.length ? '{day} {month} {year}' : 'Day {day}';
	if (c.months.length && c.era) date += ' {era}';
	if (c.week.length) date = `{weekday}, ${date}`;
	if (c.step === 'segment' && c.segments.length) return `${date} · {segment}`;
	if (c.step === 'hour' || c.step === 'minute' || (c.step === 'segment' && !c.segments.length)) return `${date} · {time}`;
	return date;
}

/** The moment as the calendar's format says, or its default for the step. */
export function formatMoment(c: CalendarDef, moment: number, format = c.format || defaultFormat(c)): string {
	const d = toDate(c, moment);
	const wd = weekdayOf(c, moment);
	const sg = segmentOf(c, moment);
	const values: Record<string, string> = {
		weekday: wd >= 0 ? c.week[wd] : '',
		day: String(d.day),
		month: d.month ? c.months[d.month - 1].name : '',
		'month-number': d.month ? String(d.month) : '',
		year: c.months.length ? String(d.year) : '',
		era: c.era,
		segment: sg >= 0 ? c.segments[sg].name : '',
		hour: pad(d.hour),
		minute: pad(d.minute),
		time: `${pad(d.hour)}:${pad(d.minute)}`,
	};
	const out = format.replace(/\{([a-z-]+)\}/g, (all, k: string) => (k in values ? values[k] : all));
	// Tidy what an empty part leaves behind: doubled spaces and separators with nothing on one side.
	return out
		.replace(/\s{2,}/g, ' ')
		.replace(/(^|\s)[,·|–-](?=\s*(?:[,·|–-]|$))/g, '$1')
		.replace(/^[\s,·|–-]+|[\s,·|–-]+$/g, '')
		.replace(/\s+,/g, ',')
		.replace(/\s{2,}/g, ' ');
}

/** "Day 14 → 17", "12 Thaw → 15 Thaw": a span from one moment to another, shortened when they share a month and year. */
export function formatSpan(c: CalendarDef, from: number, to: number | null): string {
	const short = (m: number) => {
		const d = toDate(c, m);
		return d.month ? `${d.day} ${c.months[d.month - 1].name}` : `Day ${d.day}`;
	};
	if (to === null) return short(from);
	const a = toDate(c, from);
	const b = toDate(c, to);
	if (a.year === b.year && a.month === b.month && a.day === b.day) return short(from);
	if (!a.month) return `Day ${a.day} → ${b.day}`;
	return `${short(from)} → ${short(to)}`;
}

// ----------------------------------------------------------------------------
// Advancing time

/** Unit words → what they add. Segment words step through the day's segments. */
const UNITS: Record<string, 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'segment'> = {
	m: 'minute', min: 'minute', mins: 'minute', minute: 'minute', minutes: 'minute',
	h: 'hour', hr: 'hour', hrs: 'hour', hour: 'hour', hours: 'hour',
	d: 'day', day: 'day', days: 'day',
	w: 'week', wk: 'week', week: 'week', weeks: 'week',
	month: 'month', months: 'month',
	y: 'year', yr: 'year', year: 'year', years: 'year',
	segment: 'segment', segments: 'segment', quarter: 'segment', quarters: 'segment', watch: 'segment', watches: 'segment', shift: 'segment', shifts: 'segment',
};

/** One length in a calendar: "3 days 4 hours", "1 quarter", "2 watches", "+10 min". Null when it isn't one. */
export function parseDuration(text: string): { n: number; unit: typeof UNITS[string] }[] | null {
	const s = String(text ?? '').trim().toLowerCase().replace(/^\+\s*/, '');
	if (!s) return null;
	const parts: { n: number; unit: typeof UNITS[string] }[] = [];
	const re = /(\d+(?:\.\d+)?|an?|one)\s*([a-z]+)\s*(?:,|and)?\s*/gy;
	let at = 0;
	let m: RegExpExecArray | null;
	re.lastIndex = 0;
	while ((m = re.exec(s))) {
		const unit = UNITS[m[2]];
		if (!unit) return null;
		const n = /^(a|an|one)$/.test(m[1]) ? 1 : Number(m[1]);
		parts.push({ n, unit });
		at = re.lastIndex;
	}
	return parts.length && at === s.length ? parts : null;
}

/** Add whole segments: keep the same place inside the segment (as far as the next one is long). */
function addSegments(c: CalendarDef, moment: number, n: number): number {
	const mpd = minutesPerDay(c);
	if (!c.segments.length) return moment + Math.round(n * mpd / 4);
	let m = moment;
	const whole = Math.floor(n);
	for (let k = 0; k < whole; k++) {
		const i = segmentOf(c, m);
		const start = segmentStartBefore(c, m, i);
		const into = m - start;
		const next = nextSegmentStart(c, m);
		const len = segmentLength(c, (i + 1) % c.segments.length);
		m = next + Math.min(into, len - 1);
	}
	const frac = n - whole;
	if (frac > 0) m += Math.round(frac * segmentLength(c, segmentOf(c, m)));
	return m;
}

function segmentLength(c: CalendarDef, i: number): number {
	const mpd = minutesPerDay(c);
	const a = c.segments[i].start * c.minutes;
	const b = c.segments[(i + 1) % c.segments.length].start * c.minutes;
	return mod(b - a - 1, mpd) + 1;
}

/** When the segment `i` (which `moment` is in) began. */
function segmentStartBefore(c: CalendarDef, moment: number, i: number): number {
	const mpd = minutesPerDay(c);
	const day = floorDiv(moment, mpd) * mpd;
	const start = day + c.segments[i].start * c.minutes;
	return start <= moment ? start : start - mpd;
}

/** The next time any segment starts, strictly after `moment`. */
function nextSegmentStart(c: CalendarDef, moment: number): number {
	const mpd = minutesPerDay(c);
	const day = floorDiv(moment, mpd) * mpd;
	let best = Infinity;
	for (const s of c.segments) {
		let t = day + s.start * c.minutes;
		if (t <= moment) t += mpd;
		best = Math.min(best, t);
	}
	return best;
}

/** Add a parsed length. Months and years keep the day of the month (clamped to the new month's length). */
export function addDuration(c: CalendarDef, moment: number, parts: { n: number; unit: typeof UNITS[string] }[]): number {
	let m = moment;
	const mpd = minutesPerDay(c);
	for (const { n, unit } of parts) {
		if (unit === 'minute') m += Math.round(n);
		else if (unit === 'hour') m += Math.round(n * c.minutes);
		else if (unit === 'day') m += Math.round(n * mpd);
		else if (unit === 'week') m += Math.round(n * (c.week.length || 7) * mpd);
		else if (unit === 'segment') m = addSegments(c, m, n);
		else {
			const d = toDate(c, m);
			if (!c.months.length) { m += Math.round(n * (unit === 'year' ? 360 : 30) * mpd); continue; }
			const total = (d.year - c.yearStart) * c.months.length + (d.month - 1) + Math.round(n) * (unit === 'year' ? c.months.length : 1);
			const year = c.yearStart + floorDiv(total, c.months.length);
			const month = mod(total, c.months.length) + 1;
			m = toMoment(c, { ...d, year, month });
		}
	}
	return Math.max(0, m);
}

/**
 * Where a jump lands: a length ("1 hour", "+3 days 4 hours"), "until Morning"
 * (the next time that segment starts, strictly later), or "until 14:00". Null
 * when the text isn't a jump this calendar understands.
 */
export function applyJump(c: CalendarDef, moment: number, jump: string): number | null {
	const s = jump.trim();
	const until = /^until\s+(.+)$/i.exec(s);
	if (until) {
		const what = until[1].trim();
		const mpd = minutesPerDay(c);
		const day = floorDiv(moment, mpd) * mpd;
		const clock = /^(\d{1,2})(?::(\d{2}))?$/.exec(what);
		let start: number | null = null;
		if (clock) {
			const h = Number(clock[1]);
			const mi = Number(clock[2] ?? 0);
			if (h >= c.hours || mi >= c.minutes) return null;
			start = h * c.minutes + mi;
		} else {
			const seg = c.segments.find(x => x.name.toLowerCase() === what.toLowerCase());
			if (!seg) return null;
			start = seg.start * c.minutes;
		}
		let t = day + start;
		if (t <= moment) t += mpd;
		return t;
	}
	const parts = parseDuration(s);
	return parts ? addDuration(c, moment, parts) : null;
}

/** How many minutes a length is, starting from `moment` (segments and months depend on where you start). */
export function durationMinutes(c: CalendarDef, moment: number, text: string): number | null {
	const parts = parseDuration(text);
	return parts ? addDuration(c, moment, parts) - moment : null;
}

/** The step buttons the clock offers for a calendar's `step`. */
export function stepButtons(c: CalendarDef): { label: string; jump: string }[] {
	const seg = c.segments.length ? segmentWord(c) : '';
	switch (c.step) {
		case 'minute': return [{ label: '+10 min', jump: '10 minutes' }, { label: '+1 hour', jump: '1 hour' }, { label: '+1 day', jump: '1 day' }];
		case 'hour': return [{ label: '+1 hour', jump: '1 hour' }, { label: '+4 hours', jump: '4 hours' }, { label: '+1 day', jump: '1 day' }];
		case 'segment': return seg ? [{ label: `+1 ${seg}`, jump: '1 segment' }, { label: '+1 day', jump: '1 day' }] : [{ label: '+1 hour', jump: '1 hour' }, { label: '+1 day', jump: '1 day' }];
		default: return [{ label: '+1 day', jump: '1 day' }, { label: '+1 week', jump: '1 week' }];
	}
}

/** What one segment is called on a button: "quarter" for four, "watch" for six, else "segment". */
export function segmentWord(c: CalendarDef): string {
	const n = c.segments.length;
	if (n === 4) return 'quarter';
	if (n === 6 && c.segments.some(s => /watch/i.test(s.name))) return 'watch';
	if (n === 2) return 'half-day';
	return 'segment';
}

// ----------------------------------------------------------------------------
// The block: parsing and writing, lossless

type Key = 'name' | 'hours' | 'minutes' | 'segments' | 'week' | 'year-start' | 'era' | 'step' | 'format';
type ListKey = 'months' | 'quick';
const KEYS: Key[] = ['name', 'hours', 'minutes', 'segments', 'week', 'year-start', 'era', 'step', 'format'];
const LISTS: ListKey[] = ['months', 'quick'];
const ORDER: (Key | ListKey)[] = ['name', 'hours', 'minutes', 'segments', 'week', 'months', 'year-start', 'era', 'step', 'format', 'quick'];

type Slot = { key: Key; name: string; line: string; was: string } | { list: ListKey; header: string; tail: string[]; items: { line: string; was: string }[] } | { raw: string };
const LAYOUT = new WeakMap<CalendarDef, Slot[]>();

function read(c: CalendarDef, key: Key, v: string): void {
	const n = (x: string, lo: number, hi: number) => { const k = Math.round(Number(x)); return Number.isFinite(k) && k >= lo && k <= hi ? k : null; };
	switch (key) {
		case 'name': c.name = v || c.name; break;
		case 'hours': c.hours = n(v, 1, 1000) ?? 24; break;
		case 'minutes': c.minutes = n(v, 1, 1000) ?? 60; break;
		case 'segments':
			c.segments = v.split(',').map(p => /^(.*?)\s+(\d{1,3})$/.exec(p.trim())).filter((m): m is RegExpExecArray => !!m && !!m[1].trim())
				.map(m => ({ name: m[1].trim(), start: Number(m[2]) })).filter(s => s.start < c.hours)
				.sort((a, b) => a.start - b.start);
			break;
		case 'week': c.week = v.split(',').map(x => x.trim()).filter(Boolean); break;
		case 'year-start': c.yearStart = n(v, -1e9, 1e9) ?? 1; break;
		case 'era': c.era = v; break;
		case 'step': c.step = (STEPS as readonly string[]).includes(v.toLowerCase()) ? v.toLowerCase() as Step : c.step; break;
		case 'format': c.format = v; break;
	}
}

function write(c: CalendarDef, key: Key): string | null {
	switch (key) {
		case 'name': return c.name;
		case 'hours': return String(c.hours);
		case 'minutes': return String(c.minutes);
		case 'segments': return c.segments.length ? c.segments.map(s => `${s.name} ${s.start}`).join(', ') : null;
		case 'week': return c.week.length ? c.week.join(', ') : null;
		case 'year-start': return String(c.yearStart);
		case 'era': return c.era || null;
		case 'step': return c.step;
		case 'format': return c.format || null;
	}
}

/** Keys left at their default aren't added to a block that doesn't have them. */
function isDefault(c: CalendarDef, key: Key): boolean {
	return (key === 'hours' && c.hours === 24) || (key === 'minutes' && c.minutes === 60) || (key === 'year-start' && c.yearStart === 1);
}

function snap(c: CalendarDef, key: Key): string {
	return JSON.stringify(key === 'segments' ? c.segments : key === 'week' ? c.week : key === 'year-start' ? c.yearStart : c[key]);
}

const itemLine = (list: ListKey, it: Month | QuickJump) => list === 'months' ? `- ${(it as Month).name.replace(/\|/g, '/')} | ${(it as Month).days}` : `- ${(it as QuickJump).label.replace(/\|/g, '/')} | ${(it as QuickJump).jump}`;

export function parseCalendar(source: string): CalendarDef {
	const c = emptyCalendar('Calendar');
	const slots: Slot[] = [];
	let list: Extract<Slot, { list: ListKey }> | null = null;
	let other = false;
	for (const rawLine of source.split(/\r?\n/)) {
		const text = rawLine.replace(/\s+$/, '');
		const line = text.trim();
		if (!line) { if (!list) slots.push({ raw: text }); continue; }
		if (other && (/^\s/.test(text) || /^[-*+]\s/.test(line))) { slots.push({ raw: text }); continue; }
		other = false;
		if (list && /^[-*+]\s/.test(line)) {
			const [a, b] = line.replace(/^[-*+]\s*/, '').split('|').map(x => x.trim());
			if (list.list === 'months') {
				const days = Math.round(Number(b));
				if (a && days > 0 && days < 10000) { c.months.push({ name: a, days }); list.items.push({ line: text, was: JSON.stringify({ name: a, days }) }); continue; }
			} else if (a && b) { c.quick.push({ label: a, jump: b }); list.items.push({ line: text, was: JSON.stringify({ label: a, jump: b }) }); continue; }
			list.tail.push(text);
			continue;
		}
		const kv = /^([a-z][\w -]*?):\s*(.*)$/i.exec(line);
		const key = kv?.[1].trim().toLowerCase();
		if (kv && (LISTS as string[]).includes(key!) && !kv[2].trim()) {
			const prev = slots.find((s): s is Extract<Slot, { list: ListKey }> => 'list' in s && s.list === key);
			if (prev) { list = prev; slots.push({ raw: text }); continue; }
			list = { list: key as ListKey, header: text, tail: [], items: [] };
			slots.push(list);
			continue;
		}
		list = null;
		if (kv && (KEYS as string[]).includes(key!)) {
			const k = key as Key;
			const prev = slots.findIndex(s => 'key' in s && s.key === k);
			if (prev >= 0) slots[prev] = { raw: (slots[prev] as { line: string }).line };
			read(c, k, kv[2].trim());
			slots.push({ key: k, name: kv[1].trim(), line: text, was: snap(c, k) });
			continue;
		}
		if (kv && !kv[2].trim()) other = true; // an unknown section: its items stay with it
		slots.push({ raw: text });
	}
	while (slots.length && 'raw' in slots[slots.length - 1] && !(slots[slots.length - 1] as { raw: string }).raw.trim()) slots.pop();
	LAYOUT.set(c, slots);
	return c;
}

export function calendarSource(c: CalendarDef): string {
	const slots: Slot[] = [...(LAYOUT.get(c) ?? [])];
	const has = (k: Key | ListKey) => slots.some(s => ('key' in s && s.key === k) || ('list' in s && s.list === k));
	for (const k of ORDER) {
		if (has(k)) continue;
		const isList = (LISTS as string[]).includes(k);
		if (isList ? !(k === 'months' ? c.months.length : c.quick.length) : write(c, k as Key) === null || isDefault(c, k as Key)) continue;
		const slot: Slot = isList ? { list: k as ListKey, header: `${k}:`, tail: [], items: [] } : { key: k as Key, name: k, line: '', was: '\u0000' };
		const at = slots.findIndex(s => ('key' in s || 'list' in s) && ORDER.indexOf('key' in s ? s.key : (s as { list: ListKey }).list) > ORDER.indexOf(k));
		if (at < 0) slots.push(slot);
		else slots.splice(at, 0, slot);
	}
	const out: string[] = [];
	for (const s of slots) {
		if ('raw' in s) { out.push(s.raw); continue; }
		if ('list' in s) {
			const items: (Month | QuickJump)[] = s.list === 'months' ? c.months : c.quick;
			if (!items.length && !s.tail.length) continue;
			out.push(s.header);
			items.forEach((it, i) => {
				const orig = s.items[i];
				out.push(orig && orig.was === JSON.stringify(it) ? orig.line : itemLine(s.list, it));
			});
			out.push(...s.tail);
			continue;
		}
		const v = write(c, s.key);
		if (v === null) continue;
		out.push(s.was === snap(c, s.key) ? s.line : `${s.name}: ${v}`);
	}
	return out.join('\n');
}
