// Starter calendars. **New calendar** writes one of these into a note, where the
// user edits it. Pure: no Obsidian imports. No calendars from published
// settings: those belong to their owners.

export interface CalendarPreset {
	id: string;
	name: string;
	/** One line for the picker. */
	desc: string;
	/** The ```nimble-calendar block body. */
	body: string;
}

const WEEK = 'Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday';
const QUICK_REST = ['quick:', '- Short rest | 1 hour', '- Long rest | 8 hours'];

export const CALENDAR_PRESETS: CalendarPreset[] = [
	{
		id: 'day-count',
		name: 'Day count',
		desc: 'Just the day: "Day 14". No months or hours.',
		body: ['name: Day count', 'step: day', 'quick:', '- Travel day | 1 day', '- Week on the road | 1 week'].join('\n'),
	},
	{
		id: 'day-night',
		name: 'Day and night',
		desc: 'Days split into day and night.',
		body: ['name: Day and night', 'segments: Day 6, Night 18', 'step: segment', 'quick:', '- Camp | until Day', '- Travel day | 1 day'].join('\n'),
	},
	{
		id: 'quarter-days',
		name: 'Quarter days',
		desc: 'Morning, Day, Evening and Night, 6 hours each. Good for journeys.',
		body: ['name: Quarter days', 'segments: Morning 6, Day 12, Evening 18, Night 0', 'step: segment', 'quick:', '- Camp | until Morning', '- Travel day | 1 day'].join('\n'),
	},
	{
		id: 'watches',
		name: 'Watches',
		desc: 'Six 4-hour watches. Good for ships and night camps.',
		body: ['name: Watches', 'segments: Middle watch 0, Morning watch 4, Forenoon watch 8, Afternoon watch 12, Dog watch 16, First watch 20', 'step: segment', 'quick:', '- Rest | until Morning watch', '- Day at sea | 1 day'].join('\n'),
	},
	{
		id: 'twelve-months',
		name: '12 months',
		desc: 'A familiar year: twelve months, a 7-day week, to the hour.',
		body: [
			'name: Twelve months',
			`week: ${WEEK}`,
			'months:',
			...([['January', 31], ['February', 28], ['March', 31], ['April', 30], ['May', 31], ['June', 30], ['July', 31], ['August', 31], ['September', 30], ['October', 31], ['November', 30], ['December', 31]] as const).map(([n, d]) => `- ${n} | ${d}`),
			'step: hour',
			...QUICK_REST,
		].join('\n'),
	},
	{
		id: 'thirteen-months',
		name: '13 × 28',
		desc: 'Thirteen 28-day months, a 7-day week. Every month starts on the same weekday.',
		body: [
			'name: Thirteen moons',
			`week: ${WEEK}`,
			'months:',
			...['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth'].map(n => `- ${n} Moon | 28`),
			'step: hour',
			...QUICK_REST,
		].join('\n'),
	},
];

export const DAY_COUNT = CALENDAR_PRESETS[0];

export function presetById(id: string): CalendarPreset | undefined {
	return CALENDAR_PRESETS.find(p => p.id === id);
}

/** A calendar note's text for a preset. */
export function calendarNote(preset: CalendarPreset): string {
	return [
		'---',
		'nimble: calendar',
		'---',
		'',
		'```nimble-calendar',
		preset.body,
		'```',
		'',
		'Edit the block to make the calendar your own: rename the months and weekdays, add segments, change the format. See the Calendar guide for every option.',
		'',
	].join('\n');
}
