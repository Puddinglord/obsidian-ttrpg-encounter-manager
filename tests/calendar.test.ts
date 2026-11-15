import { describe, expect, it } from 'vitest';
import {
	addDuration, applyJump, calendarSource, defaultFormat, durationMinutes, formatMoment, formatSpan, formatWorldDate, minutesPerDay,
	parseCalendar, parseDuration, parseWorldDate, segmentOf, stepButtons, toDate, toMoment, weekdayOf,
} from '../src/calendar-def';
import { CALENDAR_PRESETS, calendarNote, presetById } from '../src/calendar-presets';

const BALBOM = [
	'name: Reckoning of Balbom',
	'hours: 24',
	'minutes: 60',
	'segments: Morning 6, Day 12, Evening 18, Night 0',
	'week: Firstday, Seconday, Thirdday, Fourthday, Fifthday, Sixthday, Restday',
	'months:',
	'- Deepfrost | 30',
	'- Thaw | 30',
	'- Seedtime | 31',
	'year-start: 1',
	'era: AB',
	'step: segment',
	'format: {weekday}, {day} {month} {year} {era} · {segment}',
	'quick:',
	'- Short rest | 1 hour',
	'- Camp | until Morning',
	'- Travel day | 1 day',
].join('\n');

const cal = (id: string) => parseCalendar(presetById(id)!.body);
const H = 60;
const D = 24 * H;

describe('parsing a calendar block', () => {
	it('reads every key', () => {
		const c = parseCalendar(BALBOM);
		expect(c.name).toBe('Reckoning of Balbom');
		expect(c.hours).toBe(24);
		expect(c.segments.map(s => s.name)).toEqual(['Night', 'Morning', 'Day', 'Evening']);
		expect(c.week).toHaveLength(7);
		expect(c.months).toEqual([{ name: 'Deepfrost', days: 30 }, { name: 'Thaw', days: 30 }, { name: 'Seedtime', days: 31 }]);
		expect(c.era).toBe('AB');
		expect(c.step).toBe('segment');
		expect(c.quick.map(q => q.jump)).toEqual(['1 hour', 'until Morning', '1 day']);
	});

	it('writes an unchanged block back exactly, and keeps lines it doesn\'t know', () => {
		expect(calendarSource(parseCalendar(BALBOM))).toBe(BALBOM);
		const future = `${BALBOM}\nleap: every 4 years | Thaw +1\nmoons:\n- Sela | 29.5\n  phase: new`;
		const c = parseCalendar(future);
		expect(calendarSource(c)).toBe(future);
		c.era = 'AR';
		expect(calendarSource(c)).toBe(future.replace('era: AB', 'era: AR'));
	});

	it('writes changes in place and new keys in order', () => {
		const c = parseCalendar('name: X\nstep: day');
		c.months.push({ name: 'Only', days: 100 });
		c.week = ['A', 'B'];
		expect(calendarSource(c)).toBe('name: X\nweek: A, B\nmonths:\n- Only | 100\nstep: day');
	});

	it('defaults: 24 hours, 60 minutes, a day count', () => {
		const c = parseCalendar('');
		expect(minutesPerDay(c)).toBe(D);
		expect(c.months).toEqual([]);
		expect(formatMoment(c, 13 * D)).toBe('Day 14');
	});

	it('ignores bad values', () => {
		const c = parseCalendar('hours: zero\nsegments: Morning, Day 30, Dawn 5\nmonths:\n- Bad | -3\n- Good | 10\nstep: fortnight');
		expect(c.hours).toBe(24);
		expect(c.segments).toEqual([{ name: 'Dawn', start: 5 }]);
		expect(c.months).toEqual([{ name: 'Good', days: 10 }]);
		expect(c.step).toBe('day');
	});
});

describe('minutes ↔ dates for every preset', () => {
	for (const p of CALENDAR_PRESETS) {
		it(`${p.name}: every date round-trips`, () => {
			const c = parseCalendar(p.body);
			for (let m = 0; m < 800 * D; m += 997 * 7) {
				const d = toDate(c, m);
				expect(toMoment(c, d)).toBe(m);
				expect(parseWorldDate(c, formatWorldDate(c, m))).toBe(m - (c.step === 'day' ? 0 : 0));
			}
		});
	}

	it('12 months: day 365 is 31 December, day 366 is 1 January of year 2', () => {
		const c = cal('twelve-months');
		expect(toDate(c, 364 * D)).toEqual({ year: 1, month: 12, day: 31, hour: 0, minute: 0 });
		expect(toDate(c, 365 * D + 90)).toEqual({ year: 2, month: 1, day: 1, hour: 1, minute: 30 });
	});

	it('13 × 28: the year is 364 days, and every month starts on the same weekday', () => {
		const c = cal('thirteen-months');
		expect(toDate(c, 364 * D).year).toBe(2);
		for (let mo = 1; mo <= 13; mo++) expect(weekdayOf(c, toMoment(c, { year: 1, month: mo, day: 1, hour: 0, minute: 0 }))).toBe(0);
	});

	it('a day count has no years: day 1000 is just Day 1000', () => {
		const c = cal('day-count');
		expect(toDate(c, 999 * D)).toEqual({ year: 1, month: 0, day: 1000, hour: 0, minute: 0 });
		expect(formatMoment(c, 999 * D)).toBe('Day 1000');
	});

	it('clamps out-of-range parts', () => {
		const c = parseCalendar(BALBOM);
		expect(toDate(c, toMoment(c, { year: 1, month: 2, day: 99, hour: 30, minute: 99 }))).toEqual({ year: 1, month: 2, day: 30, hour: 23, minute: 59 });
		expect(toMoment(c, { year: -5, month: 0, day: 0, hour: 0, minute: 0 })).toBe(0);
	});

	it('year-start shifts the numbers, not the maths', () => {
		const c = parseCalendar(BALBOM.replace('year-start: 1', 'year-start: 1247'));
		expect(toDate(c, 0).year).toBe(1247);
		expect(toDate(c, 91 * D).year).toBe(1248);
	});

	it('odd day lengths: 20 hours of 100 minutes', () => {
		const c = parseCalendar('hours: 20\nminutes: 100\nmonths:\n- A | 10');
		expect(minutesPerDay(c)).toBe(2000);
		expect(toDate(c, 2000 * 3 + 1234)).toEqual({ year: 1, month: 1, day: 4, hour: 12, minute: 34 });
	});
});

describe('weeks and segments', () => {
	it('a week whose length doesn\'t divide the year runs on across years', () => {
		const c = parseCalendar(BALBOM); // 91-day year, 7-day week: 91 = 13 weeks exactly, so use a 5-day week
		const five = parseCalendar(BALBOM.replace(/week: .*/, 'week: A, B, C, D, E'));
		expect(weekdayOf(five, 0)).toBe(0);
		expect(weekdayOf(five, 91 * D)).toBe(91 % 5);
		expect(weekdayOf(five, 92 * D)).toBe(92 % 5);
		expect(weekdayOf(c, 91 * D)).toBe(0);
		expect(weekdayOf(parseCalendar(''), 5 * D)).toBe(-1);
	});

	it('segments wrap around midnight', () => {
		const c = parseCalendar(BALBOM);
		const name = (h: number) => c.segments[segmentOf(c, 3 * D + h * H)].name;
		expect(name(0)).toBe('Night');
		expect(name(5.9)).toBe('Night');
		expect(name(6)).toBe('Morning');
		expect(name(17)).toBe('Day');
		expect(name(23)).toBe('Evening');
		// Segments that don't start at midnight: before the first, it's still the last.
		const dn = cal('day-night');
		expect(dn.segments[segmentOf(dn, 3 * H)].name).toBe('Night');
	});
});

describe('adding time', () => {
	const c = parseCalendar(BALBOM);
	const at = (d: number, h: number, m = 0) => toMoment(c, { year: 1, month: 1, day: d, hour: h, minute: m });

	it('adds across segment, day, month and year boundaries', () => {
		expect(applyJump(c, at(1, 11), '1 hour')).toBe(at(1, 12));
		expect(applyJump(c, at(1, 23), '2 hours')).toBe(at(2, 1));
		expect(toDate(c, applyJump(c, at(30, 12), '1 day')!)).toEqual({ year: 1, month: 2, day: 1, hour: 12, minute: 0 });
		expect(toDate(c, applyJump(c, toMoment(c, { year: 1, month: 3, day: 31, hour: 20, minute: 0 }), '6 hours')!)).toEqual({ year: 2, month: 1, day: 1, hour: 2, minute: 0 });
		expect(applyJump(c, at(1, 0), '+3 days 4 hours')).toBe(at(4, 4));
		expect(applyJump(c, at(1, 0), '1 week')).toBe(at(8, 0));
	});

	it('segments keep your place in the segment', () => {
		expect(applyJump(c, at(1, 6), '1 quarter')).toBe(at(1, 12));
		expect(applyJump(c, at(1, 7, 30), '1 segment')).toBe(at(1, 13, 30));
		expect(applyJump(c, at(1, 18), '2 quarters')).toBe(at(2, 6));
		expect(applyJump(c, at(1, 6), '3 quarters')).toBe(at(2, 0));
	});

	it('months and years keep the day, clamped', () => {
		const g = cal('twelve-months');
		const jan31 = toMoment(g, { year: 1, month: 1, day: 31, hour: 9, minute: 0 });
		expect(toDate(g, applyJump(g, jan31, '1 month')!)).toEqual({ year: 1, month: 2, day: 28, hour: 9, minute: 0 });
		expect(toDate(g, applyJump(g, jan31, '1 year')!)).toEqual({ year: 2, month: 1, day: 31, hour: 9, minute: 0 });
	});

	it('until Morning, before and after Morning', () => {
		expect(applyJump(c, at(3, 2), 'until Morning')).toBe(at(3, 6));
		expect(applyJump(c, at(3, 6), 'until Morning')).toBe(at(4, 6));
		expect(applyJump(c, at(3, 7), 'until morning')).toBe(at(4, 6));
		expect(applyJump(c, at(3, 7), 'until 14:00')).toBe(at(3, 14));
		expect(applyJump(c, at(3, 15), 'until 14:00')).toBe(at(4, 14));
		expect(applyJump(c, at(3, 15), 'until Brunch')).toBeNull();
		expect(applyJump(c, at(3, 15), 'until 25:00')).toBeNull();
	});

	it('parses lengths', () => {
		expect(parseDuration('+3 days 4 hours')).toEqual([{ n: 3, unit: 'day' }, { n: 4, unit: 'hour' }]);
		expect(parseDuration('an hour')).toEqual([{ n: 1, unit: 'hour' }]);
		expect(parseDuration('10min')).toEqual([{ n: 10, unit: 'minute' }]);
		expect(parseDuration('1 quarter')).toEqual([{ n: 1, unit: 'segment' }]);
		expect(parseDuration('2 days and 3 watches')).toEqual([{ n: 2, unit: 'day' }, { n: 3, unit: 'segment' }]);
		expect(parseDuration('3 fortnights')).toBeNull();
		expect(parseDuration('soon')).toBeNull();
		expect(parseDuration('')).toBeNull();
	});

	it('travel time: 3 quarters from Evening is 18 hours', () => {
		expect(durationMinutes(c, at(1, 18), '3 quarters')).toBe(18 * H);
		expect(addDuration(c, 0, [{ n: 1.5, unit: 'hour' }])).toBe(90);
	});

	it('never goes before the start', () => {
		expect(applyJump(c, 10, '-5 days')).toBeNull();
	});
});

describe('world-date', () => {
	const c = parseCalendar(BALBOM.replace('year-start: 1', 'year-start: 1247'));
	it('writes and reads year-month-day hour:minute, month as a number', () => {
		const m = toMoment(c, { year: 1247, month: 3, day: 12, hour: 14, minute: 30 });
		expect(formatWorldDate(c, m)).toBe('1247-03-12 14:30');
		expect(parseWorldDate(c, '1247-03-12 14:30')).toBe(m);
		expect(parseWorldDate(c, '1247-3-12T14:30')).toBe(m);
		expect(parseWorldDate(c, '1247-03-12')).toBe(toMoment(c, { year: 1247, month: 3, day: 12, hour: 0, minute: 0 }));
	});

	it('a day count writes "day 14", with the time when the clock shows it', () => {
		const d = cal('day-count');
		expect(formatWorldDate(d, 13 * D)).toBe('day 14');
		expect(parseWorldDate(d, 'day 14')).toBe(13 * D);
		expect(parseWorldDate(d, 'Day 14 06:30')).toBe(13 * D + 6 * H + 30);
		expect(parseWorldDate(d, '14')).toBe(13 * D);
		const q = cal('quarter-days');
		expect(formatWorldDate(q, 13 * D)).toBe('day 14 00:00');
	});

	it('renaming a month never breaks a date', () => {
		const before = parseWorldDate(c, '1247-02-05 08:00');
		const renamed = parseCalendar(BALBOM.replace('year-start: 1', 'year-start: 1247').replace('Thaw', 'Mudmonth'));
		expect(parseWorldDate(renamed, '1247-02-05 08:00')).toBe(before);
		expect(formatMoment(renamed, before!)).toContain('Mudmonth');
	});

	it('rejects nonsense', () => {
		expect(parseWorldDate(c, 'yesterday')).toBeNull();
		expect(parseWorldDate(c, '')).toBeNull();
	});
});

describe('formatting', () => {
	it('the block\'s own format', () => {
		const c = parseCalendar(BALBOM);
		expect(formatMoment(c, 14 * D + 19 * H)).toBe('Firstday, 15 Deepfrost 1 AB · Evening');
	});

	it('a sensible default for each step', () => {
		expect(formatMoment(cal('day-count'), 13 * D)).toBe('Day 14');
		expect(formatMoment(cal('quarter-days'), 13 * D + 7 * H)).toBe('Day 14 · Morning');
		expect(formatMoment(cal('twelve-months'), 40 * D + 9 * H + 5)).toBe('Saturday, 10 February 1 · 09:05');
		expect(defaultFormat(parseCalendar('step: minute'))).toBe('Day {day} · {time}');
	});

	it('empty parts don\'t leave stray separators', () => {
		const c = parseCalendar('format: {weekday}, Day {day} · {segment}');
		expect(formatMoment(c, 4 * D)).toBe('Day 5');
		expect(formatMoment(parseCalendar('format: {day} {month} {year} {era}'), 4 * D)).toBe('5');
	});

	it('every token', () => {
		const c = parseCalendar(BALBOM);
		const m = toMoment(c, { year: 1, month: 2, day: 3, hour: 4, minute: 5 });
		expect(formatMoment(c, m, '{weekday}|{day}|{month}|{month-number}|{year}|{era}|{segment}|{hour}|{minute}|{time}|{nope}')).toBe('Fifthday|3|Thaw|2|1|AB|Night|04|05|04:05|{nope}');
	});

	it('spans for the sessions list', () => {
		const d = cal('day-count');
		expect(formatSpan(d, 13 * D, 16 * D)).toBe('Day 14 → 17');
		expect(formatSpan(d, 13 * D, null)).toBe('Day 14');
		expect(formatSpan(d, 13 * D, 13 * D + 5 * H)).toBe('Day 14');
		const c = parseCalendar(BALBOM);
		expect(formatSpan(c, 11 * D, 40 * D)).toBe('12 Deepfrost → 11 Thaw');
	});

	it('step buttons', () => {
		expect(stepButtons(cal('quarter-days')).map(b => b.label)).toEqual(['+1 quarter', '+1 day']);
		expect(stepButtons(parseCalendar('step: minute')).map(b => b.label)).toEqual(['+10 min', '+1 hour', '+1 day']);
		expect(stepButtons(cal('watches'))[0].label).toBe('+1 watch');
		expect(stepButtons(cal('day-count'))[0].label).toBe('+1 day');
	});
});

describe('presets', () => {
	it('every preset parses, has a name, and writes a calendar note', () => {
		for (const p of CALENDAR_PRESETS) {
			const c = parseCalendar(p.body);
			expect(c.name).toBeTruthy();
			expect(calendarSource(c)).toBe(p.body);
			expect(calendarNote(p)).toMatch(/^---\nnimble: calendar\n---\n\n```nimble-calendar\n/);
			for (const q of c.quick) expect(applyJump(c, 0, q.jump), `${p.name}: ${q.jump}`).not.toBeNull();
		}
	});

	it('quarter days are 6 hours each, watches 4', () => {
		const q = cal('quarter-days');
		expect(q.segments.map(s => s.start)).toEqual([0, 6, 12, 18]);
		const w = cal('watches');
		expect(w.segments.map(s => s.start)).toEqual([0, 4, 8, 12, 16, 20]);
		expect(cal('twelve-months').months.reduce((n, m) => n + m.days, 0)).toBe(365);
		expect(cal('thirteen-months').months).toHaveLength(13);
	});
});
