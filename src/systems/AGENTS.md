# src/systems: game systems, and how to add one

A game system (Nimble, 5e, and next maybe Daggerheart, Call of Cthulhu, Fallout) is a folder here that plugs into core through **the contract**, `contract.ts`. Core never imports a system; systems never import each other (eslint enforces both). `registry.ts` maps a campaign's `system:` property (and aliases, case-insensitive) to a system and resolves its `edition:`.

Where the engines came from, and what's still each system's own: [prototypes/SYSTEMLESS.md](../../prototypes/SYSTEMLESS.md). When an engine exists, use it; don't build a private copy in your system.

## The contract today

| Member | What it does | Nimble | 5e |
|---|---|---|---|
| `id`, `name`, `aliases`, `editions` | How campaigns name it (`system: 5e`, `edition: 2014`) | ✓ | ✓ |
| `attribution` | Licence line and where to buy; shown in settings | ✓ | ✓ |
| `conditions(edition)` | The rules' conditions, and other lasting effects the tracker offers. A `ConditionDef` may carry `timing` (rounds, start or end of turn, damage, saves, reminders: `core/tracker/effects.ts`), its default when applied | ✓ | ✓ (2024: Burning, 1d4 Fire at the start of each turn) |
| `quickLook` | A note in a modal (an NPC from a link); returns the modal, so Spotlight can come back on Escape | ✓ | ✓ |
| `characters` | `promptNew`, `createFromPartyMember`, `partyMember` (the encounter party reads sheets) | ✓ | ✓ |
| `register(plugin)` | Wire in its blocks, references, indexes, views, suggest, at load | ✓ (`nimble/register.ts`) | ✓ |
| `encounterBlock` | Draw ```nimble-encounter in its campaigns (difficulty, Run) | ✓ | ✓ |
| `openTracker`, `openCompendium`, `openMyCharacter` | Its tracker, compendium and your character (Open… commands, ribbon) | ✓ | ✓ (character: the note) |
| `slashCommands(plugin)` | Its "/" commands, added to core's (`core/slash.ts`). One with a base command's name or alias replaces it (5e's `/roll` adds advantage). Name shared commands as SLASH_ORDER does (`monster`, `spell`, `item`, `encounter`, `add`, `statblock`) so they sit in the same place in every game's menu. Look up runtime state when a command runs, not when the list is made | ✓ | ✓ |
| `spotlight(plugin)` | Its part of Spotlight (Cmd/Ctrl+K), a `SpotlightSource` (`core/spotlight-source.ts`): `results(q, input)` gives rows (names to rank by, secondary text, an order group: monsters 0, compendium 4; how each draws: icon or badge, title, meta, tag; `open()` for Enter, returning the modal to come back from on Escape; `alt()` for Cmd/Ctrl+Enter, Spotlight kept open). `adding(q)` answers "3 goblin". `filters` gives typed filters with chips: build it with `compendiumFilters({ query, all, entries, row })` from your compendium's bound query. `lookup(query)` opens your compendium for "Search the compendium for …". Spotlight keeps NPCs, notes, conditions, commands and dice itself | ✓ (adds to the encounter) | ✓ (typed filters too) |
| `noteKinds` | What it adds to the shared note kinds: `npc`, `location`, `quest`, `map`, `session`. `fields` are properties new notes get and the card shows as stats (keys lowercase, not core's own for that kind; `gmOnly` keeps them out of players' notes). `card(el, ctx)` draws more in core's card (under an NPC's facts; under a quest's, place's or session's facts); with `replace: true` it draws the whole card. Keep it light: most kinds need no drawing of their own | ✓ (NPC: level, armor, HP, `statblock`, Add to fight; place: `monsters` as references) | ✓ (NPC: AC, HP, CR, `statblock`, Add to fight; place: `read_aloud` box) |
| `content` | What it takes in content packs: `{ kinds }`, each a `KindSpec` of fields (`core/content/spec.ts`). Core reads and checks the packs; the system asks `plugin.content.enabled(id, path)` for the ones a campaign uses and puts them between the vault's notes and what it ships. Publish the JSON Schema (`packSchema`) and an example pack, and test both the way `tests/content-packs.test.ts` does | – | ✓ |
| `vocabulary` | Words core shows for the system's ideas: `defense` ("DEF", "AC") | ✓ | ✓ |
| `ruleTerms(plugin, path)`, `ruleTermPage` | Its rules words for a note's edition (`RuleTerm`: names, tag, text, `prose` when running text marks it too), and the compendium page each opens. Core underlines them (`appendWithTerms`, `markTerm` in `core/rule-term-ui.ts`) in stat blocks, cards and sheets; pass a `TermContext` to your renderers. Every term needs text and a page; test both the way `tests/dnd5e-rule-terms.test.ts` does | ✓ | ✓ |
| `settings` | Its settings fields: defaults and migration (`SettingsPart`, `core/settings.ts`). Declare the fields by augmenting `EmberVaultSettings`; `data.json` stays one flat object, so never rename a field | ✓ | – (keeps state in `systemData.dnd5e`) |
| `settingsSections(plugin)` | Its own settings, above the base plugin's: sections on the settings page after the shared ones (`core/settings-ui.ts`). Mark a section `topic: 'encounter'` and your tracker's **Encounter settings…** (`openGameSettings(plugin, path, 'encounter')`) shows it in a dialog. Keep 5e-style state in `systemData.<id>.options` | ✓ | ✓ |
| `attackRolls(plugin)` | `'exploding'` when an attack's primary die misses on a 1 and explodes on its max; plain otherwise | ✓ (setting) | – |
| `campaignState`, `trackerView` | Its fight belongs to a campaign: `take` returns it (plain JSON) and `put` swaps in another campaign's (undefined: start fresh) and redraws; core calls them when the active campaign changes. `trackerView` is its tracker's view type: an open tracker turns into the campaign's game's tracker (`core/tracker/follow.ts`), and `openTracker` reuses another game's tracker panel (`anyTrackerLeaf`) | ✓ | ✓ |
| `combatTokens(plugin)`, `inCombat(plugin)` | Its running fight as map tokens (`core/tracker/tokens.ts`), and whether one is running (the screen stays on). Trigger `plugin.events` `'combat-changed'` when the fight changes | ✓ | ✓ |

Missing optional members fall back to plain behaviour (plain attack rolls, no tokens, the character note) or a "not yet" notice. Add members from **real call sites**: when core or `src/app` needs to ask a system something, add it here, document it in the table above, implement it in every system, and extend the conformance suite in `tests/systems.test.ts`.

## Each game's look

Every game should feel like its own book, built from the same components. Everything drawn for a game carries `.ev-sys-<id>` (`applyLook(el, id)`, `core/look.ts`). Core stamps the surfaces it draws (the builder, NPC and note cards, note quick looks); stamp your own roots (sheet, tracker, stat blocks, cards, compendium tab, encounter block).

The look itself is a handful of tokens in the GAME LOOKS section at the top of `styles.css`: `--ev-accent` (and `-hover`, `--ev-on-accent`, `--ev-accent-text`), `--ev-tint`, `--ev-paper` and `--ev-paper-edge`, `--ev-ornament`, `--ev-rule` (a thin rule under headings; transparent for none), `--ev-display-font`, `--ev-display-variant`, `--ev-display-weight`, `--ev-heading-weight` (a heading's weight in that type: a serif's bold, not its black). Set them under `.ev-sys-<id>` (and `.theme-dark .ev-sys-<id>`), and add your class to the rule that points Obsidian's accent at yours, so buttons, toggles and links inside your surfaces follow. Your own components read the tokens rather than hard-coding colours, so a theme or a dark mode changes one place. A game that sets nothing follows the user's theme (Nimble does).

Use the shared design language (Nimble's sheet and tracker are the benchmark): cards on the paper colour with one border, a hero header with the portrait, big tappable numbers, HP as a bar with the shared keypad, `renderPipRow` for pips, `pill()` for chips. Make it yours with colour, type and ornament, not with a second copy of a component.

## Engines a system uses (not contract members)

- **Compendium** (`core/compendium/`). Give your entries the `CompendiumEntry` shape (id, kind, tabs, facets, numbers, flags, text), describe your words in a `QuerySchema` (tabs, facets, sorts per tab, kind names) and bind them with `createCompendiumQuery`. Your Compendium tab and pickers are core's `CompendiumBrowser` with a `CompendiumSource` (entries, a row's badge, pills and tags, the page). See `dnd5e/compendium-entries.ts` and `dnd5e/compendium-view.ts` for the whole thing in about 400 lines. Test your facets the way `tests/dnd5e-compendium-search.test.ts` does.

- **Builder** (`core/builder/`). Register each kind you can build with `registerKind('<your id>', kind, { label, icon }, factory)` when your system loads. The easy way is a schema (`schemaKind`, see `dnd5e/builders.ts`): steps of fields that read and write a draft, formulas as hints, a preview, and an output block. Write the formulas in a pure module (`dnd5e/builder-model.ts`) and test every permutation the way `tests/dnd5e-builders.test.ts` does: every option of every field, both ways through your parser, and every bundled entry through the builder and back. New monster…, New spell…, New item… and `/new-<kind>` find your kinds by themselves. The builder wears your look by itself (`.ev-sys-<id>` on the dialog: your colour on the chips, steps and Next, your paper behind the preview, your type on the headings). Chips can come under headings (`groups`, spells by level), show what's already theirs (`fixed`, a background's skills) and a word each (`meta`); a `custom` field draws your own control from the frame's parts; `checkHead` and `statTiles` (frame.ts) make the check above the preview (5e's "Challenge / CR 3" and its AC, HP, PB tiles).

- **Character wizards.** Use the builder: register `character` and `level-up` kinds with `hidden: true`, open them from `characters.promptNew` and your sheet's Level up (`openBuilder` with `apply` to write the sheet's properties). See `dnd5e/character-wizard.ts`, and test every class × origin × level the way `tests/dnd5e-character-wizard.test.ts` does.

- **Tracker.** Your tracker is your own (turn order, rounds, what HP means), registered as a view and opened by `openTracker`. Take HP input with `parseHpCommand` (`core/tracker/hp.ts`) and give HP the shared keypad (`openHpPad`), so damage is typed the same way in every game. Let the GM drag rows to reorder with `makeSortable` (`core/tracker/sortable.ts`), and keep the dropped order in your model (5e: `moveCombatant` and a `tiebreak`).

- **Timed conditions** (`core/tracker/effects.ts`, see [core's guide](../core/AGENTS.md#timed-conditions-trackereffectsts)). Don't count durations yourself: call `turnEvent` wherever a turn starts or ends in your turn model (initiative, sides, spotlight), keep its result for Back (`undoTurnEvent`), and show its prompts with `showEffectPrompts`, handing it your damage rule and save bonus. Add conditions with core's editor (`openConditionPicker`, `openConditionDetails`: your abilities' names, damage types, a value's label) so they're picked, timed and made up on the spot the same way in every game. Test the turn boundaries the way `tests/dnd5e-combat.test.ts` and `tests/tracker-flow.test.ts` do.

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
- **Spotlight:** the `spotlight` member (see `nimble/spotlight.ts`, `dnd5e/spotlight.ts`). `app/spotlight.ts` imports no system.
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
