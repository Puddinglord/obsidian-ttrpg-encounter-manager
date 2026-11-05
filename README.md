# Nimble GM for Obsidian

A GM companion for the Nimble TTRPG (3.2 rules), built into Obsidian. It covers prepping and running campaigns from your notes: a campaign manager, a bundled bestiary of 500+ monsters, stat blocks, encounter blocks rated against your party, a combat tracker, GM maps with pins, and slash commands. It isn't a virtual tabletop. Everything here is for the GM.

> Nimble GM is an independent product published under the Nimble 3rd Party Creator License. Nimble TTRPG © Nimble Co. Nimble text is included with permission. This tool is free to use for anyone who already owns the content, is trying the system out, or can't afford it right now. If you enjoy Nimble and are able, please support the game by buying the official books at [nimbleRPG.com](https://nimbleRPG.com).

## Quick start

1. Open **Settings → Nimble GM** and add your party (name, class, level, HP, Defense).
2. Type `/` in a note: `/encounter 3 goblin, 2 wolf` writes an encounter block rated against your party.
3. Click **Run** on the block. The tracker opens with the monsters and your heroes.
4. Click **Start combat**. Heroes go first; tick each one off as they act, then the monsters go. Click **Next round**.

## Campaigns

Run several campaigns from one vault. Each one has its own chapters, scenes, NPCs, session logs and party.

- **Start one:** use **New campaign** (the castle icon in the ribbon, or the command palette). You give it a name, a starting level and the number of heroes. It creates a folder with a home note, a first chapter and an opening scene.
- **The Campaign panel** (left sidebar) is home base:
  - switch campaigns
  - see and edit the party
  - **Continue** where you left off
  - browse chapters and their scenes (map buttons sit on each chapter)
  - browse Sessions, NPCs, Locations and Monsters
  - create any of these with the **+** buttons
- **Each campaign has its own party.** Opening a note inside a campaign makes that campaign active, so encounter blocks there rate against that table's heroes. Until you add heroes, the campaign's `level:` and `heroes:` are used.
- **Moving through scenes:** use the **Next scene** / **Previous scene** commands (bind them to hotkeys). They step through scenes in order, across chapters.

The structure is plain folders and a little frontmatter, so you can also build it by hand:

```
Campaigns/
  Vecna - Eve of Ruin/
    Vecna - Eve of Ruin.md        nimble: campaign   (level: 3, heroes: 4)
    Nest of the Eldritch Eye/
      Nest of the Eldritch Eye.md nimble: chapter    (order: 0, label: Prelude)
      N1 Entrance Tunnel.md       nimble: scene      (order: 4, area: N1)   ← any note here is a scene
      Map - Nest….md              nimble: map
    NPCs/  Sessions/  Locations/  Monsters/  Assets/  ← any other folder is a section
```

- A campaign is any folder holding a `nimble: campaign` note.
- A chapter is any folder inside it holding a `nimble: chapter` note.
- Every other note in a chapter folder is a scene, even without frontmatter.
- `order:` sorts notes; without it, names sort naturally (N2 before N10).
- A ```` ```nimble-campaign ```` block on the home note shows the same outline inside the note.

## Boxes

Styled boxes for adventure notes: read-aloud text, what's in a room, treasure, traps, clues, handouts and more. Type the slash command and start writing inside the box.

| Command | Box |
|---|---|
| `/read-aloud` (`/read`) | Read-aloud text, in a serif face so it's the first thing your eye finds |
| `/look` | What's here |
| `/treasure` (`/loot`) | Treasure and rewards |
| `/trap` (`/hazard`) | A trap or hazard, with Trigger / Spot / Effect / Disarm lines |
| `/secret`, `/clue`, `/checks`, `/exits` | GM-only notes, clues, a check table, exits |
| `/handout`, `/lore`, `/rumor`, `/quest` | A handout (old paper), lore, rumors, a quest or hook |
| `/box` | Any of the above, searchable |

**Restyling a box:** click its icon. A small panel opens with three tabs (Type, Icon, Look); the title is edited at the top. You can pick:
- a type
- a title
- an icon from the library (or any Lucide icon by name)
- a colour, or any custom colour
- a style: card, banner, old note, letter, stone or minimal
- a font: sans, serif, hand or mono
- bold, italic, or start folded

Changes preview live and are saved when you click away. Click a box's title to fold it.

**Tables** in boxes, and in notes (setting: *Styled tables*), get rounded corners, a tinted header and zebra rows. A **DC** column shows its numbers as pills.

The look lives on the fence line, so you can also type it:

````markdown
```box treasure title="Wyrm's hoard" icon=crown color=gold style=parchment
- 300 gp in old coin
- A **+1 shield**
```
````

## NPCs

A note is an NPC when its properties say `nimble: npc` (or it's tagged `#npc`). Add `role:` for a one-line description and `aliases:` for other names.

```yaml
---
nimble: npc
role: Lord Protector of Neverwinter
aliases:
  - Neverember
  - Lord Neverember
---
```

- **Links become chips:** `[[Lord Dagult Neverember]]` shows as a green person chip in both reading view and Live Preview.
- **Mentions are linked as you read:** the NPC's name or an alias anywhere in that campaign's notes gets a dotted underline and a hover preview. In Live Preview, Cmd/Ctrl-click opens the note. Your files aren't changed. Turn this off in settings.
- **Generic creatures** (a cultist, a zombie) stay bestiary references (`nimble:Cultist`). NPCs are the named people with their own pages, and they can carry a stat block too.
- **`/npc`** searches the campaign's NPCs and inserts a link. Typing a new name offers **New NPC**, which creates the note in the campaign's NPCs folder.

## Bestiary

The plugin ships with every monster from the Nimble GM Guide and the Monsters & More draft. That's 525 stat blocks, including 51 legendary/solo monsters and 20 minion types.

- **Open it:** use the book icon in the ribbon, or the **Open bestiary** command. You can search names, abilities, groups and habitats, and filter by role, armor, source and level.
- **Use them anywhere:** `` `nimble:Krogg, Goblin King` `` in any note shows a reference you can hover for the full stat block.
- **Customise one:** use **Copy to vault** to make an editable note. A note with the same name replaces the bundled monster everywhere.
- **Duplicates:** monsters in both books keep the Monsters & More name, and the GM Guide version is called "Name (GM Guide)".

Turn the bundled bestiary off in settings if you only want your own monsters.

## Slash commands

Type `/` at the start of a line or after a space:

| Command | Does |
|---|---|
| `/monster goblin` | Inserts a monster reference |
| `/add 3 goblin` | Adds 3 goblins to the tracker; nothing is written to the note |
| `/encounter 3 goblin, 2 wolf` | Encounter block with live difficulty (or "Insert and run it now") |
| `/statblock krogg` | The full stat block, editable in the note |
| `/builder` | Opens the encounter builder |
| `/legendary`, `/minion`, `/new-monster` | Stat block templates |
| `/condition dazed` | The condition's rules as a callout |
| `/read-aloud`, `/look`, `/treasure`, `/trap`, `/clue`… | Styled boxes (see Boxes below) |
| `/npc kevori` | Link an NPC, or create a new one |
| `/map hideout` | A GM map block for an image in your vault |
| `/roll 2d6+3` | Rolls now and writes the result (plain or as a Nimble attack) |
| `/party`, `/bestiary`, `/tracker`, `/settings` | Jump straight to the party editor, bestiary, tracker or settings |
| `/summary`, `/party-table` | The current encounter's summary; a table of your heroes |

## Stat blocks

````markdown
```nimble
name: Krogg, Goblin King
level: 2
role: solo              # regular, minion, legendary or solo
size: Medium
type: Angry Bugbear
hp: 28/hero             # or a flat number
armor: none             # none, medium (M) or heavy (H)
movement: 6             # e.g. 8, fly 10
saves: STR+ DEX+
actionText: After each hero's turn, choose one:
attacks:
- **Manglemaul.** Move 6. 2d6+2 damage, Grappled (escape DC 10).
- **Crack Skulls.** Move 6. Swing a Grappled creature at another creature. Both take 2d6+2.
bloodied: At 45 HP, Krogg's damage increases to 2d8+2.
lastStand: At 0 HP Krogg is dying! If he takes 20 more damage he dies. Until then, he has Medium Armor.
easier: Have the Manglemaul jam after using Crack Skulls.
harder: Move often; end turns out of melee reach.
```
````

- Other fields: `abilities:`, `resistances:`, `vulnerabilities:` and `immunities:` lists, plus `minion die: d8`, `description:`, `source:`, `group:`.
- Notes in the older format (`monsterType: solo`, `str: +`, `dex: ++`, `will: -`) still work.
- **3D dice:** clicking a dice expression throws real dice across the screen. They tumble, collide and bounce differently every time, yet always land on the rolled result. The notice appears when they land.
  - Finishes: Classic resin, Gem, Metal, Glitter, Lava, Frost, Nebula, Opal and Marble.
  - The primary die, the other dice and crit dice each get their own finish and colour (settings: **3D dice**).
  - **Test a crit** in settings previews an explosion chain.
  - An attack's primary die has its own colour.
  - A crit rolls its extra dice in as a second wave.
  - Colours, and whether phones get 3D dice too, are in settings. It switches off by itself without WebGL or with reduced motion.
- **Interactive text:** dice are clickable, and attack lines follow Nimble rules (a 1 on the first die misses, its max crits and explodes). Condition names such as Grappled or Prone show their rules when clicked.
- **Hover previews** stay open while you move into them. Click inside to pin one; drag its top bar to move it. Its **Add** button has a menu with Add 2, Add tougher (+1 level) and Add weaker (−1 level). Easier/Harder notes appear in full stat blocks and the bestiary, not the hover card. Escape closes the preview.

## Encounter blocks

````markdown
```nimble-encounter
name: Goblin Blind
party: true
monsters:
- 2 Goblin
- 3 Goblin Minion
notes: If spotted, one goblin runs to warn the den.
```
````

The block shows its difficulty using the GM Guide budget:

- The budget is the party's total hero levels.
- 50% of the budget is Easy, 75% Medium, 100% Hard, 125% Deadly and 150% Very Deadly.
- Each minion counts as half the party's level.
- A legendary monster counts as its level × the number of heroes.

You also get warnings, for example armor before level 3, or more than 3 monsters per hero. **Scaling and balancing:**
- Click a monster's count (`2×`) to change how many, make them **tougher or weaker** (one level each way), or remove them. The note updates when the editor closes.
- A shift is written into the block, e.g. `- 2 Cultist +1`. It counts toward difficulty and carries into the tracker.
- Per level: about 25% more (or less) HP, and +2 (or −2) damage on every hit. The stat block shows a Tougher or Weaker line so you can see it at the table.
- Click the difficulty chip (e.g. *Very Deadly · 144%*) and pick a target (Easy, Medium, Hard or Deadly). You get the two or three smallest edits that reach it, for example "Remove all 3 Goblin Minions → Hard 106%". One click applies it. Legendary monsters are kept, and minions from the same family can be suggested.
- The same balancer sits under the meter in the encounter builder.
- The "4 heroes, level 2" line opens the party editor.

**Run** loads the encounter into the tracker, **Add to current** adds its monsters to the encounter already running, and **Edit** opens the builder and saves back into the block.

## Encounter tracker

Nimble turn order: heroes act first, in any order, then the monsters.

- **Turns:** tick the circle when a combatant has gone. When every hero has gone, the tracker switches to the monsters' turn. **Next round** resets everyone and counts durations down.
- **HP entry:** click a combatant's HP and type:
  - `12` for damage
  - `12!` for a crit
  - `+5` to heal, `=20` to set HP, `t5` for temp HP
  - `12v` / `12r` for vulnerable (+10) / resisted (−10)
- **Monster armor:** Medium (−10) and Heavy (−20) are subtracted automatically, and crits ignore armor. The working is shown, e.g. `15 − 10 (Medium armor) = 5`.
- **Heroes:** action pips (set them from Initiative: 1–9 → 1, 10–19 → 2, 20+ → 3) and Wound pips. Dropping to 0 HP adds 1 Wound and makes the hero Dying; damage while Dying adds 2 Wounds (3 on a crit).
- **Minions** share one row with a pip each. Any hit drops one; big hits drop more (one per full die of damage). **Group attack** rolls all of them at once: 1s miss, no crits, and one Defend covers the total.
- **Legendary monsters** have HP scaled to the party. After each hero's turn the tracker shows their choose-one actions with clickable dice. Bloodied and Last Stand appear as prompts, and **Apply** handles Last Stand HP (regain per hero, or a final damage pool with armor).
- **Statuses:** all the 3.2 conditions plus minor statuses and your own custom ones. Apply one for a set number of rounds or until removed; Empowered and Weakened take a value. Durations count down when that combatant's turn ends.
- **Quick add:** type `3 goblin` in the box at the top. **Add the party** is in the ⋯ menu.
- **Combat log and summary:** **Copy summary**, or **Append summary to source note** for your session log.

## GM maps

````markdown
```nimble-map
image: [[Cragmaw Hideout.jpg]]
grid: 30x20
pins:
- 40, 78 | 1. Cave Mouth | [[Part 1#1. Cave Mouth]] | area
- 18.3, 35 | 8. Klarg's Cave | [[Part 1#8. Klarg's Cave]] | encounter
```
````

Pins link to notes or headings, with Obsidian's hover preview, and clicking a pin opens its note. **Add pin**, **Move pins** and right-click (long-press on touch) → **Edit** all save back into the block. Scroll or pinch to zoom, drag to pan, double-tap to zoom in, and press `0` to fit. **Encounter tokens** shows the tracker's combatants as tokens you can drag onto the map, kept in plugin data rather than the note. Pin kinds are place, area, encounter, npc, treasure, danger, note and secret.

## Phone and iPad

Everything works in the Obsidian mobile app. On a touch screen:

- **Monster references and NPCs:** tap once to look (a bottom sheet on phones), tap again, or use **Open** in the sheet, to go to the page. The note scrolls so what you tapped stays visible above the sheet.
- **HP:** tapping a combatant's HP opens a keypad with Damage, Heal, Set HP and Temp HP, plus Crit / Vulnerable / Resisted toggles. It shows the armor working before you apply it, so you don't need the phone keyboard.
- **Menus:** long-press where a desktop would right-click (map pins and tokens). Rules chips such as Bloodied and Last Stand open on tap instead of on hover.
- **Minion group attacks:** tapping asks how many minions attack.
- **Encounter blocks:** the − / + steppers are always visible.
- **Bestiary:** on a phone it shows the list or one monster at a time. Filters sit behind the sliders button.
- **Maps:** pinch to zoom and double-tap to zoom in. Tapping a pin opens a card with Open note, Edit and Delete.
- **Screen:** the screen stays on while combat is running. Turn this off under **Keep the screen on during combat**.

**Prep on desktop, run on the iPad:**
- Encounters, maps and monsters live in your notes, so any sync (Obsidian Sync, iCloud) carries them.
- The party, the tracker state and map token positions are plugin data. To sync those with Obsidian Sync, turn on **Installed community plugins** in its settings.

## Development

See [CLAUDE_CODE_GUIDE.md](CLAUDE_CODE_GUIDE.md). `npm test` runs the unit tests. `npm run test:e2e` drives a real Obsidian. The bestiary comes from `scripts/bestiary/` (`python3 -I scripts/bestiary/merge.py`).
