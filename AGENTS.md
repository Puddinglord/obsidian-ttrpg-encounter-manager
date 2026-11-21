# Ember Vault: guide for coding agents

An Obsidian plugin (TypeScript, esbuild) for running and playing tabletop RPG campaigns from your notes. It supports more than one game system: today **Nimble** and **5e** (2024 and 2014 rules, from the SRD). Read this first, then the guide for the part you're changing:

| You're changing | Read |
|---|---|
| Anything shared (campaigns, maps, references, dice, hover cards, indexes) | [src/core/AGENTS.md](src/core/AGENTS.md) |
| How games plug in, or adding a new game | [src/systems/AGENTS.md](src/systems/AGENTS.md) |
| Nimble | [src/systems/nimble/AGENTS.md](src/systems/nimble/AGENTS.md) |
| 5e | [src/systems/dnd5e/AGENTS.md](src/systems/dnd5e/AGENTS.md) |
| File-by-file map, test harness, Obsidian review rules | [CLAUDE_CODE_GUIDE.md](CLAUDE_CODE_GUIDE.md) |
| How anything the user sees should look (every game, every surface) | [prototypes/design-study/README.md](prototypes/design-study/README.md): the design study, our living design archive, and its rules |
| Where the architecture is going | [prototypes/SYSTEMLESS.md](prototypes/SYSTEMLESS.md), then [prototypes/MULTI-SYSTEM.md](prototypes/MULTI-SYSTEM.md) for how we got here |

## The shape of the code

```
main.ts              the plugin: what every game shares (settings, dice, campaigns, events), plugin.system(path),
                     plugin.edition(path), plugin.runtime(id). It imports no game system
src/app/             wiring that needs both core and systems: settings tab, Omnisearch,
                     maps with encounter tokens, encounter blocks (picks the system), SHIPPED_SYSTEMS
src/core/            shared by every game; imports no system
src/systems/
  contract.ts        GameSystem: everything core may ask a game system for
  registry.ts        which system a campaign uses (`system:` on its home note, aliases, editions)
  nimble/            the Nimble game
  dnd5e/             the 5e game
```

`npm run lint` enforces the layers: core can't import a system or `src/app`, and no system can import another system. **A change inside one system can only break another through core or the contract.** If core needs something game-specific, add a member to `GameSystem` (written from the real call site), implement it in every system, and call it through `plugin.system(path)`.

## Commands

```bash
npm install
npm run dev            # watch build
npm run build          # type-check + production build (main.js)
npm test               # unit tests (vitest + happy-dom), fast
npm run lint           # eslint (Obsidian's review rules + layer boundaries) and stylelint
npm run test:e2e       # build, then the whole e2e suite in 3 hidden Obsidians side by side (a few minutes)
node e2e/run.mjs "5e"  # only e2e tests whose name contains "5e" (one Obsidian)
npm run test:visual    # build, then every surface of both games, screenshotted and checked (see CLAUDE_CODE_GUIDE.md)
```

Test in tiers, so a check costs what the change is worth:

- **While you work:** `npm test`, `npm run lint`, `npm run build`, the e2e tests for what you touched (`node e2e/run.mjs "<name>"`) and the visual check for the surfaces you touched (`node e2e/visual.mjs nimble sheet --themes=light`). After a fix, rerun only what failed.
- **Once, at the end of a batch of work and before a PR:** the full suites, `npm run test:e2e` and `npm run test:visual`, in the background. Read the summary and the failures, not the whole log.
- **Before a release:** `node e2e/visual.mjs --full` adds the widths in between.

The e2e Obsidians run hidden; don't run them in the foreground (the maintainer works while they run).

## Rules that don't bend

- **The design study is the reference for UI.** Build screens from [prototypes/encounter-design-study.html](prototypes/encounter-design-study.html), check them against it, and change the study in the same PR when a design changes. Its rules (prototypes/design-study/README.md) hold everywhere; above all, every pill, tag and compact button is centred on its capitals within 1px and measured by the `pills:` e2e tests.

- **Never break a saved format.** Fence names (```` ```nimble ````, ```` ```5e ````, ```` ```nimble-encounter ````…), reference prefixes (`nimble:`, `5e:`), frontmatter keys and `data.json` fields are read from users' vaults forever. Add, don't rename. Missing means the old meaning: no `system:` is Nimble.
- **Never put note text into `innerHTML`.** Use `appendRichText()` (core/markdown.ts) or `createEl({ text })`. A stat block pasted from anywhere must not run script.
- **Pure modules stay pure:** rules, parsers, data and model modules import nothing from `obsidian`, so they're unit-tested in plain Node.
- **Only ship content we're allowed to.** Nimble: by its creator's permission, with attribution and a buy link. 5e: the SRD 5.1 and 5.2 only (CC-BY-4.0), with attribution. Anything else comes from the user (their notes, imported content). See NOTICE.md.
- **Obsidian's review rules** (eslint enforces most; details in CLAUDE_CODE_GUIDE.md): no `eval`, no `innerHTML` with data, no `!important`, CSS that Chromium 124 supports, no "command" in command names, no needless type assertions.

## Working conventions

- **Branching and PRs:** one PR per spec, one commit per stage or phase. Don't push or open a PR without being asked.
- **Releases:** merged PRs release automatically. A patch release unless told `release: minor` or `release: major`. New user-facing work goes under `## [Unreleased]` in CHANGELOG.md.
- **Writing style:** user-facing text (docs, settings, notices) is plain and short. No AI-sounding filler, no help text that repeats the label.
- **Commit messages:** an emoji, a title saying what changed for users, then the why.
