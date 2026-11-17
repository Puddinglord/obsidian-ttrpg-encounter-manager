# Multi-system: design (issue #23)

Ember Vault runs more than Nimble. A campaign says which game it uses, and everything system-specific (monsters, sheets, spells, items, conditions, combat rules, dice rules) comes from that system's module. Everything else (campaigns, chapters, scenes, NPCs, locations, quests, maps, boxes, links, Spotlight, 3D dice) is shared and doesn't care which game you play.

First new system: **5e**, both editions (2014 / SRD 5.1 and 2024 / SRD 5.2).

## 1. One plugin or many?

**One plugin, many systems.** Separate plugins sound cleaner, but they would:

- Duplicate the shared 60% of the plugin into every install. A GM running a Nimble game and a 5e game in one vault would have two plugins fighting over the same fences (`box`, `nimble-map`), Cmd/Ctrl+K, ribbons and campaign folders.
- Need a monorepo plus a published shared package, and each plugin goes through Obsidian's community review on its own. Obsidian has no plugin dependencies, so nothing guarantees matching versions.
- Still not stop breakage: a change to the shared package breaks every system plugin just the same, only later and in a different repo.

The isolation you want comes from **module boundaries the build enforces**, not from separate downloads. See section 5.

The same contract later becomes the public API for outside system plugins (section 7), so this choice doesn't block that.

## 2. What the code looks like today

About 22k lines in `src/`. Campaigns, maps, quests, boxes and NPC links are already generic. The Nimble coupling sits in a few places:

| Area | Files | Coupling |
|---|---|---|
| Rules | `rules.ts` (imported by **20 files**) | Armor reduction, Wounds, minions, Last Stand, side initiative, difficulty budget, tougher/weaker. The main hot spot. |
| Monsters | `types.ts` (`NimbleMonster`), `parser.ts`, `render.ts`, `bestiary.ts`, `data/bestiary.json` | Fully Nimble. |
| Combat | `encounters.ts`, `tracker-view.ts` (906 lines) | Generic state mixed with Nimble rules. `EncounterCreature.monster` is a `NimbleMonster`, and it's saved in `data.json`. The turn model is Nimble's: heroes phase, then monsters phase. 5e uses an initiative order. |
| Characters | `character-def.ts`, `character-sheet.ts`, `level-up.ts`, `level-plan.ts`, `resource-def.ts`, `character-modals.ts` (~4.5k lines) | Fully Nimble (4 stats, class dice, Wounds). Only the patterns carry over: frontmatter as data, roll dialog, pips. |
| Compendium | `compendium.ts`, `compendium-card.ts`, `data/compendium.json` | Nimble data and cards. `compendium-browser.ts`, `compendium-query.ts` and `filter-field.ts` are a generic shell with Nimble facets wired in. |
| Hybrid UI | `spotlight.ts`, `slash.ts`, `inline-ref.ts`, `suggest.ts`, `settings-tab.ts`, `encounter-block.ts`, `builder-modal.ts` | Generic shells that call Nimble functions directly. |
| Settings | `NimbleStatblocksSettings` | `autoArmor`, `minionOverkill`, `nimbleAttackRolls`, `classDice`, `compendiumDrafts` are Nimble settings sitting at the top level. |

Two things work in our favour:

- `campaign-model.ts:321` already reads `system:` from the campaign home note, and nothing uses it yet. That's where the hook goes.
- The rule that pure modules never import `obsidian` means most rules code is already testable on its own and can move as-is.

## 3. Layout

```
src/
  core/                 shared: campaigns, maps, quests, boxes, links, dice engine, 3D dice,
                        Spotlight shell, compendium browser shell, tracker shell, popovers
  systems/
    contract.ts         the GameSystem interface (the only thing core knows about systems)
    registry.ts         registerSystem(), systemFor(path), the default system
    nimble/             everything Nimble that exists today, moved here
    dnd5e/
      shared/           ability scores, proficiency, AC, CR/XP, initiative, death saves, spell slots
      2014/             SRD 5.1 data + its rule differences
      2024/             SRD 5.2 data + its rule differences
```

2014 and 2024 are **editions of one system**, not two systems. They share about 80% of the rules, and 2024 tables mix in 2014 monsters all the time.

## 4. The contract

A system fills in the capabilities it supports. Each slot is optional, so a system can ship in pieces (monsters first, sheets later) and core hides what's missing.

```ts
interface GameSystem {
  id: string;                    // 'nimble', 'dnd5e'
  name: string;
  editions?: { id: string; name: string }[];   // dnd5e: 2014, 2024
  attribution: AttributionInfo;  // license text + buy/source link, shown wherever its content is

  monsters?: {
    fences: string[];            // 'nimble' | '5e'
    parse(source: string): Creature;
    render(c: Creature, el: HTMLElement, ctx: RenderCtx): void;
    bundled(edition?: string): Promise<Creature[]>;
    facets: FacetDef[];          // Nimble: level, role, armor. 5e: CR, type, size
    rate?(groups, party): EncounterRating;       // Nimble budget vs 5e XP thresholds
    scale?(c: Creature, shift: number): Creature;
  };
  combat?: {
    turns: 'sides' | 'initiative';               // core implements both; the system picks
    damage(target, amount, opts): HpResult;      // armor reduction vs flat, resist/vuln
    heroDown: 'wounds' | 'death-saves';
    conditions: ConditionDef[];
    thresholds?(c): Threshold[];                 // Bloodied, Last Stand
    controls?: CreatureControls;                 // minion groups, legendary actions
  };
  characters?: { fences: string[]; read(fm): Sheet; render(...); newCharacter(...); levelUp?(...); partyMember(fm): PartyMember };
  compendium?: { kinds: KindDef[]; data(edition?): Promise<CompendiumData>; card(entry, el): void };
  dice?: { attackRoll?: RollRule; advantage: 'single' | 'stacked' };
  refPrefix: string;             // 'nimble:' | '5e:'
  templates?: NoteTemplates;     // monster note, character note
  settings?: SettingsSection;    // autoArmor etc. move under Nimble here
}
```

Core stores creatures as `{ system, data }` and reads them only through the system. Combatants keep a generic part (id, label, HP, temp HP, conditions, done, note, side) plus a `sys` bag the system owns (Wounds, Last Stand, minion count / death saves, initiative, legendary actions).

**Which system applies:** the campaign home's `system:` (plus `edition:` for 5e). Notes outside any campaign use a "Default system" setting, which is Nimble so existing vaults change nothing. An encounter block can override with a `system:` line.

## 5. Keeping systems from breaking each other

1. **Import boundaries in ESLint** (`no-restricted-imports` per folder, so `npm run lint` fails):
   - `core/**` may import only `systems/contract` and `systems/registry`, never a system.
   - `systems/X/**` may import `core/**` and the contract, never `systems/Y/**`.
   - `systems/dnd5e/2014` and `2024` import `dnd5e/shared`, never each other.
2. **Conformance suite.** One shared test file runs against every registered system: parse and render its fixtures, rate an encounter, apply damage, run a round, read a sheet. A core change that breaks any system's contract fails here first.
3. **Per-system tests and e2e fixtures.** `tests/systems/<id>/`, and the e2e vault gets one campaign per system. `node e2e/run.mjs dnd5e` runs just one.
4. **No hidden shared state.** Each system's settings live under `settings.systems[id]`, so one system can't read or change another's.

With this in place, a 5e change can only break Nimble by changing core or the contract, and both are covered by the conformance suite.

## 6. Things that can't change

- The plugin id stays `nimble-gm` (Obsidian ids are permanent). The display name is already "Ember Vault". Only the manifest description needs rewording.
- Every existing format keeps working forever: ` ```nimble `, `nimble-sheet`, `nimble-npc`, `nimble-encounter`, `nimble-map`, `nimble-campaign`, `nimble:` refs, `nimble: creature` frontmatter, the `nimble-bestiary` view type.
- Saved encounters in `data.json` embed `NimbleMonster`. A one-time migration wraps them as `{ system: 'nimble', data }`, like the existing `migrateDice`.
- Generic blocks get neutral aliases (for example `ev-encounter`, `ev-map`). Bare `encounter` or `statblock` would collide with other plugins, like Fantasy Statblocks.

## 7. Outside system plugins (later, not now)

Obsidian plugins can reach each other at runtime (`app.plugins.getPlugin('nimble-gm').api`), the way Dataview's API works. Once the contract is stable, `api.registerSystem(system)` lets a separate plugin add a game. Because Nimble and 5e would be built against the same contract, the API gets tested by real use before anyone outside depends on it. Don't promise it publicly until two in-house systems have used it without changes.

## 8. 5e specifics

**Content and licensing**
- SRD 5.1 (2014) and SRD 5.2 (2024) are both under CC-BY-4.0. We may bundle their text with the required attribution line. That covers roughly 300+ monsters each, the core spells, magic items, and the 12 classes with one subclass each. 2024 adds 4 backgrounds and species.
- Nothing outside the SRD (Beholder, Mind Flayer, other subclasses, setting books). This matches the rule already applied to WotC adventure text.
- Trademark: describe it as "5e compatible (SRD 5.1 / 5.2)". Don't brand anything "D&D".
- Users bring the rest: 5e monster notes in the vault parse like Nimble ones do today. **Reading Fantasy Statblocks' `statblock` YAML** would be a big win, because many Obsidian 5e GMs already have hundreds of those.

**Rule differences 5e needs from core**
| | Nimble | 5e 2014 | 5e 2024 |
|---|---|---|---|
| Turns | Heroes phase, then monsters | Initiative order | Initiative order (in the stat block) |
| Damage | Armor reduces damage | AC is a to-hit number only | same |
| Hero at 0 HP | Wounds | Death saves | Death saves |
| Encounter difficulty | Nimble budget | XP thresholds × count multiplier | XP budget per character, no multiplier |
| Exhaustion | n/a | 6-level table | −2 per level to d20 tests |
| Monster scaling | Tougher/weaker by level | none in RAW (could offer CR shift later) | same |
| Stat block | Nimble layout | Classic layout | Combined ability/save table, initiative, bonus actions |

**Size**
- Obsidian installs only `main.js`, so data is bundled. Today's two JSON files are ~750 KB. Both SRDs add a few MB of JSON. Plan: ship system packs gzip-compressed (`fflate` is already a dependency) and inflate them only when a campaign of that system opens. Nimble-only users pay download size, not startup time.

**The big piece is the 5e character sheet.** Nimble's sheet stack is ~4.5k lines, and 5e's is heavier: 6 abilities, 18 skills, proficiency, spell slots, multiclassing. Little of the Nimble sheet code carries over beyond the shell patterns.

## 9. Phases (one PR, a commit per phase, one big review before merge)

1. **Carve-out, no behaviour change.** Done (2026-11-17), see "Phase 1 as built" below.
2. **System per campaign.** System picker in New campaign, `system:` / `edition:` on the home note, Default system setting, and system-aware Spotlight, compendium tabs, slash commands, refs and tracker.
3. **5e GM side, both editions.** Stat blocks (both layouts), SRD bestiaries, an initiative-order tracker, death saves, conditions, XP rating, Fantasy Statblocks import. The edition differences here are small, so both go together.
4. **5e compendium.** Spells, items, classes, species/races and backgrounds as cards, with `5e:` refs.
5. **5e character sheets.** 2024 (SRD 5.2) first, then 2014.
6. **Later:** public `registerSystem` API.

## Phase 1 as built

The real import graph (after the entity builder landed: 91 files, ~26k lines) changed two things from the plan above.

**Three layers, not two.** Some modules exist to put core and a system together: the settings page, slash commands, Spotlight, and maps that show the current encounter's tokens. Calling those "core" would have meant inventing abstractions before 5e exists to test them. They live in `src/app/` with `main.ts`, and may import anything:

```
src/core/            shared; imports no system and not the app layer      (44 files)
src/systems/         contract.ts, registry.ts                             (core only)
src/systems/nimble/  Nimble; core + the contract, never another system    (57 files)
src/app/             settings-tab, slash, spotlight, map-block, systems   (anything)
```

**Several "core" modules turned out to be Nimble's own, so they moved into `systems/nimble`:**
- The compendium (browser, query language, filter field, pickers, view, art).
- The `nimble:` references (inline refs, Live Preview, autocomplete).
- The tracker family (encounters, tracker view, HP pad, quick look, saved fights).

Phase 3/4 pulls the generic parts back into core when 5e needs them: the compendium search engine is about 70% generic, and Spotlight and slash commands need per-system results. Each extraction is driven by a second real user.

**What Phase 1 did:**
- Moved 117 files with every import rewritten; build, unit and e2e tests unchanged.
- Shared types moved to `core/types.ts`: conditions, party, roll log, `uid`. Nimble's `types.ts` re-exports them.
- `wireWikiLinks` became `core/wiki-links.ts`; Nimble's attack roll (miss on 1, explode) became `systems/nimble/attack-roll.ts`.
- The contract (`GameSystem`) starts with exactly what core calls today: `attribution`, `conditions`, `characters.promptNew` and `characters.createFromPartyMember` (campaign outline), and `quickLook` (NPC links). Nimble implements it in `systems/nimble/system.ts`.
- `SystemRegistry` resolves a campaign's `system:` case-insensitively (new campaigns already write `system: Nimble`), and falls back to the default. `plugin.system(path)` uses the same fallback as `campaigns.role()`: the note's campaign, else the active campaign, else Nimble.
- ESLint `no-restricted-imports` enforces the layers. The rules read `src/systems/` at lint time, so a new system folder is fenced off with no config change. A probe confirmed a core→Nimble import, a core→app import, and a system→system import all fail lint.
- `tests/systems.test.ts`: registry tests, plus a conformance suite that runs `describe.each` over `SHIPPED_SYSTEMS`.

**Not done in Phase 1, on purpose:**
- **No saved-format changes.** There's no `data.json` migration and no `settings.systems[id]` namespace yet. Encounters still embed `NimbleMonster`; they gain a system tag when a second system can be in a fight (Phase 3). Absent always means Nimble, so nothing old ever needs migrating.
- **Core still takes the plugin type** (`import type … from '../../main'`), which exposes Nimble-typed members like `plugin.encounters`. The lint rule covers imports, not this. Phase 3 narrows it as the tracker becomes per-system.

## 10. Feasibility

**Feasible, and the codebase is in good shape for it.** Campaigns, maps and quests need nothing. The real cost is phase 1, which unpicks `rules.ts` from 20 importers and turns the tracker's built-in Nimble phases into a pluggable turn model. Phase 5 (5e sheets) is the biggest new build. Phases 2–4 are mostly data and rendering on top of the contract.

Main risks:
- **Tracker turn model.** Initiative order is a real new mode, not a reskin.
- **Abstracting too early.** Write the contract from what Nimble and 5e actually need, and change it while building 5e. Freeze it only after.
- **Bundle and startup time on phones.** Lazy, compressed packs handle this.
- **Licensing slips.** Keep a data-build script that pulls only from SRD sources, like `scripts/bestiary/`.

## Decisions

- 5e character sheets: 2024 (SRD 5.2) first, then 2014.
- Shipping: one PR with a commit per phase, and one thorough review of the whole thing before merge.
- Plugin id stays `nimble-gm` (it can't change once listed). The display name, description and repo name can change.
- Timing: paused until the entity builder ships, then done as one big push.

## Open questions

1. Neutral aliases for the generic fences: `ev-*`, or keep `nimble-*` as the only names?
2. Fantasy Statblocks YAML import: in phase 3, or later?
