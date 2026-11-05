# Nimble GM: LegendKeeper-style campaign tool for Obsidian

Status: proposal, November 2026. Pairs with the clickable prototype `nimble-gm-cockpit.html`. Open it in a browser (no server needed).

## The idea in one line

Obsidian already handles the wiki half of LegendKeeper. This plugin adds the half LegendKeeper doesn't have: a Nimble bestiary, an encounter builder, a combat tracker, maps with pins and tokens, and a player view. You should be able to move from reading the adventure to running the fight and back without leaving the note.

## Where the plugin is today

Already working:

- `nimble` stat block code blocks and inline `nimble:Name` references, with hover preview, autocomplete and a quick-add button
- A sidebar encounter tracker: HP entry, conditions, rounds, drag reordering, solo phases (Bloodied and Last Stand), and multiple encounters
- Clickable dice with Nimble attack rules, plus a roll log
- Unit tests and an e2e harness that drives a real Obsidian

Out of date against the 3.2 rules (the first thing to fix, whatever else we build):

| Area | Plugin today | Nimble 3.2 / GMG 3.0 |
|---|---|---|
| Monster armor | Medium takes dice only; Heavy takes half | Medium **−10** and Heavy **−20** damage per attack. **Crits ignore armor.** |
| Armor parsing | Numeric AC ≤17 maps to M, otherwise H (a 5e leftover) | Only `M` or `H`. Drop the AC mapping. |
| Vulnerable/Resistant | Text-only lists | **+10 / −10** damage, applied flat |
| Saves | `str` / `dex` / `will` with `++` notation | Four saves: **STR, DEX, INT, WIL**, written `STR+` or `WIL−` |
| Challenge | `cr` | `level` (1/3, 1/2, 1…20) |
| Minions | Not modeled | Die to any damage. Attacks can't crit and ignore (dis)advantage. A group attacking one hero rolls once and can be Defended once. Optional overkill: damage ÷ die size. |
| Legendary / Solo | HP is a fixed number; has "legendary resistances" | HP is **per hero** (e.g. 26/hero). Acts **after each hero's turn**. Bloodied and Last Stand triggers; Last Stand adds HP per hero. There are no legendary resistances in Nimble. The GMG calls these monsters "Legendary"; the Monsters & More draft calls them "Solo". Accept both. |
| Turn order | Drag-sorted initiative list | Heroes go first, then monsters act together. Initiative (d20+DEX) only sets **starting actions**: 1–9 gives 1, 10–19 gives 2, 20+ or a natural 20 gives 3. |
| Heroes | Not tracked | 3 actions; reactions (Defend, Interpose, Opportunity Attack, Help) cost 1 action each, 1/round. 0 HP means +1 Wound and Dying. Damage while Dying adds 2 Wounds (3 on a crit). 6 Wounds is death. |
| Conditions | Has Blinded, Charmed, Petrified, Hampered and Wounded | The 3.2 list is Blind, Dazed, Dying, Empowered/Weakened X, Frightened, Grappled, Incapacitated, Invisible, Poisoned, Prone, Restrained, Silenced, Slowed and Taunted, plus minor statuses. Dazed for monsters means losing their move OR 1 attack. |
| Encounter difficulty | None | Budget = total hero levels. Easy is 50%, Medium 75%, Hard 100%, Deadly 125%, Very Deadly 150%. Aim for 1–3 monsters per hero, minions excluded. 2 minions per hero equal 1 monster of hero level. No armor before level 3, and no Heavy before level 8. |

## LegendKeeper vs Obsidian vs this plugin

LegendKeeper (v0.21, Oct 2026) is a fast wiki: templates, @-mentions, secret blocks, an Atlas with pins, regions, layers and nested maps, boards, timelines, and a new "View As player" mode with chat and dice. It has **no combat or encounter tooling at all**. Its FAQ says it is "not a virtual tabletop".

| Need | Obsidian gives it | Plugin builds it |
|---|---|---|
| Nested pages, links, hover previews, tags, search | ✓ core | |
| Fast facts / infobox | Properties | Nicer infobox rendering (later) |
| Boards | Canvas | |
| Tag/sub-page indexes, bestiary tables | Bases | Monster/encounter frontmatter so Bases works on them |
| Templates | Core Templates | Templates for adventure, location, NPC, encounter, monster |
| GM secrets and a player view | Callouts, but nothing strips them | **Player view** that hides secrets, GM pins and HP numbers |
| Maps with pins, layers, nested maps | — | **Map view** (image + pins linked to notes, reveal/hide, map notes, nested maps) |
| Battle map with tokens | — | **Grid + tokens** linked to the tracker |
| Bestiary | — | **Searchable bestiary** over every monster note in the vault |
| Encounter builder | — | **Budget meter + guideline warnings**, saved as notes |
| Run combat | — | **Nimble 3.2 tracker** (phases, actions, Wounds, minions, Legendary) |
| Session log | — | Encounter results appended to the session note |
| Real-time multiplayer | Obsidian Sync / Relay | Out of scope |

## The core design choice: everything is a note

The prototype's explorer shows the idea: each monster, encounter, map and session is an ordinary Markdown file. That gives search, backlinks, Bases, Sync and git for free, and your data stays readable without the plugin.

- **Monster note**: frontmatter (`nimble: monster`, `level`, `size`, `role`, `armor`, `hp` or `hp-per-hero`, `tags`) plus a `nimble` block for the text. Bestiary filters are frontmatter queries.
- **Encounter note or block**: a `nimble-encounter` block listing `3 [[Goblin Skulker]]`. It can live inline in the adventure (as in the prototype's M1 / M3) or in its own note. It renders the difficulty and a **Run** button.
- **Map note**: frontmatter pointing at an image, with pins stored as `{x, y, link, kind, revealed}`. Pins link to notes, and an encounter pin can start the encounter.
- **Live combat state** stays in plugin data, as it does today. On **End encounter**, a summary is written to the session note and the encounter is marked resolved.

## Proposed phases

Each phase ships on its own.

1. **Rules pass (small, do first).** Fix armor, saves, level, Legendary per-hero HP and conditions. Model minions and the heroes-then-monsters turn flow. Keep the current syntax parsing as a fallback so existing notes still render. Unit tests for the damage math.
2. **Bestiary and encounter builder.** Index monster notes by frontmatter. Add a bestiary view with search and filters, the `nimble-encounter` block with difficulty, a builder view, and saving as notes.
3. **Tracker v2.** Party/hero notes, the initiative-to-actions step, action pips, reactions, Wounds and Dying, minion groups with group attack and overkill, Legendary prompts after each hero's turn, a damage breakdown ("23 − 10 armor = 13"), and the session log write-back.
4. **Maps.** A map view in a custom leaf with an image, pins, reveal/hide, map notes and nested maps. Then a battle-map grid with tokens tied to the tracker. Start simple (no fog painting, no lighting).
5. **Player view.** A second pop-out window, for a second monitor or a shared screen, that shows the map with fog, revealed pins, read-aloud text, and a "Bloodied / Healthy" view of monsters. This is the "tabletop without the table" part.
6. **Content.** Ship the Nimble bestiary (and other Nimble text) bundled, with attribution and a link to buy at nimbleRPG.com, written into the vault as ordinary monster notes the GM can edit. Plus templates for adventures, locations and NPCs.

## Open questions for you

1. ~~**Bestiary content.**~~ **Resolved (Nov 2026):** Evan Diaz, Nimble's creator, gave permission to include all Nimble text, as long as the plugin gives attribution and points people to buy the books at nimbleRPG.com. The plugin can ship a bundled Nimble bestiary, with the creator-license attribution line and a link to nimbleRPG.com shown in settings, the bestiary and on stat blocks (the prototype shows this). Third-party adventure text and maps (WotC adventures, Forgotten Adventures maps) are still not bundled.
2. **How far to take maps.** Pins on images plus a simple token grid gets most of the value. Drawn fog, walls and lighting are a much bigger project. My recommendation: pins and tokens first, then decide.
3. **Player display.** A second Obsidian window on your own screen, or something players open on their own devices (that means a web export or server)? My recommendation: a pop-out window first.
4. **Party data.** Track heroes as lightweight notes (name, class, level, max HP, Defense, initiative bonus) so the builder and tracker know the party, or keep players' sheets entirely off-tool?

## The prototype's example adventures

The prototype engine is generic. Each adventure is one data file that registers itself on `window.SCENARIOS`; switch between them with the dropdown in the top bar or `?s=<id>`.

- `scenarios/nimble-bestiary.js`: the Nimble monsters (GM Guide 3.0 and Monsters & More draft), shared by both examples. Included with the creator's permission and attribution. Safe to commit.
- `scenarios/sunken-mill.js`: an original sample. Safe to commit.
- `private/cragmaw-hideout.js`: Cragmaw Hideout from Lost Mine of Phandelver, run in Nimble at party level 2. **Git-ignored**, because it holds licensed material:
  - The map is Forgotten Adventures' free "Cragmaw Hideout [30×20]", with lit and unlit versions and the flood-surge overlay.
  - The area notes are short summaries. Run the full text from your book.
  - The monsters come from the shared Nimble bestiary. Klarg uses the Krogg (Solo) block, Yeemik the Goblin Taskmaster, and Ripper the Wolf.
  - Screenshots are in `private/screenshots/`.

A scenario file holds the same things the plugin would read from vault notes: monsters, party, map (image, grid size, overlays), pins, GM map notes, traps, encounters (monsters, map area, start positions), and documents. That's a useful preview of the note formats the plugin needs.
