# Ember Vault - Development Guide

An Obsidian plugin (TypeScript, bundled with esbuild) that renders Nimble TTRPG monster stat blocks, `nimble:` inline references, and an encounter tracker.

## Project structure

```
main.ts                 Plugin entry: wiring, commands, dice rolls, settings load/migration, bestiary, copy-to-vault
src/
  types.ts              Data types, default settings, Nimble 3.3 conditions, uid()
  rules.ts              Nimble 3.3 / GMG 3.0 rules: armor, hero Wounds, minions, Last Stand, conditions, difficulty budget
  parser.ts             Stat block parsing (+ legacy fields), toStatblockSource(), finding ```nimble blocks
  bestiary.ts           Bundled bestiary conversion, attribution text
  data/bestiary.json    525 Nimble monsters (built by scripts/bestiary/merge.py)
  markdown.ts           Safe inline markdown (bold/italic/wikilinks/dice/keywords) built as DOM nodes
  render.ts             The one stat block renderer (notes, bestiary, tracker, hover previews)
  icons.ts              Badge SVGs
  monster-index.ts      Vault monsters + bundled bestiary, by name
  encounters.ts         Encounter state + every mutation (EncounterStore)
  tracker-view.ts       The encounter tracker sidebar
  compendium-entries.ts Every searchable thing (monsters, NPCs, companions, compendium hits, conditions, rules) as one Entry list with facets (pure, tested)
  compendium-query.ts   The search language: typed filters, fuzzy names, sorts, autocomplete suggestions (pure, tested)
  filter-field.ts       The search field shared by the compendium and Spotlight: filters as chips, a chip waiting for its value, Backspace/Escape (tested)
  compendium-browser.ts The one compendium UI (tabs, chip search bar, suggestions, list, sort/filter, entry page, keys); entry cache
  compendium-view.ts    The Compendium tab (view type is still `nimble-bestiary`)
  compendium-modal.ts   The compendium as a pre-filtered dialog; openEntry() quick looks
  compendium-pickers.ts Add monster, the sheet's Add item/spell/feature, and slash-command inserts, all through the dialog
  compendium-art.ts     Your art for compendium entries: the portrait slot, list icons, upload/pick, rename tracking (settings.compendiumArt)
  count-modal.ts        "Add several…": how many of a monster (and tougher/weaker) to add
  compendium-ref.ts     `nimble:spell:Name` / `nimble:feature:Name@Class` references (pure, tested)
  encounter-def.ts      ```nimble-encounter format (pure)   encounter-block.ts  its renderer
  builder-modal.ts      Encounter builder
  map-def.ts            ```nimble-map format (pure)         map-block.ts        its renderer (pins, tokens)
  grid-def.ts           Grid maths: cellAt, centreOf, distance (axial hexes, Chebyshev squares), SVG pattern tiles (pure, tested)
  map-view.ts           A map in its own tab (getState/setState), the Notes split beside it
  map-draw.ts           Drawings, the live line and the Draw bar; map-party.ts is the party marker's face and roster
  grid-detect.ts        Finds the grid printed on a map image, in idle chunks (pure, tested); map-grid.ts is the Grid panel, the grid layer and pixel reading
  slash.ts              "/" commands
  spotlight.ts          Cmd/Ctrl+K box: search adversaries/NPCs/notes, roll dice, run commands (spotlight-def.ts is the pure query parser)
  inline-ref.ts         `nimble:Name` references and the interactive hover preview
  live-preview.ts       CodeMirror extension that renders references in Live Preview
  campaign-model.ts     Campaign structure from folders + frontmatter (pure, tested)
  campaigns.ts          CampaignStore: live index, active campaign, per-campaign party swap, note creation
  campaign-ui.ts        The outline (party line, Continue, chapters, sections) shared by panel and block
  campaign-view.ts      Campaign panel (left sidebar) and the ```nimble-campaign dashboard block
  campaign-modals.ts    New campaign, name prompt, campaign/chapter pickers
  calendar-def.ts       Calendars and the time model: minutes since year 1 ↔ dates, world-date, formats, jumps, the nimble-calendar block (pure, tested)
  calendar-presets.ts   The starter calendars New calendar writes (pure, tested)
  clock.ts              ClockStore: each campaign's world-date (in its home note), Undo history, one `changed` event for every clock
  clock-ui.ts           The clock widget (panel, map chip, nimble-clock block) and its + popover; New calendar; calendar-block.ts draws a calendar note's month
  campaign-templates.ts Starter notes (campaign home, chapter, scene, NPC, location, session)
  box-def.ts            ```box fence format: presets, colours, styles, icon library (pure, tested)
  box-block.ts          Box renderer and the icon/colour/style editor (writes the fence line back)
  npc-links.ts          Reading view: NPC link chips and auto-linked mentions
  npc-live-preview.ts   The same for Live Preview (CodeMirror decorations)
  tables.ts             DC columns as pills; the "Styled tables" body class
  dice3d/               3D dice: index.ts (tiny entry), renderer.ts (three.js), geometry.ts (shapes, face-up math, tested)
  popover.ts            Shared floating popover (condition info, pickers); a bottom sheet on phones
  touch.ts              isTouch/isPhone, onLongPress (right-click on touch), confirmAction (no window.confirm on mobile)
  hp-pad.ts             Touch HP keypad used by the tracker instead of the text box
  party.ts              Party editor (settings tab and the /party modal); cards on narrow screens
  suggest.ts            `nimble:` autocomplete and the "Add monster…" picker
  settings-tab.ts       Settings UI (party, bestiary, rules, custom conditions)
  dice.ts               Dice expression parsing and rolling
  compendium.ts         Player compendium types, lookups, featuresFor, search (pure, tested); data/compendium.json, compendium-data.ts loads it
  compendium-card.ts    How a compendium entry looks: cards, full class pages, condition cards, the card modal
  character-def.ts      Character note frontmatter → sheet values, and every sheet change as a frontmatter edit (pure, tested)
  character-sheet.ts    The ```nimble-sheet renderer (writes through processFrontMatter, rolls through plugin.rollDice)
  character-view.ts     Character side panel; character-modals.ts: new character, level up, custom ability
  character-register.ts registerCharacterFeatures(): block, panel, commands, ribbon
  roll-def.ts           Rolls with stacked advantage/disadvantage, modifiers and extra dice (pure, tested); roll-dialog.ts is the dialog
  resource-def.ts       How class dice behave (rolled when gained or spent, all/any/one per roll, kept or spent), from scripts/compendium/raw/resources.json (pure, tested)
  creature-notes.ts     A player's `nimble: creature` notes, as the bestiary shows them (pure, tested)
scripts/bestiary/       Raw per-page extractions from the Nimble PDFs, the brief, and merge.py
tests/                  Unit tests (vitest + happy-dom); obsidian-stub.ts stands in for the API
e2e/                    End-to-end tests that drive a real Obsidian
```nimble blocks in a note
  markdown.ts           Safe inline markdown (bold/italic/wikilinks/dice) built as DOM nodes
  render.ts             The one stat block renderer (note blocks, tracker viewer, hover preview)
  icons.ts              Badge SVGs
  monster-index.ts      Vault-wide index of monsters by name
  encounters.ts         Encounter state + every mutation (EncounterStore), HP/label helpers
  tracker-view.ts       The encounter tracker sidebar
  inline-ref.ts         `nimble:Name` references and the hover preview
  live-preview.ts       CodeMirror extension that renders references in Live Preview
  suggest.ts            `nimble:` autocomplete and the "Add monster…" picker
  settings-tab.ts       Settings UI and the custom condition editor
  dice.ts               Dice expression parsing and rolling
tests/                  Unit tests (vitest + happy-dom); obsidian-stub.ts stands in for the API
e2e/                    End-to-end tests that drive a real Obsidian
  harness.mjs           Launches an isolated Obsidian with a temp vault and connects over CDP
  run.mjs               The test suite
  explore.mjs           Screenshot-heavy exploratory pass (no assertions)
  fixtures/vault/       Notes copied into the temp vault for every run
```

Rules that keep this healthy:

- `types.ts`, `rules.ts`, `parser.ts`, `bestiary.ts`, `encounter-def.ts`, `map-def.ts`, `grid-def.ts`, `grid-detect.ts`, `calendar-def.ts`, `calendar-presets.ts`, `markdown.ts`, `dice.ts`, `roll-def.ts`, `resource-def.ts`, `creature-notes.ts` must not import `obsidian`, so unit tests run in plain Node.
- Rules live in `rules.ts` and are unit-tested; views never re-implement them.
- Never put note text into `innerHTML`. Use `appendRichText()` or `createEl({ text })`. A stat block pasted from somewhere else must not be able to run script.
- Views don't mutate encounter data directly. Call `plugin.encounters.*`; it saves and fires `changed`, and every open tracker re-renders.

## Commands

```bash
npm install          # once
npm run dev          # watch build (main.js with inline sourcemap)
npm run build        # type-check + production build
npm test             # unit tests (fast, no Obsidian needed)
npm run lint         # Obsidian's review checks: ESLint (TS) + stylelint (styles.css); fails on any warning
npm run test:e2e     # build, then drive a real Obsidian through the e2e suite
node e2e/run.mjs dice           # only e2e tests whose name contains "dice"
node e2e/explore.mjs /tmp/shots # screenshots of every fixture note and the tracker
node e2e/layout-sweep.mjs       # every sample-vault note in the hover preview and at phone width; fails on crushed or spilling elements
```

## End-to-end tests

`e2e/harness.mjs` starts Obsidian with its own `--user-data-dir` and a throwaway copy of `e2e/fixtures/vault`, installs the freshly built plugin, and connects with `playwright-core` over the Chrome DevTools Protocol on a free port. Your real Obsidian settings and vaults are never touched, and it works whether or not your own Obsidian is open.

- Needs Obsidian installed at `/Applications/Obsidian.app` (or set `OBSIDIAN_BIN`).
- The test copy runs out of sight: no Dock icon, invisible, click-through, and focus goes straight back to the app you were in, so you can keep working. `E2E_FOREGROUND=1` shows it if you want to watch.
- Failure screenshots and a few showcase shots land in `e2e/artifacts/` (git-ignored).
- `KEEP_E2E=1` keeps the temp vault around for poking at.
- Inside a test, `o.eval((app, plugin, arg) => ..., arg)` runs code inside Obsidian. Only plain JSON comes back.

To cover a new scenario, add notes to `e2e/fixtures/vault/` and a `test('...', async (o) => { ... })` block in `e2e/run.mjs`.

## Installing in a vault by hand

Use `npm run dev:vault -- "<vault folder>"` (default `~/Documents/DevVault`). It installs pjeby's **Hot Reload** plugin into the vault, enables it and Ember Vault, marks Ember Vault with a `.hotreload` file, then runs the watch build and copies every rebuild (and every `styles.css` save) into the vault, so Obsidian reloads the plugin by itself a moment after you save. Add `--once` to install the current build and exit. `./deploy.sh` builds and does the same for `~/Documents/DevVault`.

Every test vault made for the user to try things in gets Hot Reload this way. (The e2e suite doesn't need it: it installs a fresh build into a throwaway vault each run.) To show the user a test vault without touching their own Obsidian, start a second copy with its own settings: `/Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir=<dir>`, where `<dir>/obsidian.json` lists the vault as `open: true`, and write the vault's `.obsidian/workspace.json` so it opens on the page to test. `obsidian://open?path=` only works for vaults the running Obsidian already knows.

## Common tasks

- **New stat block field:** add it to `NimbleMonster` (types.ts), parse it in `processKeyValue` (parser.ts), render it in `render.ts`, add a parser test.
- **New built-in condition:** add to `NIMBLE_CONDITIONS` in types.ts.
- **New setting:** add to `NimbleStatblocksSettings` + `DEFAULT_SETTINGS`, then a control in `settings-tab.ts`.
- **New tracker action:** add a method to `EncounterStore`, a unit test in `tests/encounters.test.ts`, and the button in `tracker-view.ts`.

## Obsidian review checks

The community directory's review bot flags things the `eslint-plugin-obsidianmd` recommended config misses, so `eslint.config.mjs` and `stylelint.config.mjs` add them and `npm run lint` fails on warnings. `.github/workflows/check.yml` runs it on every PR and push to main.

- No "command"/"commands" anywhere in a command name; no type assertions that don't change the type.
- CSS must be fully supported by Chromium 124 (Obsidian 1.6.5): no `display: contents`, no `clip-path` (draw shapes with SVG), no `column-gap` (use `gap`). Stylelint names the feature.
- No `!important`; raise specificity instead (see the print rules in styles.css).
- When the bot flags something new, add a rule for it here rather than only fixing the line.

## The compendium is the picker

Anything that asks the user to pick a monster, spell, item, feature or class opens the compendium dialog (`openCompendiumModal`, or the helpers in compendium-pickers.ts) with `segment` / `only` set, rather than a new SuggestModal. New searchable data goes in `buildEntries` (compendium-entries.ts) with its facets, and a new filter key in `FACETS` (compendium-query.ts), so the tab, every dialog, the slash commands, `nimble:` autocomplete and Spotlight all get it.

## Shared components, GM and player alike

Running a campaign and playing in one show the same things; build each once and pass the difference as a flag (usually `c.role`), rather than a second component for the other side.

- Party: `renderRoster` and `heroCard` (campaign-ui.ts) for both roles; the GM side also feeds the encounter party from the same sheets (`syncPartyFromSheets` in main.ts).
- Monsters: `renderStatblock` and `renderLoreCard` (render.ts) share `renderActionBar`; `plugin.renderStatblock` adds the player's creature notes and every printing to any lore card.
- Vitals: `renderMeter`, `renderActionDots` and `renderWoundPips` (vitals-ui.ts) draw the HP and mana bars (with their damage and heal animations and batched − / + taps), action dots and Wound pips, for the character sheet (writing to the note) and the tracker's quick look (writing to the fight). Wrap them in `.nimble-sheet` (the quick look uses `.nimble-sheet.ns-embed`) for their styles.
- Dice and marks: `dieShape` and `triangleMark` (die-shape.ts), styled globally (`.ns-die`, `.ns-tri-mark`), used by the sheet and the Camp dialog.
- Rolls: `rollWith` and `RollDialog` for every sheet roll; `pipStep` (rules.ts) for every row of pips, on the sheet and in the tracker.

## Pills and compact buttons

Every pill, chip and small icon+label button is centred by one shared rule at the end of the character sheet section of `styles.css` (flex row, icons as blocks, labels at `line-height: normal`). Don't use `line-height: 1` on labels: at small sizes Chromium rounds the font's ascent and descent and the label lands ~1px high. A new pill class goes in that rule's list **and** in `PILL_SELECTORS` in `e2e/align.mjs`; the `pills:` e2e test measures the real glyphs (capital height, real baseline) and fails if an icon or label drifts more than 1px.

## Releasing

Every PR merged into `main` is released by `.github/workflows/auto-release.yml` (details in RELEASING.md). Don't bump versions in a PR yourself.

- Default is a patch release. When the user says a change is a minor or major release, add the `release: minor` or `release: major` label to the PR (`gh pr edit <n> --add-label "release: minor"`). For `release: skip`, only when they say not to release.
- Run `npm test && npm run test:e2e` before merging; `release.yml` lints, tests, builds and attaches `main.js`, `manifest.json`, `styles.css`.
- Every PR adds its changes to `CHANGELOG.md` under `## [Unreleased]` (Added / Changed / Fixed), written plainly in the user's voice; the release workflow turns that section into the tag message and the release notes (`scripts/changelog.mjs`).

## Mobile

- Test any UI change on a phone-sized screen too. The `phone:` e2e test emulates a phone (CDP touch plus `app.emulateMobile(true)`) and covers the HP pad, sheets, the narrow bestiary and map pinch.
- Hover-only controls need a touch path: show them under `@media (pointer: coarse)`, and use `onLongPress` wherever there's a `contextmenu` menu.
- Obsidian's tablet theme pads every non-`.clickable-icon` button (`.is-tablet button:not(.clickable-icon)`). Compact buttons get their padding back in the `body.is-tablet` block at the end of styles.css.
- Grids that hold rows of controls use `minmax(0, 1fr)` columns, so long names truncate instead of pushing the pane wider than the screen.

## Campaigns

- `settings.party` always holds the **active campaign's** party. `CampaignStore.setActive` stashes it into `settings.campaigns[folder].party` and loads the next one, so code that reads the party needs no campaign awareness.
- With no heroes entered, `partyLevels()` and `EncounterStore.partySize()` fall back to the campaign's `level:` and `heroes:`.
- The active campaign follows `file-open`. Notes outside any campaign leave it unchanged.
- e2e can load any vault: `launchObsidian({ vaultDir })`.
- Campaigns don't share monsters or NPCs. Pass the note path to `index.get(name, from)` / `index.all(from)` wherever you have one; with none, the active campaign decides (the scope is set in `main.ts`). A campaign sees its own notes, GM campaigns also see notes outside any campaign, and everyone sees the bundled bestiary.

## Maps

- Everything a map stores is in % of the image; cells are sized in % of the image *width* both ways (grid-def.ts explains the "width units"). Keep it that way so a swapped-in bigger image keeps every pin, grid and drawing.
- `parseMapBlock`/`mapBlockSource` are lossless: unknown lines stay where they were and unchanged lines are written back as typed. A new key goes in `SCALARS`/`LISTS` in map-def.ts with a read, write and snapshot case, plus a round-trip test.
- A map tab builds the same `MapBlock` with a `MapHost` (fill, Notes, map pins stay in the tab) and a context whose section is the fence's lines, so it saves through the same `replaceMapBlock` path.
- Saving rewrites the note and Obsidian draws the block again; `VIEWS` and `SAVED_MODE` in map-block.ts carry the zoom and mode across. Never read pixels by drawing the `app://` image into a canvas (it taints it): `readGray` in map-grid.ts reads the bytes.

## The campaign clock

- "Now" is the campaign home's `world-date:` (text, month as a number); views never write it themselves. Call `plugin.clock.set/advance/undo`; it writes through processFrontMatter, records Undo, and fires `changed` so every clock redraws.
- Anything that shows a clock registers on a Component that is unloaded when it redraws (see `drawn` in campaign-view.ts and `built` in map-block.ts), or listeners pile up.

## Boxes and NPCs

- A box's look is stored only on its fence line (`boxFence` writes just what differs from the type's preset). The editor previews live and writes once, on close. Embeds and hover previews find their fence by matching the body in the file.
- The NPC list comes from `CampaignStore.rebuild` (`nimble: npc` or `#npc`). Mentions are only linked to NPCs in the same campaign, or NPCs outside any campaign. Aliases shorter than 3 characters are ignored.

## 3D dice

- `esbuild.config.mjs` builds three.js and `dice3d/renderer.ts` into a separate IIFE and embeds it in main.js as a string (`import RENDERER_SRC from 'dice3d-bundle'`). It's evaluated on the first roll, so startup doesn't pay for it.
- The roll is decided by `dice.ts`. The renderer simulates the throw headlessly with cannon-es, sees which face lands up, relabels the faces (`relabel` in geometry.ts) so that face shows the value, then replays the recording.
- Finishes live in `dice3d/shaders.ts` (onBeforeCompile on MeshPhysicalMaterial). `dice3d/materials.ts` lists them without importing three, so settings can show the list without loading the 3D bundle.
- e2e runs with `dice3d: false`, except the one 3D test, so notices aren't delayed elsewhere.
