# src/core: what every game shares

Core is the part of Ember Vault that doesn't know which game you play. It may import `obsidian`, other core modules, and the contract/registry types (`../systems/contract`, `../systems/registry`). **It must not import any game system or `src/app`;** `npm run lint` fails if it does.

## When code belongs here

When a **second** game needs it. Don't move code into core because it might be shared one day: move it when a system would otherwise copy it, and make the first system use the core version too (as was done for the hover card and inline references). Copying a module from one system into another is the thing to avoid.

## Reaching a game system from core

Core gets the plugin as a type (`import type EmberVaultPlugin from '../../main'`) and asks it:

- `plugin.system(path?)`: the `GameSystem` for a note. It resolves the note's campaign, else the active campaign, else the default (Nimble).
- `plugin.edition(path?)`: the rules version, for systems that have several.
- `plugin.systems`: the registry (every shipped system).

Core tells systems what happened through `plugin.events`: `party-changed` (the party was edited or swapped) and `active-campaign-changed`. Each campaign keeps its own party and, through `GameSystem.campaignState`, each game's fight (`settings.campaigns[folder].games`); `CampaignStore.setActive` swaps both. Systems listen in their `register()`.

Then it calls a contract member: `system.characters?.promptNew(…)`, `system.quickLook(…)`, `system.conditions(edition)`. If what you need isn't in the contract, add it there (see [src/systems/AGENTS.md](../systems/AGENTS.md)). Core never reaches into a game's state (`nimble()`, `dnd5e()`, `plugin.runtime(id)`); ask through the contract.

## The shared pieces

| Module | What it's for |
|---|---|
| `campaign-model.ts`, `campaigns.ts` | Campaigns from folders and frontmatter (`system:`, `edition:`, `role:`), the active campaign, characters in a campaign |
| `campaign-ui.ts`, `campaign-modals.ts`, `campaign-templates.ts` | The Campaign panel, New campaign and Campaign settings (with the Game system picker), starter notes |
| `inline-refs.ts` | Finds `prefix:Name` inline code in Reading view and Live Preview; each system adds a provider (`plugin.inlineRefs.add`). `refPill()` draws the pill for every game: [icon or level | name], or [name | ?] |
| `pill.ts` | `pill(parent, { icon, text, tag, cls, title })`: every pill, chip and compact icon+label button. Build new ones with it, not hand-rolled icon+label markup; it's centred by `.ev-pill` in styles.css and measured by the `pills:` e2e tests (see CLAUDE_CODE_GUIDE.md, "Pills and compact buttons") |
| `hover-preview.ts` | The one floating card; `plugin.hover.attach(anchor, () => content)` |
| `block-index.ts` | A live vault index of fenced blocks (a system's stat blocks), scoped per campaign with `plugin.canSee` |
| `note-quick-look.ts` | A quick-look modal for any note |
| `markdown.ts` | Safe inline markdown and dice detection (`appendRichText`) |
| `wiki-links.ts` | `[[links]]` inside rendered text |
| `dice.ts`, `dice3d/` | Dice expressions, plain rolls, 3D dice (game-specific roll rules live in systems) |
| `encounter-def.ts` | The ```nimble-encounter format, shared by every system (`- 3 Goblin`, `` - `5e:Goblin` ``) |
| `map-def.ts`, `box-def.ts`, `box-block.ts`, `npc-*`, `tables.ts` | Maps, boxes, NPC cards and links, styled tables |
| `spotlight-def.ts`, `spotlight-source.ts` | Spotlight's query (`parseSpotlight`), its one ranked list (`rankSpotlight`, `rankByName`), and what a system gives it through the contract's `spotlight` member (`SpotlightSource`: rows, adding several, typed filters with `compendiumFilters`, the lookup). Spotlight itself (`app/spotlight.ts`) keeps NPCs, notes, conditions, commands and dice |
| `slash.ts` | The "/" menu and the commands every game shares; systems add theirs with `slashCommands` |
| `builder/` | The builder: `frame.ts` (the dialog: steps, preview, check, fields; kinds registered per system with `registerKind(system, kind, …)`), `schema.ts` (a builder from a schema: steps of fields, formulas as hints and placeholders; `rebuilds` on a field others depend on, `max` on chips), and wizards too: a kind registered `hidden` opens only on purpose, and `apply` finishes some other way than a new note (a level up writes a sheet's properties), `commands.ts` (New monster/spell/item… for the note's system, the Edit pencil, `rewriteBlock`). Core's slash menu offers `/new-<kind>` for whatever the note's system registered |
| `compendium/` | The compendium engine: `query.ts` (the search language, bound to a system's words by `createCompendiumQuery(schema)`), `filter-field.ts` (filters as chips), `browser.ts` (the browser: tabs, list, page, keys, fed by a system's `CompendiumSource`), `refs.ts` (copy or insert a reference) |
| `content/` | Content packs: `spec.ts` (kinds as fields: checks entries with plain reasons, and writes the JSON Schema), `packs.ts` (reading a pack, `packs:` per campaign), `store.ts` (`plugin.content`: the packs in the content folder, kept current), `import-modal.ts` (Import content…, the report) |
| `tracker/` | What every tracker shares: `hp.ts` (the HP command language: `7`, `7!`, `7v`, `7r`, `+7`, `=7`, `t7`; pure) `hp-pad.ts` (the HP keypad, told its modes, crit and toggles, and a preview by the game) `tokens.ts` (a fight's combatants as map tokens, `combatTokens`) and `sortable.ts` (drag to reorder any list: mouse from the row, touch from `.ev-sort-handle`, sliding rows, a drop slot, auto-scroll, Escape; the host changes its data in `onDrop` and redraws). Turn order, rounds and the rest of a tracker stay each game's |
| `note-kinds.ts`, `note-card.ts` | The shared note kinds (NPC, location, quest, map) and what a system adds: properties new notes get (`fields`), stats on the card, its own drawing (`card`, or `replace` to draw the whole card). NPCs draw it in their ```nimble-npc card; other kinds in a ```nimble-note block that new notes get when the system has a `card` for them |
| `types.ts` | Conditions (`ConditionDef`, `AppliedCondition`), party members, roll log, `uid()` |
| `rule-terms.ts`, `rule-term-ui.ts` | Clickable rules words: a game's terms (pure lookups and patterns), and the UI (`appendWithTerms` for text, `markTerm` for a label, `showTerm`'s card with Back and Open in compendium). The words come from the contract's `ruleTerms` |
| `settings.ts`, `settings-ui.ts` | `EmberVaultSettings` (what every game shares; a system adds its fields by augmenting the interface and passing a `SettingsPart`), `migrateSettings(saved, parts)`; settings rows and sections for the settings page |
| `dice-edge.ts`, `dice-attack.ts` | Rolls with stacked advantage and disadvantage, modifiers and extra dice; exploding attack rolls for a game whose `attackRolls` asks for them |
| `popover.ts`, `touch.ts`, `segmented.ts`, `tooltips.ts`, `compat.ts`, `internals.ts` | UI helpers |

## Pitfalls

- **Campaigns are indexed after Obsidian's layout is ready.** Anything drawn at startup that depends on the note's system or edition must redraw on `plugin.campaigns.on('changed')` if the answer changed (see `app/encounter-blocks.ts`).
- **`title` attributes become Obsidian tooltips:** `tooltips.ts` moves them to `aria-label`. Tests should read either.
- **Names in frontmatter can be numbers** (`edition: 2024` is a YAML number); read them through helpers that accept both.
- **Pure modules** (`types.ts`, `note-kinds.ts`, `spotlight-def.ts`, `spotlight-source.ts` (types only from obsidian), `compendium/query.ts`, `content/spec.ts`, `content/packs.ts`, `encounter-def.ts`, `map-def.ts`, `markdown.ts`, `dice.ts`, `campaign-model.ts`) must not import `obsidian`.
