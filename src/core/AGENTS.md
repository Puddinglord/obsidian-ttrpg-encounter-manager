# src/core: what every game shares

Core is the part of Ember Vault that doesn't know which game you play. It may import `obsidian`, other core modules, and the contract/registry types (`../systems/contract`, `../systems/registry`). **It must not import any game system or `src/app`;** `npm run lint` fails if it does.

## When code belongs here

When a **second** game needs it. Don't move code into core because it might be shared one day: move it when a system would otherwise copy it, and make the first system use the core version too (as was done for the hover card and inline references). Copying a module from one system into another is the thing to avoid.

## Reaching a game system from core

Core gets the plugin as a type (`import type NimbleStatblocksPlugin from '../../main'`) and asks it:

- `plugin.system(path?)`: the `GameSystem` for a note. It resolves the note's campaign, else the active campaign, else the default (Nimble).
- `plugin.edition(path?)`: the rules version, for systems that have several.
- `plugin.systems`: the registry (every shipped system).

Then it calls a contract member: `system.characters?.promptNew(…)`, `system.quickLook(…)`, `system.conditions(edition)`. If what you need isn't in the contract, add it there (see [src/systems/AGENTS.md](../systems/AGENTS.md)). Don't reach into `plugin.encounters` or other Nimble-typed members from new core code: they're Nimble's.

## The shared pieces

| Module | What it's for |
|---|---|
| `campaign-model.ts`, `campaigns.ts` | Campaigns from folders and frontmatter (`system:`, `edition:`, `role:`), the active campaign, characters in a campaign |
| `campaign-ui.ts`, `campaign-modals.ts`, `campaign-templates.ts` | The Campaign panel, New campaign and Campaign settings (with the Game system picker), starter notes |
| `inline-refs.ts` | Finds `prefix:Name` inline code in Reading view and Live Preview; each system adds a provider (`plugin.inlineRefs.add`) |
| `hover-preview.ts` | The one floating card; `plugin.hover.attach(anchor, () => content)` |
| `block-index.ts` | A live vault index of fenced blocks (a system's stat blocks), scoped per campaign with `plugin.canSee` |
| `note-quick-look.ts` | A quick-look modal for any note |
| `markdown.ts` | Safe inline markdown and dice detection (`appendRichText`) |
| `wiki-links.ts` | `[[links]]` inside rendered text |
| `dice.ts`, `dice3d/` | Dice expressions, plain rolls, 3D dice (game-specific roll rules live in systems) |
| `encounter-def.ts` | The ```nimble-encounter format, shared by every system (`- 3 Goblin`, `` - `5e:Goblin` ``) |
| `map-def.ts`, `box-def.ts`, `box-block.ts`, `npc-*`, `tables.ts` | Maps, boxes, NPC cards and links, styled tables |
| `types.ts` | Conditions (`ConditionDef`, `AppliedCondition`), party members, roll log, `uid()` |
| `popover.ts`, `touch.ts`, `segmented.ts`, `tooltips.ts`, `compat.ts`, `internals.ts` | UI helpers |

## Pitfalls

- **Campaigns are indexed after Obsidian's layout is ready.** Anything drawn at startup that depends on the note's system or edition must redraw on `plugin.campaigns.on('changed')` if the answer changed (see `app/encounter-blocks.ts`).
- **`title` attributes become Obsidian tooltips:** `tooltips.ts` moves them to `aria-label`. Tests should read either.
- **Names in frontmatter can be numbers** (`edition: 2024` is a YAML number); read them through helpers that accept both.
- **Pure modules** (`types.ts`, `encounter-def.ts`, `map-def.ts`, `markdown.ts`, `dice.ts`, `campaign-model.ts`) must not import `obsidian`.
