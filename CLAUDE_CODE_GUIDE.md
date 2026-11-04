# Nimble Statblocks - Development Guide

An Obsidian plugin (TypeScript, bundled with esbuild) that renders Nimble TTRPG monster stat blocks, `nimble:` inline references, and an encounter tracker.

## Project structure

```
main.ts                 Plugin entry: wiring, commands, dice rolls, settings load/save
src/
  types.ts              Data types, default settings, built-in conditions, uid()
  parser.ts             Stat block parsing, movement, armor, finding ```nimble blocks in a note
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

- `types.ts`, `parser.ts`, `markdown.ts`, `dice.ts` must not import `obsidian`, so unit tests run in plain Node.
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

Copy `main.js`, `manifest.json` and `styles.css` to `<vault>/.obsidian/plugins/nimble-statblocks/`, then reload Obsidian or toggle the plugin. `./deploy.sh` does this for `~/Documents/DevVault`.

## Common tasks

- **New stat block field:** add it to `NimbleMonster` (types.ts), parse it in `processKeyValue` (parser.ts), render it in `render.ts`, add a parser test.
- **New built-in condition:** add to `NIMBLE_CONDITIONS` in types.ts.
- **New setting:** add to `NimbleStatblocksSettings` + `DEFAULT_SETTINGS`, then a control in `settings-tab.ts`.
- **New tracker action:** add a method to `EncounterStore`, a unit test in `tests/encounters.test.ts`, and the button in `tracker-view.ts`.

## Releasing

1. Bump `version` in `manifest.json`, `package.json` and add it to `versions.json`
2. `npm test && npm run test:e2e`
3. Push a tag; `.github/workflows/release.yml` builds and attaches `main.js`, `manifest.json`, `styles.css`
