# 5e

The second game system, and the template for adding more. One system, two **editions**: `2024` (SRD 5.2, the default) and `2014` (SRD 5.1). A campaign says `system: 5e` and `edition: 2024|2014`. They share almost all code; where the rules differ, the code branches on `edition` (encounter difficulty, long rests, stat block layout, wording such as "Race" and "Species").

**Only SRD content ships** (CC-BY-4.0, attribution in `attribution.ts`, NOTICE.md and settings). Never add text from outside the SRD: no other subclasses, setting monsters or book art. Users bring the rest. Call it "5e", never "D&D".

## Map

| Area | Modules |
|---|---|
| The system | `system.ts` (contract members), `runtime.ts` (made by `register()`: the ```5e and ```5e-sheet processors, `5e:` references, hover cards, quick look, Copy to vault, the index, views), `editions.ts`, `attribution.ts` |
| Rules (pure, tested) | `rules.ts` (modifiers, CR/XP/PB, encounter difficulty: 2014 thresholds × multiplier, 2024 XP budget), `combat.ts` (initiative, turns, temp HP, death saves, legendary actions, conditions), `character.ts` (the sheet from frontmatter, and every edit) |
| Monsters | `types.ts` (`Dnd5eMonster`), `parser.ts` (```5e blocks: forgiving field names, `- Name: text` lists, `toStatblockSource5e`), `render.ts` (both layouts), `bestiary.ts`, `monster-index.ts` (vault blocks through core's `BlockIndex`, then this edition's SRD monsters, then the other edition's) |
| Compendium | `compendium.ts` (types, `allHits`, `findHit`, the `5e:<kind>:Name` kinds), `compendium-entries.ts` (entries, facets and sorts for core's compendium engine; the facets read both editions the same way), `cards.ts`, `compendium-view.ts` (core's browser with an edition switch) |
| Encounters | `encounter-block.ts`, `combat-store.ts` (saved under `settings.systemData.dnd5e.fight`), `tracker-view.ts` |
| Characters | `character.ts` (the sheet from frontmatter, and every edit), `sheet.ts`, `character-draft.ts` (pure: the wizards' rules: skill choices, bonuses, point buy, subclass and increase levels, spells, level up), `character-wizard.ts` (New character and Level up as hidden kinds in core's builder), `new-character.ts` (writing a note for a hand-typed party member) |
| Builders | `builder-model.ts` (pure: the monster draft and its formulas: HP from hit dice and Con, PB and XP from CR, saves, skills, passive Perception, attacks in each edition's words), `builders.ts` (monster, spell and magic item schemas for core's builder), `homebrew.ts` (pure: the ```5e-spell and ```5e-item formats), `homebrew-index.ts` (your spells and items, before the SRD's) |
| Content packs | `content.ts` (pure: the kinds 5e takes, `content5e` and `mergeCompendium5e`); `compendium.ts` and `monster-index.ts` read the layer the runtime sets (`setContentLayer5e`) from the active campaign's packs. The schema is `docs/content/5e.schema.json` (UPDATE_SCHEMAS=1 on the content-packs test writes it) |
| NPCs | `npc.ts` (the NPC fields 5e adds to core's NPC notes: `ac`, `hp`, `cr`, `statblock`; the NPC as a monster for the tracker), `npc-card.ts` (the stat block reference and Add to fight in the NPC card) |
| Editor | `suggest.ts` (`5e:` autocomplete), `slash.ts` ("/" commands: `/monster`, `/spell` and the other compendium kinds, `/encounter`, `/add`, `/statblock`, `/fought`, `/roll` with advantage) |
| Data | `conditions.ts`, `data/*.json` |

## Data

- `scripts/dnd5e/fetch.sh <dir>` downloads the SRD JSON from 5e-bits/5e-srd-api (packages/5e-database; the old 5e-database repo is archived) pinned to one commit. `python3 -I scripts/dnd5e/build.py <dir>` writes `data/conditions.json`, `monsters-<ed>.json` and `compendium-<ed>.json`.
- Monsters and the compendium are imported with `?gz` (lazy). Conditions are imported directly.
- What `build.py` fixes up:
  - It adds usage to names ("(Recharge 5–6)", "(3/Day, or 4/Day in Lair)").
  - It rebuilds 2024 spell lists, which the data keeps out of the text ("At Will: …", "(level 2 version)").
  - It writes the legendary actions' opening line, which the data leaves out.
  - It normalises line ends.
- Refreshing the data:
  1. Bump the pin in `fetch.sh` and fetch into an empty directory.
  2. Rebuild.
  3. Run `tests/dnd5e-parser.test.ts`. It round-trips every monster, so a schema change shows up there.
  4. Run `tests/dnd5e-compendium.test.ts`.
  5. Skim the diff of `data/`.

## Pitfalls

- **Book layouts differ by edition.** 2024 stat blocks combine Immunities (damage; conditions), show Initiative and MOD/SAVE, and write "Attack Roll: +4". 2014 writes "+4 to hit" and lists Saving Throws. `render.ts` handles both; the attack-bonus regex covers both wordings.
- **Names drift between editions** ("Goblin" in 2014, "Goblin Warrior" in 2024; "Half-Plate Armor"). Lookups fall back to the other edition, and sheet lookups ignore punctuation.
- **The tracker's turn model is initiative** (`combat.ts`), unlike Nimble's sides. Monsters at 0 HP are skipped; heroes at 0 make death saves.
- **Edition at render time:** `runtime.edition(path)` is 2024 until campaigns are indexed; the ```5e processor redraws when that changes.
- **What 5e doesn't have yet** (see MULTI-SYSTEM.md, "Known gaps"):
  - multiclassing;
  These are planned as shared engines in SYSTEMLESS.md, not 5e-only code.
