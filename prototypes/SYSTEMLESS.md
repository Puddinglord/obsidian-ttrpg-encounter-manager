# A systemless base: engines in core, games as plug-ins (issue #23, part 2)

[MULTI-SYSTEM.md](MULTI-SYSTEM.md) split Nimble out and added 5e. This is the next step: **every feature that differs by game becomes an engine in core that a game system feeds**, so adding Daggerheart, Call of Cthulhu or Fallout means writing a system, not touching core. Content a system can't ship (anything outside an SRD) comes in from the user: imported files, or built in the app.

## Words

- **Game system:** Nimble, 5e, Daggerheart… (`src/systems/<id>/`).
- **Engine:** a part of the plugin that works for any game (`src/core/`): slash commands, the compendium, the entity builder, the character wizard, the tracker, dice, content import.
- **Content:** a game's monsters, spells, classes… Shipped with the plugin (SRD), imported (a content pack), or written (a note or the builder).

## What's an engine today, and what isn't

| Feature | Today | Target |
|---|---|---|
| Campaigns, maps, quests, boxes, NPCs, links | Engine (core) | Same |
| Inline references (`prefix:Name`), hover cards, block index | Engine (core) | Same |
| Encounter blocks, Open tracker, Open compendium, New character | Dispatched to the system | Same, with shared engines underneath |
| **Slash commands** | `app/slash.ts`, all Nimble's | **Engine:** core registry. Base commands (`/npc`, `/quest`, `/hook`, `/box`, `/roll`…) plus commands each system adds (`/monster`, `/spell`, `/item`, `/condition`, `/encounter`, `/new-monster`) |
| **Compendium** | Nimble: a full browser (typed filters, sorts, art). 5e: a simple view | **Engine:** one browser (Nimble's, made generic). The system gives kinds, facets, sorts and cards |
| **Entity builder** | Nimble only (monster, spell, item), with Nimble's math | **Engine:** a frame that builds forms from a **schema**. The system defines entity kinds, fields, formulas and checks |
| **Character wizard** | Nimble: new character and level up. 5e: one dialog, level up is +HP | **Engine:** a stepped wizard. The system defines the steps (choices drawn from its compendium), and level-up steps per level |
| **Tracker** | Nimble's (sides, Wounds, minions). 5e's (initiative, death saves) | **Engine:** a turn model and resource tracks. Systems pick a turn model and define their tracks |
| **Dice** | Core rolls and 3D. Nimble's attack rule is Nimble's | **Engine:** core rolls. Each system defines **roll types** (5e d20+mod with advantage, CoC d100 roll-under with success levels, Daggerheart Hope/Fear 2d12, 2d20 pools) and how a result reads |
| **Content import** | None (5e and Nimble notes only) | **Engine:** content packs (JSON) and importers per system (D&D Beyond character, Fantasy Statblocks) |

## Schemas: how a system describes its content

The schema is the heart of this. One description of an entity kind feeds the builder (form), the importer (validation), the compendium (facets, sorts) and the default card (layout). A system can still draw its own card or stat block.

```ts
interface EntityKind {
  id: string;                 // 'monster', 'spell', 'item', 'class', 'adversary', 'investigator'
  label: string;              // 'Monster'
  fields: FieldDef[];
  /** Fill in what the user left blank (Nimble's "follows the level", 5e's XP from CR). */
  derive?(draft: Draft): Draft;
  /** Plain-language checks for the builder's review ("plays like level 4"). */
  check?(draft: Draft): Finding[];
  /** The note format: to and from text (```5e, ```nimble). */
  toSource(entity): string;
  parse(source: string): Entity | null;
  render?(el, entity, ctx): void;   // custom card/stat block; otherwise the default card
  facets?: FacetDef[];              // compendium filters ("cr", "school", "level")
  sorts?: SortDef[];
}

type FieldDef =
  | { key; label; type: 'text' | 'longtext' | 'number' | 'dice' | 'boolean'; default?; group? }
  | { key; label; type: 'enum'; options: string[] | (() => string[]) }
  | { key; label; type: 'ref'; kind: string }        // pick from the compendium (a class's subclasses)
  | { key; label; type: 'list'; of: FieldDef[] }     // attacks, traits, spells
  | { key; label; type: 'abilities'; keys: string[] } // STR…CHA, or CoC's characteristics
  | { key; label; type: 'formula'; compute(draft) }  // shown, not typed: AC from armor, XP from CR
```

5e's `monster` has `ac`, `cr` and `legendaryActions`; Nimble's has `armor`, `level` and `lastStand`. The builder doesn't care: it draws what the schema lists, groups it into steps, and calls `derive` and `check`.

## Content packs: content we can't ship

A content pack is a JSON file of entries for one system, checked against that system's schemas:

```json
{
  "pack": "My homebrew",
  "system": "5e",
  "edition": "2024",
  "version": 1,
  "entries": [
    { "kind": "subclass", "name": "Path of the Storm", "class": "Barbarian", "features": [ … ] },
    { "kind": "monster", "name": "Mire Hag", … }
  ]
}
```

- **Where packs live:** files in a vault folder (default `Ember Vault/Content/`), so they sync with the vault and the plugin never hosts them. **Import content…** copies a file there and reports what was accepted or rejected, with plain-language reasons.
- **Precedence:** a note in your vault, then a pack, then the shipped SRD. That's the same rule as today: your note replaces the book's.
- **Per-campaign switch:** a campaign can turn packs on or off (`packs:` on its home note), so homebrew from one table stays out of another.
- **Formats a system can read besides its own:**
  - 5e: 5e-bits API JSON (what the SRD ships as); Fantasy Statblocks YAML (open question 2 in MULTI-SYSTEM.md); a D&D Beyond character (below).
  - Anything else is the system's own `importers` list.

**D&D Beyond characters.** A D&D Beyond character can be read as JSON (its sharing page, or tools that export it). The importer turns it into a 5e character note: abilities, class levels, HP, skills, inventory and spells by name. Names that match the SRD or a pack resolve; anything else becomes a plain feature with its text. Copyrighted book text is never fetched or stored by the plugin: it reads only what the user hands it.

**Docs:** a "Making content" guide per system, with example packs (a subclass, a monster, a spell, a class), the JSON schema files (generated from the TypeScript schemas, so they can't drift), and how to validate a pack. The examples are original, so we can publish them.

## The contract, v2

The v1 contract (characters, quickLook, register, encounterBlock, openTracker, openCompendium) stays. v2 adds the engine inputs:

```ts
interface GameSystem {
  // … v1 …
  entities: EntityKind[];                  // schemas: builder, importer, compendium, cards
  content: ContentSource[];                // shipped SRD (lazy) + packs, merged by the engine
  slash?: SlashCommandDef[];               // added to the base commands
  rolls?: RollType[];                      // d20 test, d100 skill, duality, pool…
  combat?: { turns: TurnModel; tracks: TrackDef[] };  // initiative | sides | dex-order | spotlight; HP, Stress, Sanity…
  character?: { wizard: WizardStep[]; levelUp?: (level) => WizardStep[]; sheet: SheetRenderer };
  importers?: Importer[];                  // 'D&D Beyond character', 'Fantasy Statblocks'
}
```

Each member stays optional: a system ships what it has, and core hides what it doesn't.

## What future games need from the engines

| Game | Dice | Turns | Tracks | Licence (check before shipping) |
|---|---|---|---|---|
| 5e | d20 + mod, advantage | Initiative | HP, temp HP, death saves | SRD 5.1 / 5.2, CC-BY-4.0 |
| Nimble | Primary die, crits explode | Sides (heroes, then monsters) | HP, Wounds, mana | Creator's permission |
| Daggerheart | 2d12 Hope/Fear, + modifiers | Spotlight (no initiative) | HP thresholds, Stress, Hope, Armor slots, Fear (GM) | SRD under the Darrington Press CGL |
| Call of Cthulhu / RuneQuest (BRP) | d100 roll-under: regular, hard, extreme; bonus and penalty dice | DEX order | HP, Sanity, Luck, MP | Chaosium's BRP SRD (its own licence; a newer ORC edition is reported but unconfirmed). The Mythos and trademarks are excluded either way |
| Mörk Borg | d20 vs DR | Initiative by side (d6) | HP, Omens | Third-party licence; no SRD text to bundle |
| Fallout 2d20 | 2d20 pool, Action Points, Momentum | Initiative | HP, Rads, Luck | Unknown: needs checking; likely import-only |

The engines are built to cover this table: roll types are data plus a small function, turn models are four, and tracks are a list.

## Bundle and loading, honestly

- **Always downloaded:** Obsidian installs `main.js` and `styles.css`, nothing else, so all system code and CSS are always downloaded. Running JavaScript from data is off the table: Obsidian's review rejects `eval`.
- **Lazy:**
  - **Data** (the big part): it ships compressed and is inflated on first use.
  - **Registration:** a system's setup runs only when a campaign of that system exists. Cheap hooks run at load; indexes and views are built on first use.
- **Why that's fine:** code is small, and data is most of the size. With five systems the plan is roughly 3.5–4 MB of `main.js`. Each system's CSS is namespaced (`.dnd5e-*`, `.dh-*`), so it costs nothing when unused.

## Phases

Each phase ends green (unit, lint, the full e2e suite) and is one commit.

1. **Agent guides.** `AGENTS.md` at the root, plus `src/core/AGENTS.md`, `src/systems/AGENTS.md` (how to add a system) and one per system. Also re-pin the SRD to `5e-bits/5e-srd-api`.
2. **Slash commands engine.** A core registry; base commands; Nimble's commands move into Nimble; 5e adds `/monster`, `/spell`, `/item`, `/condition`, `/encounter`, `/roll`.
3. **Compendium engine.** Nimble's browser becomes the shared engine (typed filters, sorts, art, segments from the system); 5e moves onto it, and its simple view goes.
4. **Schemas and the entity builder engine.** `EntityKind` and `FieldDef`; the builder frame draws from schemas; Nimble's builders port onto it (the e2e suite is the safety net); 5e gets monster, spell and item builders.
5. **Content packs.** Loader, validator and precedence; **Import content…**; per-campaign packs; JSON schema files generated from the TypeScript; the "Making content" guide with example packs.
6. **Character wizard engine.** Stepped wizard and level-up steps; Nimble's new character and level up port onto it; 5e gets a full wizard (class, species, background, ability scores with each edition's bonuses, skills, equipment, spells) and a level-up wizard (subclass, ASI or feat, new spells).
7. **Importers.** D&D Beyond character to a 5e note; Fantasy Statblocks to ```5e.
8. **Roll types and the tracker engine.** Roll types per system; turn models and tracks; both trackers become one engine. Do this last, because it's the most visible change to Nimble's table play.
9. **Pilot a third system** (Daggerheart is the best candidate: an SRD, and a different engine on every axis). It proves the guides. Anything the pilot needs that core can't give goes back into the engines, not into the system.

## As built

**Phase 2, slash commands.** `src/core/slash.ts` is the engine: the menu, matching, the GM/player split, writing text and blocks, and the commands every game shares (`/npc`, `/quest`, `/npc-card`, the box presets with `/hook`, `/box`, `/map`, `/roll`, `/condition` from the note's system, `/party`, `/tracker`, `/bestiary`, `/settings`, `/party-table` headed by the system's `vocabulary.defense`). A system adds commands with `slashCommands(plugin)`; one with a base command's name or alias replaces it. `SLASH_ORDER` keeps the bare menu in the old order whichever system defined a command. Nimble's commands moved to `nimble/slash.ts` unchanged. 5e's are in `dnd5e/slash.ts`: the compendium kinds write `5e:<kind>:Name`, `/encounter` rates by the edition, `/add` fills the 5e tracker, `/roll +5` offers advantage and disadvantage (through the plugin's `rollWithEdge`, which still imports Nimble's roll maths: phase 8). 5e has no `/builder`, `/new-monster`, `/legendary` or `/summary` yet (phase 4 and 8).

## Decisions to make

1. **Ship order.** Merge what's on the branch now (Nimble + 5e, 7 commits) as one PR first, then do this as the next PR. Or keep going on this branch.
2. **Content packs: format.** JSON files in a vault folder, as above. Or notes with fenced JSON. Files are easier to share and validate; notes are easier to read in Obsidian.
3. **D&D Beyond import: how the data arrives.** The user pastes or uploads the character JSON. Or the plugin fetches it from a shared link (a network call to D&D Beyond's unofficial endpoint, which has to be disclosed in the README and could break any time).
4. **Port Nimble's builders and wizards onto the engines, or leave them and only build new systems on the engines.** Porting is more work and more risk now; skipping means two of everything for as long as Nimble stays separate.
