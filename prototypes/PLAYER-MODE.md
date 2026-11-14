# Player mode: design

Ember Vault becomes a campaign manager for players as well as GMs. A campaign is either a **GM campaign** (everything we have today) or a **player campaign** (your character, your party, your notes). The campaign switcher is the view switcher: the active campaign's side decides what the plugin shows.

## 1. Campaign side

- The campaign home note says which side you're on: `role: gm` (default when missing) or `role: player`.
- `Campaign.role: 'gm' | 'player'` in campaign-model.ts. `plugin.campaigns.role(path?)` answers for a note (its campaign, else the active campaign, else `gm`). `plugin.playerView(path?)` is the boolean form every view checks.
- New campaign dialog asks "Running it (GM)" vs "Playing in it (Player)". Player campaigns start with: home note, `Party/` (with your character), `Sessions/`, `NPCs/`, `Locations/`, `Maps/`, `Assets/`, a first chapter. No Monsters folder.
- Switch sides any time from the campaign menu ("Campaign settings…"); it only rewrites `role:`.
- The switcher groups campaigns under **Running** and **Playing**, each with its badge (crown / d20).

## 2. What a player sees

| Thing | GM campaign | Player campaign |
|---|---|---|
| Encounter tracker, builder difficulty, balance | yes | hidden (commands no-op with a Notice) |
| `nimble-encounter` block | runnable encounter | **Battle notes**: who we fought, how many, outcome, notes; names open the lore card |
| Bundled bestiary | full stat blocks | names, group, size, kind, habitat, flavour text only ("lore card") |
| `nimble:` refs / hovers | stat block | lore card |
| `nimble` stat block the player wrote | rendered | rendered (it's their own note) |
| Chapters, maps, sessions, NPCs, locations | yes | yes |
| Party | heroes for encounter maths (settings) | **Party roster**: character notes in the campaign, yours flagged |
| Character sheets | (optional) | yes |
| Spotlight | adversaries, NPCs, notes, dice, commands | + compendium (items, spells, classes, ancestries, backgrounds, features); monsters → lore card |

## 3. Character note

A character is a markdown note. **Frontmatter is the data**; a ```` ```nimble-sheet ```` block renders the sheet; everything else in the note is free-form (backstory, notes). The sheet writes back with `app.fileManager.processFrontMatter`, so the note is always the source of truth and works with Bases/Dataview.

```yaml
---
nimble: character
title: "Thorga Ironbrow"        # optional display name (file name otherwise)
player: Dakotah                 # who plays them
mine: true                      # this is my character (party roster flag)
ancestry: Dwarf
class: Berserker
subclass: Path of the Red Mist
level: 3
background: Taste for the Finer Things
size: Medium
height: 4'5"
weight: 180 lb
speed: 6                        # default 6 (+ancestry when known)
portrait: "[[Thorga.png]]"
str: 2
dex: 2
int: -1
wil: 0
save_adv: STR                   # optional override, default from class
save_dis: INT
hp: 20
hp_max: 20
temp_hp: 0
wounds: 0
wounds_max: 6
hit_die: 12                     # optional override, default from class
hit_dice: 3                     # remaining
hit_dice_max: 3                 # optional override, default = level
armor: 2                        # optional override, default DEX + equipped armor/shield
initiative: 2                   # optional override, default DEX
mana: 4
mana_max: 4                     # optional override, default class formula
skills:                         # points ON TOP of the stat; total = stat + points
  might: 2
  insight: 2
languages: [Common, Dwarvish]
gp: 50
sp: 0
cp: 0
conditions: [Dazed]
inventory:                      # strings or {name, qty, equipped, slots, note}
  - Battleaxe
  - { name: Rations (meat), qty: 3 }
  - { name: Chain Shirt, equipped: true }
spells: [Flame Dart, Fireball]  # known/prepared spells beyond what the class grants
features:                       # chosen options + custom abilities; class/ancestry features come from the compendium automatically
  - Death Blow
  - { name: Bear Hug, text: "Custom text." }
resources:                      # class counters: current values; max comes from the compendium or {current, max}
  Fury Dice: 2
cssclasses: [nimble-sheet-note]
---
```

Rules (from Core Rules 3.2, "The Character Sheet"): Defense = DEX + armor; Initiative = DEX; Speed 6; max Wounds 6; Hit Dice max = level; inventory slots 10 + STR; skills start at their stat value and gain points; one advantaged save (▲) and one disadvantaged save (▼) from the class; languages: Common + 1 per point of INT. Skills: Arcana INT, Examination INT, Finesse DEX, Influence WIL, Insight WIL, Lore INT, Might STR, Naturecraft WIL, Perception WIL, Stealth DEX. Safe Rest: all HP, Hit Dice, mana and class resources back, heal 1 Wound, temp HP gone. Level up: roll Hit Die with advantage (or take the average: d4 3, d6 4, d8 5, d10 7, d12 8), +1 max Hit Die, +1 skill point, new class features.

Missing values fall back to sensible defaults so a half-filled note still renders. Unknown classes/items/spells still show (as plain names); they just don't get compendium details.

## 4. The sheet

Based on the official Nimble sheet (stat shields with ▲▼, the HP/temp HP shield, Armor and Initiative boxes, the Wounds track with a skull, the 10-skill strip) but interactive and phone-first.

- **Header**: portrait, name, ancestry · class · level (subclass under it), player.
- **Vitals**: HP shield (tap → HP pad: damage/heal/temp, applies Wounds at 0 like the tracker), Wounds track (tap a pip), Armor, Initiative (tap to roll), Speed, Hit Dice `2/3 d12`, Mana bar (casters), class resources as counters, conditions as chips (tap → condition info; + to add).
- **Stats**: four shields with ▲/▼; tap rolls a save (d20 + stat, advantage/disadvantage from the arrows).
- **Skills strip**: ten boxes, totals; tap rolls a check.
- **Tabs** (sticky on phones): **Actions** (weapons with damage roll buttons using Nimble attack dice, cantrips/spells you can cast, class actions with costs), **Features** (class features up to your level, subclass, ancestry traits, background, chosen options — each expandable), **Spells** (by school and tier, mana cost, cast = spend mana + roll), **Inventory** (slots used of 10+STR, equip toggles, qty steppers, coins, add), **Notes** (jump to the note body).
- **Rest & level** bar: Field Rest (spend Hit Dice, roll them), Safe Rest, Level up (wizard: HP roll/average, new features listed, choose options).
- **Add** buttons open Spotlight pre-filtered to that kind (items for Inventory, spells for Spells, the class's option groups for Features). Picking writes to the frontmatter.
- Edit mode (pencil): inline editing of the basic details and stats; long-press on phones.
- Every number that rolls uses the plugin's dice (3D dice when on) and the roll log.

Also a **Character** side panel (ribbon + command "Open my character"): the active player campaign's `mine: true` character, so the sheet sits beside session notes on desktop and is one tap away on a phone.

## 5. Compendium

`src/data/compendium.json`, built by `scripts/compendium/merge.py` from transcriptions in `scripts/compendium/raw/` (schema: `scripts/compendium/EXTRACTION-BRIEF.md`). Collections: classes (with subclasses, option groups, class spells), ancestries, backgrounds, motivations, items, properties, spells, boons, rules. Every entry has `source`, `page`, `draft`. Draft-book content is labelled "Draft" in the UI and can be hidden in settings.

## 6. NPCs and locations

Richer starters, still free-form (every heading can be deleted):

- **NPC** properties: `role`, `portrait`, `aliases`, `ancestry`, `pronouns`, `age`, `faction`, `location`, `status` (alive/dead/missing/unknown), `attitude` (friendly/neutral/hostile/unknown), `first_met`. Card block (look, wants, voice, secret), then Personality, Relationships, What they know, Quotes, History with the party, Notes. Player version swaps "Secret" for "Suspicions", and "What they know" for "What we learned".
- **Location** properties: `type` (city, dungeon, wilderness…), `region` (link to the parent location), `status`, `image`. Sections: Overview, Sights & sounds, People here, Points of interest, Factions, Rumors & secrets (player: Rumors), Connections, History, Visits.
