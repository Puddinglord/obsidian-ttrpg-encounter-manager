# The design study: our living design archive

[`../encounter-design-study.html`](../encounter-design-study.html) shows how every part of Ember Vault looks and behaves in each game it supports or plans to: the tracker, the character sheet, NPCs, stat blocks, campaign notes (the Campaign panel, quests, locations, sessions) and each game's design system. It's built from the files in `src/`.

**It's the reference for every UI change.** Build the plugin's screens from it, check them against it, and when a design changes, change the study in the same PR. If the plugin and the study disagree, one of them is wrong: fix it, don't leave the drift.

```bash
node prototypes/design-study/build.mjs   # src/ → ../encounter-design-study.html
node prototypes/design-study/check.mjs   # every page in headless Chrome: script errors, empty pages, sideways scroll
open prototypes/encounter-design-study.html#nimble/sheet
```

## How it's built

- `src/` is joined in file-name order: every `.css` (into one `<style>`), then `80-body.html`, then every `.js`. A later file overrides an earlier one, so a refinement can sit in its own file beside what it refines (`71-nimble-sheets.css`, then `71d-nimble-scroll.css`).
- Numbering: `2x` shared CSS, `29` icons, `3x` shared parts (the sheet frame, the NPC card, Obsidian's chrome, clusters), `4x` the model and research, `50–63` each game's tracker and design system, `70–75` sheets, NPCs and blocks, `76` campaign notes, `9x` pages, answers and critique.
- Each game's page has sub-tabs (Tracker, Character sheet, NPC, Stat block, Campaign notes, Design system); a surface is a `DEFS.<game>.<surface>` with a research board, notes and shots in device frames (laptop with sidebars, iPad landscape and portrait, phone, hover card, quick look).
- Your answers to the design questions are in `98b-answers.js` and `98e-answers2.js`; the flow research behind the trackers is [`../ENCOUNTER-FLOW-RESEARCH.md`](../ENCOUNTER-FLOW-RESEARCH.md).
- Surfaces designed in the plugin first (the compendium, builders, dialogs) are archived as screenshots of the real plugin: PNGs in `shots/`, shown with `{ device: 'img', src: 'design-study/shots/<file>.png', w, cap, sub }`, under each game's Compendium and Builders & dialogs tabs, with the decisions in the surface's notes.
- Reference screenshots of other products (D&D Beyond, Foundry…) live in `prototypes/refs/`, which is git-ignored: we look at them, we don't publish them.

## The rules

These came out of reviewing every screen. They apply to the plugin as much as to the study.

### Alignment, with no tolerance

1. **Pills, tags, chips and compact buttons are centred on their capitals.** Icon and label share one centre line, within 1px, measured on the letters and not the line box. Build pills with core's `pill()`; add a new pill class to the shared centring rule in `styles.css` and to `PILL_SELECTORS` in `e2e/align.mjs`, so the `pills:` e2e tests measure it. When a font sits high or low, nudge the label and measure again; don't eyeball it. Text snaps to whole pixels, so pick the nearer of the two positions.
2. **A row shares one centre line.** A feature's name, its pips, its count and its buttons; a tracker row's name, shield and HP.
3. **Boxes in a row share their top and bottom edges** (a stat's face, Armor and Initiative, Wounds' shoulders, the HP box).
4. **Centre what's meant to be centred**: tab rows, button groups that stand alone.

### Layout

5. **No coloured left-edge stripes.** Mark state with a full tint, a full outline, or a glyph or label.
6. **Never stretch a label away from its value.** Keep each label and value together (a tile, a pill, a stacked pair) and let the units wrap.
7. **Nothing trails or floats loose at narrow widths.** Group what belongs together (HP with its Damage and Heal) and keep the group whole as it wraps. Don't stretch a small thing to fill a row (a Wounds chain in a 600px box); give the width to what uses it (the HP bar). Check every surface from 320px to 900px wide.
8. **Names don't wrap when there's room.** Size a name column to its longest name (`fit-content`, subgrid so rows still line up), and only wrap when space is really short.
9. **Pairs are equal.** Damage | Heal is 50/50 and as wide as it can be on small widths; a cluster of equal actions shares the width equally.

### Content

10. **No help text that repeats the label, no formulas, no basic rules.** "INT × 3 + level", "miss on a 1, explode on 12" and "each costs 1 action" don't belong on the screen. A formula can be a tooltip. A feature's own rules sit behind a chevron on its name that opens the row, in the book's words.
11. **Rules text comes from the books we may ship**: Nimble's newest 3.x drafts (with permission), the 5e SRD 5.1/5.2. Paraphrase anything else.
12. **Physical dice are first class.** Any die a hero holds (Fury, Judgment) can be typed in: tap it to change it, tap an empty slot to add one, faces as buttons in even rows.
13. **Pips:** tap a filled pip to take one away, an empty one to add one, one step at a time; the changed pip animates (core `renderPipRow`).
14. **Tags are dark with white text** (contrast 4.5:1 or better), and a game's traits sit together as one strip, as its book sets them (Pathfinder: rarity first).
15. **Follow the table, never enforce it; keep the table talking.** See the research doc's first sections: any creature can act at any time, nothing is blocked by a rule, reactions are quiet chips on the GM's damage sheet, never prompts.

### Look

16. **One anatomy, each game's look.** Every game draws the same cards (sheet band, NPC card, quest, location, session, the Campaign panel); the game's tokens (`.ev-sys-<id>`, `--ev-*`) give the colour, paper and type, and the game adds what its books add (a 5e read-aloud box, a Daggerheart Environment, a Pathfinder settlement line).
17. **Icons are Phosphor Bold on game surfaces**; Obsidian's own chrome stays Lucide. Damage types are icons (the dice say how much, the icon says what kind). Initiative shows a d20; the HP keypad is a calculator, never a die.
18. **Colour has jobs.** Nimble: red is HP, blue is mana, ochre is a class's own things, everything else charcoal on parchment. 5e: the book's red and gold. Don't spend accent colour on decoration.
