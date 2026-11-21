# Nimble

The first and default game system: a campaign with no `system:` (or `system: Nimble`) is Nimble. Nimble's creator allows the plugin to bundle all Nimble text, including the playtest drafts, as long as it's attributed and points readers to nimbleRPG.com (`bestiary.ts` has the wording).

Nimble plugs in like any other game: `register.ts` wires it in, `runtime.ts` (`nimble()`) holds its live state, and the plugin itself knows nothing about it. Its tools are the most complete in the plugin: when a shared engine is built (see [prototypes/SYSTEMLESS.md](../../../prototypes/SYSTEMLESS.md)), Nimble's version is usually the starting point. Port it onto the engine with the e2e suite as the safety net.

## Map

| Area | Modules |
|---|---|
| Rules (pure, tested) | `rules.ts` (armor, Wounds, minions, Last Stand, difficulty budget, Tougher/Weaker), `attack-roll.ts` (primary die: 1 misses, max explodes), `roll-def.ts` (stacked advantage), `resource-def.ts` (class dice), `builder-math.ts` (the GM Guide's tables) |
| Monsters | `types.ts` (`NimbleMonster`, settings), `parser.ts` (```nimble blocks, forgiving), `statblock-issues.ts`, `render.ts`, `bestiary.ts` + `data/bestiary.json`, `monster-index.ts` (also indexes homebrew spells and items) |
| References | `inline-ref.ts` (`nimble:Name`, `nimble:spell:Name`; the provider for core's inline refs; hover content), `suggest.ts`, `compendium-ref.ts` |
| Compendium | `compendium.ts` + `data/compendium.json`, `compendium-data.ts` (the books, then the campaign's content packs, then homebrew), `compendium-entries.ts`, `compendium-query.ts` (Nimble's words for core's search language), `filter-field.ts` (core's, with Nimble's words), `compendium-browser.ts` (Nimble's `CompendiumSource` for core's browser, and its page), `compendium-view.ts`, `compendium-modal.ts`, `compendium-pickers.ts`, `compendium-card.ts`, `compendium-art.ts` |
| Encounters and the tracker | `encounters.ts` (the store; a side's turn starting, a turn marked done and the round ending run core's timed conditions, `core/tracker/effects.ts`, and fire `effects`, which `register.ts` shows as core's prompt), `tracker-view.ts`, `hp-pad.ts`, `vitals-ui.ts`, `record-modal.ts` (quick look), `encounter-block.ts`, `battle-notes.ts` (players), `builder-modal.ts`, `balance-ui.ts`, `count-modal.ts`, `saved-fight.ts` |
| Characters | `character-def.ts` (frontmatter in, edits out; pure), `character-sheet.ts` (```nimble-sheet, as the design study draws it), `class-panel-def.ts` (what the class panel holds: dice, mana, uses, charges, Raging, a Quarry, each with its book text; pure), `class-panel.ts` (draws it), `class-scroll.ts` (each class's scrollwork heading), `character-view.ts`, `character-modals.ts` (the note a new hero is written to), `character-wizard.ts` (New character and Level up: one wizard, the sheet's stat boxes for placing the array), `new-character.ts` (a new hero's frontmatter, levelled up to where they start; pure), `level-plan.ts` (what each level asks for, from the books: picks, spells, stat increases, what a subclass swaps; and writing the choices; pure), `sheet-marks.ts`, `roll-dialog.ts`, `character-register.ts` |
| Wiring | `runtime.ts` (`nimble()`: the monster index, the encounter store, and helpers like `renderStatblock`, `addToEncounter`, `openBestiary`), `settings.ts` + `settings-ui.ts` (its settings fields and sections), `map-tokens.ts`, `register.ts` (its `register()`: views, the ```nimble block, `nimble:` references and autocomplete, builders, homebrew and saved-fight blocks, character features, the monster index kept current) |
| Builders | `entity-builder.ts` (Nimble's kinds for core's builder frame), `entity-monster*.ts`, `entity-homebrew*.ts`, `homebrew-def.ts`, `homebrew-block.ts`, `builder-register.ts` |
| Content packs and your own content | `content.ts` (pure: the kinds Nimble takes, with starters; `NIMBLE_BLOCKS`, the ```nimble-class/-subclass/-option/-ancestry/-background/-boon/-property/-language/-rule/-condition blocks; `contentNimble` (entries as content, a homebrew entry with its `note`), `mergeNimbleData` (content onto the books: a subclass joins its class, an option its list), `packMonster`, `contentTarget` (a block's card)); `content-blocks.ts` draws a block; `register.ts` sets the layer per campaign (`setContentLayer` in compendium-data.ts, `index.setPacks` for monsters), your blocks last (the Homebrew pack). The schema is `docs/content/nimble.schema.json` (UPDATE_SCHEMAS=1 on `tests/nimble-content-packs.test.ts` writes it), the example `docs/content/examples/nimble-lantern-road.json` |
| The system | `system.ts` |

## Data

- `scripts/bestiary/` and `scripts/compendium/`: raw per-page extractions from the Nimble books (`raw/`), the extraction brief, and `merge.py`, which writes `data/*.json`.
- Updating from a newer book version: diff the new PDF against what's in `raw/` and patch, rather than re-extracting (ask the maintainer for the source files).
- `data/*.json` is imported directly, not lazily. Nimble is the default, so it's needed at startup anyway.

## Where a hero's content comes from

New character, Level up and the sheet read classes, subclasses, ancestries, backgrounds, option lists, spells and rules from one place: `heroCompendium({ path, className })` (compendium-data.ts), looked up once per dialog and passed down (`CharacterWizard`'s `comp`, `createCharacterNote`'s `comp`, the sheet's `comp`). It returns the bundled books with the note's campaign's content packs on top (`packs:` on its home note), the content folder's blocks on top of those (the Homebrew pack), and the vault's homebrew spells and items on top of everything. A class's own dice come from its resource's `dice` (`ruleFromData` in resource-def.ts) before the books' rules by name. What each level asks for is worked out from the class's data in level-plan.ts (its levels, features, option groups, resources, subclasses, and a feature's optional `choose`, `increase`, `learn` and `uses`, read before its words), never from a class's name, so a class that isn't in the books levels up the same way (tests/new-character.test.ts and tests/content-blocks.test.ts have one). The class panel (class-panel-def.ts) reads a class's `states`, `target`, a resource's `spend` and its dice's `maxSteps` before the books' feature names (Rage, Hunter's Mark, Lay on Hands).

## Pitfalls

- **Fences and keys are Nimble's forever:** ```nimble, ```nimble-sheet, ```nimble-npc, ```nimble-spell, ```nimble-item, `nimble:` references, `nimble: monster|npc|character|creature` frontmatter. Core reuses some of these names (```nimble-encounter, ```nimble-map, ```nimble-campaign, `nimble: campaign`) for every system; that's historical, and they can't be renamed.
- **Nimble's settings fields sit at the top level of `data.json`** (they were there first), declared by augmenting `EmberVaultSettings` in `settings.ts`. `NimbleStatblocksSettings` and `DEFAULT_SETTINGS` in `types.ts` are old names kept for Nimble's own code. Other systems keep their state under `settings.systemData.<id>`.
- **`nimble()` is Nimble's alone.** Core and `src/app` never call it; they ask through the contract. Tests and e2e reach it as `plugin.runtime('nimble')`.
- **The player view** (`role: player`) shows lore cards instead of stat blocks (`plugin.hideStats`). Any new monster UI must respect it.
