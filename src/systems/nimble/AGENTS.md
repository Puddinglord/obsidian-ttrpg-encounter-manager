# Nimble

The first and default game system: a campaign with no `system:` (or `system: Nimble`) is Nimble. Nimble's creator allows the plugin to bundle all Nimble text, including the playtest drafts, as long as it's attributed and points readers to nimbleRPG.com (`bestiary.ts` has the wording).

Nimble predates the system split, so much of its wiring still lives in `main.ts` rather than a `register()`. Its tools are the most complete in the plugin: when a shared engine is built (see [prototypes/SYSTEMLESS.md](../../../prototypes/SYSTEMLESS.md)), Nimble's version is usually the starting point. Port it onto the engine with the e2e suite as the safety net.

## Map

| Area | Modules |
|---|---|
| Rules (pure, tested) | `rules.ts` (armor, Wounds, minions, Last Stand, difficulty budget, Tougher/Weaker), `attack-roll.ts` (primary die: 1 misses, max explodes), `roll-def.ts` (stacked advantage), `resource-def.ts` (class dice), `builder-math.ts` (the GM Guide's tables) |
| Monsters | `types.ts` (`NimbleMonster`, settings), `parser.ts` (```nimble blocks, forgiving), `statblock-issues.ts`, `render.ts`, `bestiary.ts` + `data/bestiary.json`, `monster-index.ts` (also indexes homebrew spells and items) |
| References | `inline-ref.ts` (`nimble:Name`, `nimble:spell:Name`; the provider for core's inline refs; hover content), `suggest.ts`, `compendium-ref.ts` |
| Compendium | `compendium.ts` + `data/compendium.json`, `compendium-data.ts` (with homebrew), `compendium-entries.ts`, `compendium-query.ts` (the search language), `filter-field.ts`, `compendium-browser.ts`, `compendium-view.ts`, `compendium-modal.ts`, `compendium-pickers.ts`, `compendium-card.ts`, `compendium-art.ts` |
| Encounters and the tracker | `encounters.ts` (the store), `tracker-view.ts`, `hp-pad.ts`, `vitals-ui.ts`, `record-modal.ts` (quick look), `encounter-block.ts`, `battle-notes.ts` (players), `builder-modal.ts`, `balance-ui.ts`, `count-modal.ts`, `saved-fight.ts` |
| Characters | `character-def.ts` (frontmatter in, edits out; pure), `character-sheet.ts` (```nimble-sheet), `character-view.ts`, `character-modals.ts`, `level-up.ts`, `level-plan.ts`, `roll-dialog.ts`, `character-register.ts` |
| Builders | `entity-builder.ts` (the frame), `entity-monster*.ts`, `entity-homebrew*.ts`, `homebrew-def.ts`, `homebrew-block.ts`, `builder-register.ts` |
| The system | `system.ts` |

## Data

- `scripts/bestiary/` and `scripts/compendium/`: raw per-page extractions from the Nimble books (`raw/`), the extraction brief, and `merge.py`, which writes `data/*.json`.
- Updating from a newer book version: diff the new PDF against what's in `raw/` and patch, rather than re-extracting (ask the maintainer for the source files).
- `data/*.json` is imported directly, not lazily. Nimble is the default, so it's needed at startup anyway.

## Pitfalls

- **Fences and keys are Nimble's forever:** ```nimble, ```nimble-sheet, ```nimble-npc, ```nimble-spell, ```nimble-item, `nimble:` references, `nimble: monster|npc|character|creature` frontmatter. Core reuses some of these names (```nimble-encounter, ```nimble-map, ```nimble-campaign, `nimble: campaign`) for every system; that's historical, and they can't be renamed.
- **`settings` is Nimble's type** (`NimbleStatblocksSettings` in `types.ts`) but holds plugin-wide settings too. Other systems keep their state under `settings.systemData.<id>`.
- **`plugin.encounters`, `plugin.index` and `plugin.hover`'s Nimble helpers are Nimble's.** New core code must not depend on them.
- **The player view** (`role: player`) shows lore cards instead of stat blocks (`plugin.hideStats`). Any new monster UI must respect it.
