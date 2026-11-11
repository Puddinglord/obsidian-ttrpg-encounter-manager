# Ember Vault - Development Guide

An Obsidian plugin (TypeScript, bundled with esbuild) that renders Nimble TTRPG monster stat blocks, `nimble:` inline references, and an encounter tracker.

## Project structure

```
main.ts                 Plugin entry: wiring, commands, dice rolls, settings load/migration, bestiary, copy-to-vault
src/
  types.ts              Data types, default settings, Nimble 3.2 conditions, uid()
  rules.ts              Nimble 3.2 rules: armor, hero Wounds, minions, Last Stand, conditions, difficulty budget
  parser.ts             Stat block parsing (+ legacy fields), toStatblockSource(), finding ```nimble blocks
  bestiary.ts           Bundled bestiary conversion, attribution text
  data/bestiary.json    525 Nimble monsters (built by scripts/bestiary/merge.py)
  markdown.ts           Safe inline markdown (bold/italic/wikilinks/dice/keywords) built as DOM nodes
  render.ts             The one stat block renderer (notes, bestiary, tracker, hover previews)
  icons.ts              Badge SVGs
  monster-index.ts      Vault monsters + bundled bestiary, by name
  encounters.ts         Encounter state + every mutation (EncounterStore)
  tracker-view.ts       The encounter tracker sidebar
  bestiary-view.ts      The bestiary tab
  encounter-def.ts      ```nimble-encounter format (pure)   encounter-block.ts  its renderer
  builder-modal.ts      Encounter builder
  map-def.ts            ```nimble-map format (pure)         map-block.ts        its renderer (pins, tokens)
  slash.ts              "/" commands
  spotlight.ts          Cmd/Ctrl+K box: search adversaries/NPCs/notes, roll dice, run commands (spotlight-def.ts is the pure query parser)
  inline-ref.ts         `nimble:Name` references and the interactive hover preview
  live-preview.ts       CodeMirror extension that renders references in Live Preview
  campaign-model.ts     Campaign structure from folders + frontmatter (pure, tested)
  campaigns.ts          CampaignStore: live index, active campaign, per-campaign party swap, note creation
  campaign-ui.ts        The outline (party line, Continue, chapters, sections) shared by panel and block
  campaign-view.ts      Campaign panel (left sidebar) and the ```nimble-campaign dashboard block
  campaign-modals.ts    New campaign, name prompt, campaign/chapter pickers
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

- `types.ts`, `rules.ts`, `parser.ts`, `bestiary.ts`, `encounter-def.ts`, `map-def.ts`, `markdown.ts`, `dice.ts` must not import `obsidian`, so unit tests run in plain Node.
- Rules live in `rules.ts` and are unit-tested; views never re-implement them.
- Never put note text into `innerHTML`. Use `appendRichText()` or `createEl({ text })`. A stat block pasted from somewhere else must not be able to run script.
- Views don't mutate encounter data directly. Call `plugin.encounters.*`; it saves and fires `changed`, and every open tracker re-renders.

## Commands

```bash
npm install          # once
npm run dev          # watch build (main.js with inline sourcemap)
npm run build        # type-check + production build
npm test             # unit tests (fast, no Obsidian needed)
npm run test:e2e     # build, then drive a real Obsidian through the e2e suite
node e2e/run.mjs dice           # only e2e tests whose name contains "dice"
node e2e/explore.mjs /tmp/shots # screenshots of every fixture note and the tracker
node e2e/layout-sweep.mjs       # every sample-vault note in the hover preview and at phone width; fails on crushed or spilling elements
```

## End-to-end tests

`e2e/harness.mjs` starts Obsidian with its own `--user-data-dir` and a throwaway copy of `e2e/fixtures/vault`, installs the freshly built plugin, and connects with `playwright-core` over the Chrome DevTools Protocol on a free port. Your real Obsidian settings and vaults are never touched, and it works whether or not your own Obsidian is open.

- Needs Obsidian installed at `/Applications/Obsidian.app` (or set `OBSIDIAN_BIN`).
- A window appears while tests run; that's the test copy.
- Failure screenshots and a few showcase shots land in `e2e/artifacts/` (git-ignored).
- `KEEP_E2E=1` keeps the temp vault around for poking at.
- Inside a test, `o.eval((app, plugin, arg) => ..., arg)` runs code inside Obsidian. Only plain JSON comes back.

To cover a new scenario, add notes to `e2e/fixtures/vault/` and a `test('...', async (o) => { ... })` block in `e2e/run.mjs`.

## Installing in a vault by hand

Copy `main.js`, `manifest.json` and `styles.css` to `<vault>/.obsidian/plugins/nimble-gm/`, then reload Obsidian or toggle the plugin. `./deploy.sh` does this for `~/Documents/DevVault`.

## Common tasks

- **New stat block field:** add it to `NimbleMonster` (types.ts), parse it in `processKeyValue` (parser.ts), render it in `render.ts`, add a parser test.
- **New built-in condition:** add to `NIMBLE_CONDITIONS` in types.ts.
- **New setting:** add to `NimbleStatblocksSettings` + `DEFAULT_SETTINGS`, then a control in `settings-tab.ts`.
- **New tracker action:** add a method to `EncounterStore`, a unit test in `tests/encounters.test.ts`, and the button in `tracker-view.ts`.

## Releasing

1. Bump `version` in `manifest.json`, `package.json` and add it to `versions.json`
2. `npm test && npm run test:e2e`
3. Push a tag; `.github/workflows/release.yml` builds and attaches `main.js`, `manifest.json`, `styles.css`

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

## Boxes and NPCs

- A box's look is stored only on its fence line (`boxFence` writes just what differs from the type's preset). The editor previews live and writes once, on close. Embeds and hover previews find their fence by matching the body in the file.
- The NPC list comes from `CampaignStore.rebuild` (`nimble: npc` or `#npc`). Mentions are only linked to NPCs in the same campaign, or NPCs outside any campaign. Aliases shorter than 3 characters are ignored.

## 3D dice

- `esbuild.config.mjs` builds three.js and `dice3d/renderer.ts` into a separate IIFE and embeds it in main.js as a string (`import RENDERER_SRC from 'dice3d-bundle'`). It's evaluated on the first roll, so startup doesn't pay for it.
- The roll is decided by `dice.ts`. The renderer simulates the throw headlessly with cannon-es, sees which face lands up, relabels the faces (`relabel` in geometry.ts) so that face shows the value, then replays the recording.
- Finishes live in `dice3d/shaders.ts` (onBeforeCompile on MeshPhysicalMaterial). `dice3d/materials.ts` lists them without importing three, so settings can show the list without loading the 3D bundle.
- e2e runs with `dice3d: false`, except the one 3D test, so notices aren't delayed elsewhere.
