# src/systems: game systems, and how to add one

A game system (Nimble, 5e, and next maybe Daggerheart, Call of Cthulhu, Fallout) is a folder here that plugs into core through **the contract**, `contract.ts`. Core never imports a system; systems never import each other (eslint enforces both). `registry.ts` maps a campaign's `system:` property (and aliases, case-insensitive) to a system and resolves its `edition:`.

Where the engines came from, and what's still each system's own: [prototypes/SYSTEMLESS.md](../../prototypes/SYSTEMLESS.md). When an engine exists, use it; don't build a private copy in your system.

## The contract today

| Member | What it does | Nimble | 5e |
|---|---|---|---|
| `id`, `name`, `aliases`, `editions` | How campaigns name it (`system: 5e`, `edition: 2014`) | ✓ | ✓ |
| `attribution` | Licence line and where to buy; shown in settings | ✓ | ✓ |
| `conditions(edition)` | The rules' conditions | ✓ | ✓ |
| `quickLook` | A note in a modal (an NPC from a link) | ✓ | ✓ |
| `characters` | `promptNew`, `createFromPartyMember`, `partyMember` (the encounter party reads sheets) | ✓ | ✓ |
| `register(plugin)` | Wire in its blocks, references, indexes, views, suggest, at load | ✓ (`nimble/register.ts`) | ✓ |
| `encounterBlock` | Draw ```nimble-encounter in its campaigns (difficulty, Run) | ✓ | ✓ |
| `openTracker`, `openCompendium` | Its tracker and compendium (Open… commands, ribbon) | (default) | ✓ |
| `slashCommands(plugin)` | Its "/" commands, added to core's (`core/slash.ts`). One with a base command's name or alias replaces it (5e's `/roll` adds advantage). Name shared commands as SLASH_ORDER does (`monster`, `spell`, `item`, `encounter`, `add`, `statblock`) so they sit in the same place in every game's menu. Look up runtime state when a command runs, not when the list is made | ✓ | ✓ |
| `noteKinds` | What it adds to the shared note kinds: `npc`, `location`, `quest`, `map`. `fields` are properties new notes get and the card shows as stats (keys lowercase, not core's own; `gmOnly` keeps them out of players' notes). `card(el, ctx)` draws more below core's card; with `replace: true` it draws the whole card. Keep it light: most kinds need no drawing of their own | – | ✓ (NPC: AC, HP, CR, `statblock`, Add to fight) |
| `content` | What it takes in content packs: `{ kinds }`, each a `KindSpec` of fields (`core/content/spec.ts`). Core reads and checks the packs; the system asks `plugin.content.enabled(id, path)` for the ones a campaign uses and puts them between the vault's notes and what it ships. Publish the JSON Schema (`packSchema`) and an example pack, and test both the way `tests/content-packs.test.ts` does | – | ✓ |
| `vocabulary` | Words core shows for the system's ideas: `defense` ("DEF", "AC") | ✓ | ✓ |

Missing optional members fall back to Nimble's behaviour or a "not yet" notice. Add members from **real call sites**: when core or `src/app` needs to ask a system something, add it here, document it in the table above, implement it in every system, and extend the conformance suite in `tests/systems.test.ts`.

## Engines a system uses (not contract members)

- **Compendium** (`core/compendium/`). Give your entries the `CompendiumEntry` shape (id, kind, tabs, facets, numbers, flags, text), describe your words in a `QuerySchema` (tabs, facets, sorts per tab, kind names) and bind them with `createCompendiumQuery`. Your Compendium tab and pickers are core's `CompendiumBrowser` with a `CompendiumSource` (entries, a row's badge, pills and tags, the page). See `dnd5e/compendium-entries.ts` and `dnd5e/compendium-view.ts` for the whole thing in about 400 lines. Test your facets the way `tests/dnd5e-compendium-search.test.ts` does.

- **Builder** (`core/builder/`). Register each kind you can build with `registerKind('<your id>', kind, { label, icon }, factory)` when your system loads. The easy way is a schema (`schemaKind`, see `dnd5e/builders.ts`): steps of fields that read and write a draft, formulas as hints, a preview, and an output block. Write the formulas in a pure module (`dnd5e/builder-model.ts`) and test every permutation the way `tests/dnd5e-builders.test.ts` does: every option of every field, both ways through your parser, and every bundled entry through the builder and back. New monster…, New spell…, New item… and `/new-<kind>` find your kinds by themselves.

- **Character wizards.** Use the builder: register `character` and `level-up` kinds with `hidden: true`, open them from `characters.promptNew` and your sheet's Level up (`openBuilder` with `apply` to write the sheet's properties). See `dnd5e/character-wizard.ts`, and test every class × origin × level the way `tests/dnd5e-character-wizard.test.ts` does.

- **Tracker.** Your tracker is your own (turn order, rounds, what HP means), registered as a view and opened by `openTracker`. Take HP input with `parseHpCommand` (`core/tracker/hp.ts`) and give HP the shared keypad (`openHpPad`), so damage is typed the same way in every game.

## Adding a game system: checklist

**1. Research before code.** Write the answers in a spec under `prototypes/`:
- **Licence:** what text may ship (an SRD, a community licence, a creator's permission), the exact attribution, trademark rules (5e content is "5e compatible", never branded "D&D"). Anything else must come from the user.
- **Mechanics:** fill in the table in SYSTEMLESS.md.
  - **Dice:** roll-over or roll-under, success levels, pools.
  - **Turns:** initiative, sides, DEX order, or spotlight.
  - **Tracks:** HP, Stress, Sanity, Wounds…
  - **Editions** and how they differ.
- **Content kinds:** monsters or adversaries, spells, items, classes, ancestries… with their fields.

**2. The folder.**
```
src/systems/<id>/
  system.ts        the GameSystem object (thin: each member calls a module below)
  AGENTS.md        this system's guide (copy the shape of dnd5e/AGENTS.md)
  types.ts         its data types (pure)
  rules.ts         its rules (pure, unit-tested)
  parser.ts        its note formats (pure, round-trip tested)
  runtime.ts       state created by register(): indexes, stores, views
  data/            shipped content (JSON), built by scripts/<id>/
```
Add the system to `SHIPPED_SYSTEMS` in `src/app/systems.ts`. The lint rules pick the folder up on their own, and the conformance suite runs against it.

**3. Names that never clash.** Every name the system adds must be unique to it:
- **Fences:** ```` ```<id> ````, ```` ```<id>-sheet ````.
- **Reference prefix:** `<id>:Name`, a provider for `plugin.inlineRefs`.
- **View types:** `nimble-<id>-tracker`, `nimble-<id>-compendium`.
- **CSS:** a namespace (`.dnd5e-*`).
- **Saved state:** `settings.systemData.<id>`, read defensively (anything may be missing or old).

**4. Data.**
- `scripts/<id>/fetch.sh` downloads sources pinned to a commit or version. Downloads are data only: read them, never run them.
- `scripts/<id>/build.py` (run with `python3 -I`) writes compact JSON to `src/systems/<id>/data/`.
- Import big files with `?gz` (`import load from './data/x.json?gz'`, then `load()`). They ship compressed and are inflated on first use (scripts/gz-data.mjs). Small files can be imported directly.

**5. Reuse core.**
- `BlockIndex` for blocks across the vault.
- `inlineRefs` and `hover.attach` for references and cards.
- `openNoteQuickLook`, `appendRichText`, `wireWikiLinks`.
- `rankByName` (core/spotlight-def) for search.
- `parseEncounterBlock` for encounters.
- `plugin.rollDice(expression, label)` for any roll, so it gets the 3D dice and the roll log.
- `plugin.canSee` to keep campaigns' content apart.
- `plugin.hideStats` for player campaigns.

**6. Hook into the app layer where the user expects it.** Find the right place, don't add parallel commands:
- **Spotlight** (`app/spotlight.ts`): a system branch, like `dnd5eSuggestions`.
- **Encounter blocks:** through the contract.
- **Open tracker, Open compendium, New character, Open my character:** through the contract and plugin methods.

**7. Tests.**
- Unit-test every pure module: rules (with the book's own worked examples), the parser (**round-trip every shipped entry**: write it as a note and read it back), combat state, the character sheet.
- The conformance suite runs automatically.
- e2e: one test per feature in `e2e/run.mjs`. Create a campaign with `system: '<id>'`, drive the real UI, and clean up in `finally`. Keep a screenshot (`ARTIFACTS`) of each new view and look at it.

**8. Docs.**
- `docs/<id>.md` (user guide, linked from docs/README.md).
- CHANGELOG `## [Unreleased]`.
- NOTICE.md (licence and sources).
- The attribution shows in settings automatically.

## Pitfalls we've hit

- **Startup order:** campaigns are indexed after layout ready, so `plugin.system(path)` is the default until then. Blocks that depend on the system or edition must redraw on `campaigns.on('changed')` (see `app/encounter-blocks.ts` and the ```5e processor in dnd5e/runtime.ts).
- **Unit tests run against `tests/obsidian-stub.ts`**, which has empty stand-ins for Obsidian classes. If loading your system throws "Class extends value undefined", add the class there.
- **Book data has typos and variants:** "Half-Plate Armor" against "Half Plate Armor", edition-specific casing, list fields as arrays in one edition and strings in another. Match names ignoring case and punctuation; normalise in `build.py`, not at runtime.
- **YAML numbers:** `edition: 2024` arrives as a number.
- **e2e specifics:**
  - Spotlight reopens when you Escape out of a quick look opened from it (press Escape twice and wait for no modal).
  - Several open editors exist: scope selectors to `.workspace-leaf.mod-active`.
  - CSS `text-transform` changes `innerText`, so match case-insensitively.
  - Tooltips move `title` to `aria-label`.
- **Don't give core a system's vocabulary.** "Armor", "Wounds", "AC", "CR" belong in systems. Core's words are "conditions", "party member", "difficulty".
- **Two systems in one vault:** a GM may run Nimble and 5e side by side. Test that your references and blocks don't take over another system's campaigns (`plugin.system(path)` decides; a ```<id> block is always yours).
