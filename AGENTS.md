# Ember Vault: guide for coding agents

An Obsidian plugin (TypeScript, esbuild) for running and playing tabletop RPG campaigns from your notes. It supports more than one game system: today **Nimble** and **5e** (2024 and 2014 rules, from the SRD). Read this first, then the guide for the part you're changing:

| You're changing | Read |
|---|---|
| Anything shared (campaigns, maps, references, dice, hover cards, indexes) | [src/core/AGENTS.md](src/core/AGENTS.md) |
| How games plug in, or adding a new game | [src/systems/AGENTS.md](src/systems/AGENTS.md) |
| Nimble | [src/systems/nimble/AGENTS.md](src/systems/nimble/AGENTS.md) |
| 5e | [src/systems/dnd5e/AGENTS.md](src/systems/dnd5e/AGENTS.md) |
| File-by-file map, test harness, Obsidian review rules | [CLAUDE_CODE_GUIDE.md](CLAUDE_CODE_GUIDE.md) |
| Where the architecture is going | [prototypes/SYSTEMLESS.md](prototypes/SYSTEMLESS.md), then [prototypes/MULTI-SYSTEM.md](prototypes/MULTI-SYSTEM.md) for how we got here |

## The shape of the code

```
main.ts              the plugin: wiring, settings, plugin.system(path), plugin.edition(path)
src/app/             wiring that needs both core and systems: settings tab, slash commands, Spotlight,
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
npm run test:e2e       # build, then drive a real, hidden Obsidian (about 5 minutes)
node e2e/run.mjs "5e"  # only e2e tests whose name contains "5e"
```

Before calling a change done: `npm test`, `npm run lint`, `npm run build`, and the e2e tests for what you touched. Run the full e2e suite before a commit that touches shared code. The e2e Obsidian runs hidden; don't run it in the foreground (the maintainer works while it runs).

## Rules that don't bend

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
