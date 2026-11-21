# Ember Vault - Development Guide

Start with [AGENTS.md](AGENTS.md) (the overview, and which guide to read for each part). This page is the detailed map.

An Obsidian plugin (TypeScript, bundled with esbuild) that renders Nimble TTRPG monster stat blocks, `nimble:` inline references, and an encounter tracker.

## Project structure

Three layers, enforced by `npm run lint` (eslint `no-restricted-imports`, see eslint.config.mjs):

- **`src/core/`** is shared by every game system. It never imports a system or the app layer. When it needs something system-specific it asks the plugin: `plugin.system(path)` returns the note's campaign's `GameSystem` (src/systems/contract.ts).
- **`src/systems/<id>/`** is one game system (today only `nimble`). It may import core and the contract, never another system or the app layer. A change inside one system can only break another through core or the contract.
- **`src/app/`** and `main.ts` wire it together (settings page, Spotlight, maps with encounter tokens, the list of shipped systems). They may import anything.

Core modules take the plugin type with `import type EmberVaultPlugin from '../../main'` (type only). New system-specific behaviour that core needs becomes a member of `GameSystem`, written from the real call site.

```
main.ts                 The plugin (EmberVaultPlugin): what every game shares, then each system's register(); dice rolls, settings load/migration, system(path), runtime(id), events. Imports no game system
src/systems/
  contract.ts           GameSystem: what core may ask a system for (attribution, conditions, characters, quick look…)
  registry.ts           SystemRegistry: register, resolve a campaign's `system:` (case-insensitive), fall back to the default (pure, tested)
src/app/
  spotlight.ts          Cmd/Ctrl+K box: search NPCs/notes/conditions, roll dice, run commands; the campaign's system adds its monsters, compendium and typed filters through `spotlight` (core/spotlight-source.ts); spotlight-def.ts is the pure query parser and ranking
  settings-tab.ts       The settings page: shared rows (core/settings-ui.ts), then each system's settingsSections
  systems.ts            SHIPPED_SYSTEMS and createSystems(): every system the plugin ships, the first is the default
src/core/
  content/              Content packs: spec.ts (fields → checks and JSON Schema), packs.ts (read a pack, packs: per campaign), store.ts (plugin.content), import-modal.ts
  builder/              The builder for every system: frame.ts (the dialog, its fields, kinds registered per system), schema.ts (builders from a schema of fields and formulas), commands.ts (New monster/spell/item…, the Edit pencil, rewriteBlock)
  compendium/           The compendium engine: query.ts (search language: typed filters, fuzzy names, sorts, suggestions; pure, tested), filter-field.ts (filters as chips), browser.ts (tabs, list, page, keys), refs.ts
  slash.ts              "/" menu engine and the commands every game shares (boxes, NPCs, quests, maps, party, roll, conditions); systems add theirs through `slashCommands`
  markdown.ts           Safe inline markdown (bold/italic/wikilinks/dice/keywords) built as DOM nodes
  encounter-def.ts      ```nimble-encounter format (pure); Nimble's encounter-block.ts renders it
  map-def.ts            ```nimble-map format (pure); app/map-block.ts renders it (pins, and the campaign's game's fight as tokens through combatTokens)
  campaign-model.ts     Campaign structure from folders + frontmatter (pure, tested)
  campaigns.ts          CampaignStore: live index, active campaign, per-campaign party swap, note creation
  campaign-ui.ts        The outline (party line, Continue, chapters, sections) shared by panel and block
  campaign-view.ts      Campaign panel (left sidebar) and the ```nimble-campaign dashboard block
  campaign-modals.ts    New campaign, name prompt, campaign/chapter pickers
  box-def.ts            ```box fence format: presets, colours, styles, icon library (pure, tested)
  box-block.ts          Box renderer and the icon/colour/style editor (writes the fence line back)
  npc-links.ts          Reading view: NPC link chips and auto-linked mentions
  note-kinds.ts         The shared note kinds and what a system adds to them (fields, card) (pure, tested)
  note-card.ts          Draws a system's stats and card in the NPC card, and the ```nimble-note block for other kinds
  npc-live-preview.ts   The same for Live Preview (CodeMirror decorations)
  tables.ts             DC columns as pills; the "Styled tables" body class
  dice3d/               3D dice: index.ts (tiny entry), renderer.ts (three.js), geometry.ts (shapes, face-up math, tested)
  pill.ts               pill(): the one markup for pills, chips and compact icon+label buttons (see "Pills and compact buttons")
  popover.ts            Shared floating popover (condition info, pickers); a bottom sheet on phones
  touch.ts              isTouch/isPhone, onLongPress (right-click on touch), confirmAction (no window.confirm on mobile)
  party.ts              Party editor (settings tab and the /party modal); cards on narrow screens
  dice.ts               Dice expression parsing and rolling
  types.ts              Shared types: conditions (AppliedCondition, ConditionDef), the party, the roll log, uid()
  settings.ts           EmberVaultSettings (what every game shares), CORE_DEFAULTS, migrateSettings(saved, parts); systems augment the interface
  settings-ui.ts        Settings rows and sections, for app/settings-tab.ts and each system's settingsSections
  dice-edge.ts          Rolls with stacked advantage/disadvantage, modifiers and extra dice (pure, tested)
  rule-terms.ts         A game's rules words (abilities, senses, conditions…) as lookups and patterns (pure, tested); rule-term-ui.ts underlines them and shows a term's card
  dice-attack.ts        Exploding attack rolls, for a game whose attackRolls says 'exploding' (pure, tested)
  wiki-links.ts         [[Wiki links]] inside rendered text: resolve, open, hover preview
src/systems/nimble/
  types.ts              Nimble monster and encounter types, Nimble 3.3 conditions
  settings.ts           Nimble's settings fields (augmenting EmberVaultSettings), NIMBLE_DEFAULTS, its migration; settings-ui.ts its settings sections
  runtime.ts            nimble(): Nimble's live state (monster index, encounter store) and helpers; register.ts wires it in at load
  map-tokens.ts         The active encounter as map tokens (combatTokens)
  rule-terms.ts         Nimble's rules words (conditions, stats, skills, languages, magic rules) for ruleTerms, each id its compendium entry's (pure, tested)
  rules.ts              Nimble 3.3 / GMG 3.0 rules: armor, hero Wounds, minions, Last Stand, conditions, difficulty budget
  parser.ts             Stat block parsing (+ legacy fields), toStatblockSource(), finding ```nimble blocks
  bestiary.ts           Bundled bestiary conversion, attribution text
  data/bestiary.json    525 Nimble monsters (built by scripts/bestiary/merge.py)
  render.ts             The one stat block renderer (notes, bestiary, tracker, hover previews)
  icons.ts              Badge SVGs
  monster-index.ts      Vault monsters + bundled bestiary, by name
  encounters.ts         Encounter state + every mutation (EncounterStore)
  tracker-view.ts       The encounter tracker sidebar
  compendium-query.ts   Nimble's words (facets, sorts, tabs) for core's search language (core/compendium/query.ts) (pure, tested)
  filter-field.ts       Core's filter field with Nimble's words, for the compendium and Spotlight
  compendium-view.ts    The Compendium tab (view type is still `nimble-bestiary`)
  compendium-modal.ts   The compendium as a pre-filtered dialog; openEntry() quick looks
  compendium-art.ts     Your art for compendium entries: the portrait slot, list icons, upload/pick, rename tracking (settings.compendiumArt)
  count-modal.ts        "Add several…": how many of a monster (and tougher/weaker) to add
  compendium-ref.ts     `nimble:spell:Name` / `nimble:feature:Name@Class` references (pure, tested)
  builder-modal.ts      Encounter builder
  inline-ref.ts         `nimble:Name` references and the interactive hover preview
  live-preview.ts       CodeMirror extension that renders references in Live Preview
  hp-pad.ts             Touch HP keypad used by the tracker instead of the text box
  suggest.ts            `nimble:` autocomplete and the "Add monster…" picker
  compendium.ts         Player compendium types, lookups, featuresFor, search (pure, tested); data/compendium.json, compendium-data.ts loads it with the campaign's content packs and the vault's homebrew on top
  content.ts            What Nimble takes in content packs (every kind it ships, with the bundled data's fields), pack entries as content, and that content merged onto the books (pure, tested)
  compendium-card.ts    How a compendium entry looks: cards, full class pages, condition cards, the card modal
  character-def.ts      Character note frontmatter → sheet values, and every sheet change as a frontmatter edit (pure, tested)
  character-sheet.ts    The ```nimble-sheet renderer (writes through processFrontMatter, rolls through plugin.rollDice), as the design study draws it
  class-panel.ts        The sheet's class panel (class-panel-def.ts says what it holds, pure, tested); class-scroll.ts the class's scrollwork heading
  character-view.ts     Character side panel; character-modals.ts: new character, level up, custom ability
  roll-def.ts           Rolls with stacked advantage/disadvantage, modifiers and extra dice (pure, tested); roll-dialog.ts is the dialog
  resource-def.ts       How class dice behave (rolled when gained or spent, all/any/one per roll, kept or spent), from scripts/compendium/raw/resources.json (pure, tested)
  creature-notes.ts     A player's `nimble: creature` notes, as the bestiary shows them (pure, tested)
  statblock-issues.ts   The quiet "N lines here aren't shown as written" hints under hand-written stat blocks (parser.ts readStatblock finds them), Fix buttons, rewriteBlock()
  builder-math.ts       The GM Guide's monster and legendary tables, spell damage by tier, item prices: expected stats, level/tier guesses, re-levelling, dice suggestions (pure, tested)
  entity-builder.ts     Nimble's kinds for core's builder (core/builder/frame.ts)
  entity-monster.ts     The monster draft: typed values kept, the rest from the level; quick build, solo, minion, from a template (pure, tested); entity-monster-ui.ts its steps
  entity-homebrew.ts    Spell and item drafts (pure, tested); entity-homebrew-ui.ts their steps
  entity-content.ts     A hero's content as builder drafts: class, subclass, option, ancestry, background, boon; the block they write, what's missing, what each level grants (pure, tested); entity-content-ui.ts the small kinds and shared editors, entity-class-ui.ts the class and subclass
  homebrew-def.ts       ```nimble-spell / ```nimble-item blocks (pure, tested); homebrew-block.ts renders them; the monster index collects them into the compendium
  builder-register.ts   Registers Nimble's builder kinds; the Edit pencil on Nimble's blocks
  system.ts             Nimble as a GameSystem: the contract's members, each a thin call into the modules below
  attack-roll.ts        Nimble attack rolls: miss on a 1, explode on max (pure, tested)
scripts/bestiary/       Raw per-page extractions from the Nimble PDFs, the brief, and merge.py
tests/                  Unit tests (vitest + happy-dom); obsidian-stub.ts stands in for the API; systems.test.ts is the conformance suite every shipped system passes
e2e/                    End-to-end tests that drive a real Obsidian
  harness.mjs           Launches an isolated Obsidian with a temp vault and connects over CDP
  run.mjs               The test suite
  explore.mjs           Screenshot-heavy exploratory pass (no assertions)
  fixtures/vault/       Notes copied into the temp vault for every run
```

Rules that keep this healthy:

- Core's `types.ts`, `encounter-def.ts`, `map-def.ts`, `markdown.ts`, `dice.ts`, the registry, and Nimble's `types.ts`, `rules.ts`, `parser.ts`, `bestiary.ts`, `attack-roll.ts`, `roll-def.ts`, `resource-def.ts`, `content.ts`, `creature-notes.ts`, `builder-math.ts`, `entity-monster.ts`, `entity-homebrew.ts`, `entity-content.ts`, `homebrew-def.ts` must not import `obsidian`, so unit tests run in plain Node.
- Rules live in `rules.ts` and are unit-tested; views never re-implement them.
- Never put note text into `innerHTML`. Use `appendRichText()` or `createEl({ text })`. A stat block pasted from somewhere else must not be able to run script.
- Views don't mutate encounter data directly. Call `nimble().encounters.*` (or 5e's `dnd5e().fights.change`); it saves and fires `changed`, and every open tracker re-renders.

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
npm run test:visual             # every surface of both games at every width, light and dark: screenshots and visual checks (node e2e/visual.mjs nimble sheet for a subset)
```

## End-to-end tests

`e2e/harness.mjs` starts Obsidian with its own `--user-data-dir` and a throwaway copy of `e2e/fixtures/vault`, installs the freshly built plugin, and connects with `playwright-core` over the Chrome DevTools Protocol on a free port. Your real Obsidian settings and vaults are never touched, and it works whether or not your own Obsidian is open.

- Needs Obsidian installed at `/Applications/Obsidian.app` (or set `OBSIDIAN_BIN`).
- The test copy runs out of sight: no Dock icon, invisible, click-through, and focus goes straight back to the app you were in, so you can keep working. `E2E_FOREGROUND=1` shows it if you want to watch.
- Failure screenshots and a few showcase shots land in `e2e/artifacts/` (git-ignored).
- `KEEP_E2E=1` keeps the temp vault around for poking at.
- Inside a test, `o.eval((app, plugin, arg) => ..., arg)` runs code inside Obsidian. Only plain JSON comes back.

To cover a new scenario, add notes to `e2e/fixtures/vault/` and a `test('...', async (o) => { ... })` block in `e2e/run.mjs`.

**Visual check.** `npm run test:visual` (`e2e/visual.mjs`) opens the sample vault plus the 5e campaigns and notes it writes, drives every surface in both games (sheets and their tabs, trackers mid-fight, encounter blocks, stat blocks, cards, the Campaign and Character panels, the compendiums, Spotlight, the slash menu, references and hover cards, every builder and wizard step, the dialogs, maps, homebrew), and shoots each at content widths 320, 540, 700 and 900, at 390 in the phone layout, and its sidebars at 260, 340 and 420, light and dark, into `e2e/artifacts/visual/<game>/<surface>/`. In the page it checks each shot: pills off their capitals' centre line (`pillOffenders`, over `PILL_SELECTORS` and anything pill-like it finds, listing those so they can be added, or named in `NOT_PILLS` when they aren't pills), text cut off, labels, names and numbers that wrap, spilling or sideways scroll, overlapping siblings, crushed text, and tag labels under 4.5:1 on a dark fill. It writes `report.md` (worst first), `report.json` and `index.html` (a gallery with each problem outlined), and exits 1 if anything is left. Surfaces live in `e2e/visual-surfaces.mjs`; a genuine false positive goes in `IGNORE` in `e2e/visual.mjs` with why. `node e2e/visual.mjs 5e tracker --themes=light --no-phone` runs a slice and updates just those surfaces in the report. Running `node e2e/run.mjs` leaves `e2e/artifacts/visual` alone.

## Installing in a vault by hand

Copy `main.js`, `manifest.json` and `styles.css` to `<vault>/.obsidian/plugins/nimble-gm/`, then reload Obsidian or toggle the plugin. `./deploy.sh` does this for `~/Documents/DevVault`.

## Common tasks

- **New stat block field:** add it to `NimbleMonster` (systems/nimble/types.ts), parse it in `processKeyValue` (parser.ts), render it in `render.ts`, add a parser test.
- **New built-in condition:** add to `NIMBLE_CONDITIONS` in systems/nimble/types.ts.
- **New game system:** a folder `src/systems/<id>/` with a `system.ts` that implements `GameSystem`, added to `SHIPPED_SYSTEMS` (src/app/systems.ts). The lint rules pick the folder up on their own, and the conformance suite in tests/systems.test.ts runs against it.
- **Core needs something system-specific:** add a member to `GameSystem` (contract.ts), implement it in every system, and call it through `plugin.system(path)`. Never import a system from core.
- **New setting:** one every game shares goes in `EmberVaultSettings` + `CORE_DEFAULTS` (core/settings.ts) and a row in `app/settings-tab.ts`. A game's own: augment `EmberVaultSettings` in its `settings.ts` (as nimble/settings.ts does), give it a default in its `SettingsPart`, and a row in its `settingsSections`.
- **New tracker action:** add a method to `EncounterStore`, a unit test in `tests/encounters.test.ts`, and the button in `tracker-view.ts`.

## Obsidian review checks

The community directory's review bot flags things the `eslint-plugin-obsidianmd` recommended config misses, so `eslint.config.mjs` and `stylelint.config.mjs` add them and `npm run lint` fails on warnings. `.github/workflows/check.yml` runs it on every PR and push to main.

- No "command"/"commands" anywhere in a command name; no type assertions that don't change the type.
- CSS must be fully supported by Chromium 124 (Obsidian 1.6.5): no `display: contents`, no `clip-path` (draw shapes with SVG), no `column-gap` (use `gap`). Stylelint names the feature.
- No `!important`; raise specificity instead (see the print rules in styles.css).
- When the bot flags something new, add a rule for it here rather than only fixing the line.

## The compendium is the picker

Anything that asks the user to pick a monster, spell, item, feature or class opens the compendium dialog (Nimble: `openCompendiumModal`, or the helpers in compendium-pickers.ts; 5e: `openCompendium5eModal` and `pickMonster5e` in dnd5e/compendium-modal.ts) with `segment` / `only` set, rather than a new SuggestModal. New searchable data goes in `buildEntries` (compendium-entries.ts) with its facets, and a new filter key in `FACETS` (compendium-query.ts), so the tab, every dialog, the slash commands, `nimble:` autocomplete and Spotlight all get it.

## Shared components, GM and player alike

Running a campaign and playing in one show the same things; build each once and pass the difference as a flag (usually `c.role`), rather than a second component for the other side.

- Party: `renderRoster` and `heroCard` (campaign-ui.ts) for both roles; the GM side also feeds the encounter party from the same sheets (`syncPartyFromSheets` in main.ts).
- Monsters: `renderStatblock` and `renderLoreCard` (render.ts) share `renderActionBar`; `plugin.renderStatblock` adds the player's creature notes and every printing to any lore card.
- Vitals: `renderMeter` (core/vitals/meter.ts, every game) draws an HP or mana bar with its damage and heal animations and batched − / + taps; wrap it in `.nimble-sheet` or `.ev-vitals` for its styles. 5e's sheet uses it. Nimble's `renderActionDots` and `renderWoundPips` (vitals-ui.ts) draw action dots and Wound pips, for the character sheet (writing to the note) and the tracker's quick look (writing to the fight; `.nimble-sheet.ns-embed`).
- A game's sheet takes the page: `markSheetPage` (core/sheet-page.ts) hides the note's inline title and Properties box around any sheet, for notes with or without `cssclasses`; the sheet's own button shows the properties again.
- Dice and marks: `dieShape` and `triangleMark` (die-shape.ts), styled globally (`.ns-die`, `.ns-tri-mark`), used by the sheet and the Camp dialog.
- Dice rolled at the table: any die a hero holds can be typed in. Tap it to change it, tap an empty slot to add one; `renderFacePicker` (core/face-picker.ts) opens the strip of faces under the row. Nimble's class panel uses it for Fury and Judgment Dice.
- Rolls: `rollWith` and `RollDialog` for every sheet roll; the result lands in core's toast (`rollToast`, core/roll-toast.ts).
- Dialogs: `gameDialog`, `dialogLabel` and `dialogFoot` (core/dialog.ts) for any modal drawn for a game: its paper, its title type, labels beside their values, the HP keypad's footer. Builders and dialogs are archived in the design study's "Builders & dialogs" tab (`prototypes/design-study/src/78-tools.js`, shots by `node e2e/tools-shots.mjs`).
- Pips, in every game: `renderPipRow` (core/pip-row.ts), the one pip spec. A filled pip takes one away and an empty one adds one, one step at a time, never jumping to the pip tapped (`pipStep`, core/pips.ts). The pip that just changed animates: its fill grows in with a bounce or shrinks out (pass a stable `key` so the row remembers its last count; reduced motion turns it off). No right-click-to-undo, no tap-to-spend-anywhere. Nimble's sheet and tracker pips predate it and follow the same spec (vitals-ui.ts, tracker-view.ts).

## Pills and compact buttons

Build new pills with core's `pill()` (core/pill.ts); don't hand-roll icon+label markup. `pill(parent, { icon, text, tag: 'span' | 'button' | 'a', cls, title, attr })` writes `.ev-pill` > `.ev-pill-icon` (the svg) + `.ev-pill-text`, and its CSS (next to the shared rule) puts both on one centre line with one gap and the icon at the text's size. Your class gives the look (colours, border, padding, font size); set `--ev-pill-icon` or `--ev-pill-gap` if a pill really needs another size. `setPill(el, { icon, text })` redraws one. Inline references (`nimble:…`, `5e:…`) are split pills: build them with `refPill()` (core/inline-refs.ts) so references look the same in every game.

Every pill, chip and small icon+label button is centred by one shared rule at the end of the character sheet section of `styles.css` (flex row, icons as blocks, labels at `line-height: normal`). Don't use `line-height: 1` on labels: at small sizes Chromium rounds the font's ascent and descent and the label lands ~1px high. A new pill class goes in that rule's list **and** in `PILL_SELECTORS` in `e2e/align.mjs`. The rule outranks every component rule (`:not(#nimble-pill)`), so a pill's hidden state needs `:not(#nimble-pill)` too (as the builder's `.is-hidden` has). Something that looks like a pill to the visual check but isn't one (a rules word, a box of pills, a row, a checkbox) goes in `NOT_PILLS` next to it, with why. The `pills:` e2e tests measure the real glyphs (capital height, real baseline) in both games (Nimble's sheet, level up, references, quick look, hover card, compendium, Spotlight, slash menu; 5e's references, quick look, encounter block, compendium, tracker, sheet, rules card) and fail if an icon or label drifts more than 1px or an icon sits closer than 3px to its label. `PILLS_VERBOSE=1 node e2e/run.mjs pills` lists what each surface measured and saves a picture of each in `e2e/artifacts/`.

## Releasing

Every PR merged into `main` is released by `.github/workflows/auto-release.yml` (details in RELEASING.md). Don't bump versions in a PR yourself.

- Default is a patch release. When the user says a change is a minor or major release, add the `release: minor` or `release: major` label to the PR (`gh pr edit <n> --add-label "release: minor"`). For `release: skip`, only when they say not to release.
- Run `npm test && npm run test:e2e` before merging; `release.yml` lints, tests, builds and attaches `main.js`, `manifest.json`, `styles.css`.
- Every PR adds its changes to `CHANGELOG.md` under `## [Unreleased]` (Added / Changed / Fixed), written plainly in the user's voice; the release workflow turns that section into the tag message and the release notes (`scripts/changelog.mjs`).

## Shipping a feature

A feature isn't done until people can find out about it. Every PR that adds or changes something a user sees does all of this before it merges, in the same PR (a commit per part is fine):

1. **Changelog.** Bullets under `## [Unreleased]` in `CHANGELOG.md`, in `### Added`, `### Changed` or `### Fixed`. For a release worth announcing, put a one-line headline on its own line above `### Added`: it's the title on the site's changelog page and in the link preview when the release is shared (Discord, etc.). End a feature's bullet with a link to its guide page, written repo-relative: `See the [builder guide](docs/builder.md).` The site's changelog shows it as a Guide pill and lists the release's guide pages under its title; release notes point it at the guide on the site.
2. **User guide.** Explain it in `docs/` with an example: the block, the command, what to click. A big feature gets its own page, listed in `docs/README.md`; a smaller one goes in the page it belongs to. Add it to `docs/slash-commands.md` or `docs/settings.md` if it adds a command or setting, and `docs/faq.md` if people will ask.
3. **Landing page.** Give it a tile in the features bento (`#features` in `site/index.html`), linking its guide page, with a `<span class="new-tag">New</span>` while it's recent (drop the tag from tiles two minor releases old). A headline feature can replace a card in the "What's new" section (`#new`).
4. **Screenshots.** If the guide or the tile shows it, add a shot to `e2e/screenshots.mjs` and run `node e2e/screenshots.mjs <name>` (it runs hidden). Only commit the PNGs you meant to change.
5. **Check.** `node scripts/check-docs.mjs --base origin/main` runs the same check as the PR's **Docs check** workflow: broken links fail, and a new `### Added` entry without a `docs/` change or a `site/index.html` change fails. If one half really isn't needed (a small option that doesn't merit a tile), label the PR `docs: skip` or `site: skip`. `npm run site:serve` previews the landing page, the guide and the changelog at <http://localhost:8765>.

The site's changelog (`/changelog/`, one page per release at `/changelog/<version>/`, and an Atom feed) is built from `CHANGELOG.md` by `scripts/build-changelog.mjs`; never edit it by hand. It redeploys after every release, and the landing page's "New in" chip follows the latest release.

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

## Boxes and NPCs

- A box's look is stored only on its fence line (`boxFence` writes just what differs from the type's preset). The editor previews live and writes once, on close. Embeds and hover previews find their fence by matching the body in the file.
- The NPC list comes from `CampaignStore.rebuild` (`nimble: npc` or `#npc`). Mentions are only linked to NPCs in the same campaign, or NPCs outside any campaign. Aliases shorter than 3 characters are ignored.

## 3D dice

- `esbuild.config.mjs` builds three.js and `dice3d/renderer.ts` into a separate IIFE and embeds it in main.js as a string (`import RENDERER_SRC from 'dice3d-bundle'`). It's evaluated on the first roll, so startup doesn't pay for it.
- The roll is decided by `dice.ts`. The renderer simulates the throw headlessly with cannon-es, sees which face lands up, relabels the faces (`relabel` in geometry.ts) so that face shows the value, then replays the recording.
- Finishes live in `dice3d/shaders.ts` (onBeforeCompile on MeshPhysicalMaterial). `dice3d/materials.ts` lists them without importing three, so settings can show the list without loading the 3D bundle.
- e2e runs with `dice3d: false`, except the one 3D test, so notices aren't delayed elsewhere.
