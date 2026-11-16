# The campaign clock and calendars

Every campaign has a clock: what day it is in the world, and (if you want) what time. It works with nothing set up, counting days ("Day 14"), and it grows into a full calendar of your own with named months, weekdays and parts of the day.

## The clock

The clock shows in three places, and they always agree:

- **The Campaign panel**, under the party.
- **Every map in the campaign**, as a chip in the top-right corner. The clock button on the map's toolbar hides it.
- **A `nimble-clock` block** in any note in the campaign, such as a session note or the campaign home:

  ````markdown
  ```nimble-clock
  ```
  ````

Select **+** on any of them to move time on:

- **Step buttons** for your calendar, like **+1 quarter** and **+1 day**, or **+10 min**, **+1 hour** and **+1 day**.
- **Quick buttons** for the jumps you make all the time, from the calendar's `quick:` list (**Camp** until Morning, **Short rest** for an hour).
- **A field** for anything else: type `+3 days 4 hours`, `2 watches` or `until 14:00` and press Enter.
- **Set date…** to jump straight to a date.
- **Undo** puts the clock back. The last 20 changes are kept for each campaign.

The command **Advance the campaign clock…** opens the same buttons from anywhere.

## Where the date lives

The date is kept in the campaign home note's properties, as text you can read and edit:

```yaml
calendar: "[[Reckoning of Balbom]]"
world-date: 1247-03-12 14:30
```

`world-date` is `year-month-day hour:minute`, with the month as a number, so renaming a month never breaks a date. A calendar that only counts days writes `day 14 06:00`. Several campaigns can share one calendar note, and each keeps its own date.

With no `calendar:` property, the campaign counts days.

## Sessions

A new session note gets `world-date:` set to the campaign's date when you make it (its `date:` is still the real-world day you played). The Sessions list in the Campaign panel shows the stretch of world time each session covered, from its date to the next session's, like "Day 14 → 17".

You can give any note in the campaign a `world-date:` property, and it shows on that day in the calendar.

## Choosing a calendar

Run **New calendar…** (or select **Use a calendar…** in the clock's popover) and pick one to start from. It's written into a note next to the campaign's home note, the campaign is pointed at it, and the note opens so you can make it your own:

| Calendar | What it is |
|---|---|
| Day count | Just the day: "Day 14". |
| Day and night | Days split into day and night. |
| Quarter days | Morning, Day, Evening and Night, 6 hours each. Good for journeys. |
| Watches | Six 4-hour watches. Good for ships and night camps. |
| 12 months | A familiar year: twelve months, a 7-day week, to the hour. |
| 13 × 28 | Thirteen 28-day months and a 7-day week. |

The calendar note shows a month at a time, with today marked and every dated note listed on its day. Use **‹** and **›** to move between months.

## Writing your own calendar

A calendar is a `nimble-calendar` block in a note with `nimble: calendar` in its properties:

````markdown
```nimble-calendar
name: Reckoning of Balbom
hours: 24
minutes: 60
segments: Morning 6, Day 12, Evening 18, Night 0
week: Firstday, Seconday, Thirdday, Fourthday, Fifthday, Sixthday, Restday
months:
- Deepfrost | 30
- Thaw | 30
- Seedtime | 31
year-start: 1
era: AB
step: segment
format: {weekday}, {day} {month} {year} {era} · {segment}
quick:
- Short rest | 1 hour
- Camp | until Morning
- Travel day | 1 day
```
````

| Key | What it does |
|---|---|
| `name` | The calendar's name. |
| `hours`, `minutes` | How long a day is. 24 and 60 if you leave them out. |
| `segments` | Named parts of the day, each with the hour it starts. Quarter days, watches, or just Day and Night. Optional. |
| `week` | Weekday names. Leave it out and no weekday is shown. |
| `months` | One line per month: `name | days`. Leave them out and the calendar counts days. |
| `year-start`, `era` | The first year's number, and a label after it. |
| `step` | The smallest step the clock offers: `day`, `segment`, `hour` or `minute`. It picks the clock's buttons and how much the date shows. |
| `format` | How the date reads. Use `{weekday} {day} {month} {month-number} {year} {era} {segment} {hour} {minute} {time}`. Leave it out for a sensible default. |
| `quick` | Buttons for jumps you make all the time: a length (`1 hour`, `2 days`) or `until <segment>` / `until 14:00`. |

Lengths can use minutes, hours, days, weeks, months and years, and segments by any of these names: segment, quarter, watch or shift. Moving on by a segment keeps your place in it: 07:30 plus one quarter is 13:30.

Leap years, seasons and moons aren't supported yet. Lines the block doesn't understand are left alone, so a calendar you write now will keep working when they arrive.
