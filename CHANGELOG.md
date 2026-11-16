# Changelog

What changed in each release of Ember Vault. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

New work goes under `## [Unreleased]`, sorted into Added, Changed and Fixed. When a pull request merges, the release workflow moves that section under the new version number and uses it for the release notes.

## [Unreleased]

### Added

- The monster builder: **New monster…** in the command palette. Pick a role (regular, solo or minion) and a level and press **Create now** for a monster ready to run, with the GM Guide's HP, damage and dice for that level. Or walk through Toughness, Attacks, Abilities and Story, where everything you leave blank follows the book and everything you type is kept. Type the stats first and the level check beside the form says what it plays like ("Plays like level 4"), with one click to match. Start from any monster (a Goblin, your own note) and its HP and attacks re-level as you move the level. Solos get HP per hero, small and big attacks, Bloodied and a Last Stand the tracker can apply. The dialog keeps one size on every step, with a live stat block beside the form, and fills the screen on phones with the preview a tap away.

- Spell and item builders: **New spell…** and **New item…**, or switch kinds at the top of the builder. Spells get the Creator's Kit damage for their tier, its actions and range defaults, an upcast or cantrip scaling, and a check that says what tier the damage hits like (area spells count for more). Items get Core's weapon prices and rarity bands, book items to compare with, and a line for the item's catch.
- Homebrew spells and items. A ```` ```nimble-spell ```` or ```` ```nimble-item ```` block in any note shows as a compendium card and joins the compendium: search, `nimble:spell:` and `nimble:item:` references, and the character sheet's Add spell and Add item all find it. A note with the same name as a book entry replaces it.
- Help with stat blocks you write. When a line in a ```` ```nimble ```` block can't be shown as written, a quiet line under the stat block says so; click it to see each line, what's wrong in plain words (a misspelled field, a missing colon, list items with no heading, bold that never closes, a value Nimble doesn't know), and a **Fix** button when the fix is obvious. Turn it off in **Settings → Bestiary**.
- A field reference for stat blocks in the guide, with an example of each field.

### Changed

- Tougher and Weaker follow the GM Guide's monster tables. A shift moves HP and the attack dice to the new level's numbers (the Legendary table for solos), where before it added 25% HP a level and noted "+2 damage". A level 4 monster made six levels tougher now lands near the book's level 10 (126 HP) instead of 153. Armor the book holds back at low levels drops a step on the way down.
- Stat blocks forgive more. Field names don't mind capitals, spaces or bold (`Last Stand:`, `**Bloodied:**`, `HP per hero:`), lists can be headed `Legendary actions:` or `Traits:`, a bare `actionText:` over the attacks shows them as attacks, a sentence that wraps onto the next line is joined back up, and a second `attacks:` heading adds to the list instead of replacing it.

## [1.4.0] - 2026-11-16

### Added

- Quests. New campaigns get a Quests folder, next to NPCs and Locations, and you can add a quest from the folder's **+**, **New quest** on the Campaign heading, the **New quest…** command or Spotlight. A GM's quest note opens with the hook in a quest box, a checklist of objectives, then stakes, the truth behind it, clues, the people and places involved, complications, rewards and progress. A player's is written from the party's side: the job as it was put to you, what you know, leads, questions and progress. Properties hold the status, type, who gave it, where it leads, the reward and (for GMs) the level.
- `/quest` links a quest in any note, the way `/npc` links an NPC. On its own it lists the campaign's quests, open ones first, with their status and who gave them; type to narrow it down.
- Links to campaign notes show what they link to, in reading view and Live Preview: a quest is an orange pill with a flag (a tick once it's completed), a location a blue pill with a map pin, a party member a purple pill with a shield, and sessions, maps, handouts, monsters, scenes and chapters get their own icons too. NPCs keep their green chips. Pills on wrapped lines keep a little space between them, and so do NPC chips.
- Finished quests sort themselves out: set `status: completed` and the quest gets a green tick and drops below the open ones; `failed` crosses it out.

### Changed

- A new player campaign's home note has **Goals** where it had **Quests**, since quests now get notes of their own.
- The quest box is `/hook` now (`/objective` still works, and so does `/box quest`), since `/quest` links quest notes.

### Fixed

- A number property shown as a tag (`level: 2`) no longer makes a wide, mostly empty pill; it fits its number, in the same weight as the other values.

## [1.3.1] - 2026-11-15

### Fixed

- Cleared what Obsidian's plugin review flagged: the character sheet holds its height through a redraw with a CSS variable instead of an inline style, a settings field no longer hands Obsidian a promise, and the stylesheet no longer uses `:has` (empty campaign properties, the conditions row, list dividers, compendium pills and Spotlight's chips now get a class instead).

## [1.3.0] - 2026-11-15

### Added

- The compendium: one searchable place for everything in Nimble and everything you've written. Adversaries, NPCs, companions, spells, items, class features, classes and subclasses, ancestries and backgrounds, conditions and rules, each on its own tab of a segmented control.
- Typed filters in the search box, offered as you type: `type:goblin`, `level:2-4`, `school:necrotic`, `tier:8`, `stat:str`, `die:d8`, `prop:light`, `class:oathsworn`, `is:minion`, `-role:minion` and more. A plain word that matches a filter is offered as one ("necrotic" offers `school:Necrotic`), Tab takes the suggestion, and finished filters become chips. A filter panel offers the same as pills.
- Sorting per tab: adversaries by level, type, role, habitat or HP; spells by tier, school or class; items by category, damage die, price or stat; features by class, level or option group. Grouping sorts put a heading over each group. Type `sort:-tier` or use the sort button.
- Filters are chips from the moment you name one: accept `type` and a Type chip waits for its value, suggestions follow what you type, and Enter, Tab or a space after a whole value finishes it. Backspace reopens or cancels chips. The same search field is in the Compendium, every compendium dialog and Spotlight, so Spotlight can filter too.
- Spotlight forgives typos too ("zombieq" finds Zombie), across monsters, NPCs, notes and conditions; typo matches only show when nothing matches outright.
- Search forgives typos and matches rules text, so "lay on hands" finds the Oathsworn feature and "pyroclsm" finds Pyroclasm.
- Every class and subclass feature and every class option has its own entry and card, and each class has a full page: stats, gear, every level's features, option groups and subclasses.
- References to anything, not just monsters: `` `nimble:spell:Flame Dart` ``, `` `nimble:feature:Lay on Hands` ``, `` `nimble:class:Oathsworn` ``, `` `nimble:condition:Dazed` ``. They show as chips with hover cards and open the card when clicked.
- `/spell`, `/item`, `/feature`, `/class`, `/companion` and `/compendium` slash commands. Like `/monster` and `/statblock`, pressing Enter opens the compendium set to that tab with the search box focused, and Enter there writes the reference where you were typing.
- The Companions tab: the Beastmaster's companions, the Shepherd's companion abilities, the Adventuring Companions rules from Monsters & More, and your own companion stat blocks.
- Sorting chains as deep as you like (`sort:level,name`, or **Then by…** in the sort panel), each key with its own direction.
- **Copy reference** on every entry, and back and forward between entries you reached through links.
- **Add several…** on a monster's Add menu asks how many to add.
- Your own art for any compendium entry: upload an image or GIF (or pick one from the vault) and it shows beside the entry's title and as its icon in the lists. Images are saved in an ordinary vault folder and stay linked when renamed.
- Escape from a card or quick look you opened from Spotlight takes you back to Spotlight, still on your search.
- A **Search the compendium…** command, and a Spotlight row that opens the compendium with what you typed (typed filters work in Spotlight too).

### Changed

- The Bestiary tab is now the Compendium. Tabs you had open come back as the compendium.
- Add monster, the character sheet's Add item, Add spell and Add feature, and the slash commands all use the compendium's dialog, so they share the same search, filters, sorting and keys. The dialog shows the selected entry's page beside the list.
- The `nimble:` autocomplete suggests spells, items, features and the rest of the compendium, not only monsters. `` `nimble:spell: `` narrows it to spells.
- `/ref` is now short for `/compendium`.

## [1.2.0] - 2026-11-14

### Changed

- The compendium follows the newest Nimble files: Core Rules 3.3, the 3.1 class books (Berserker, Commander, Mage, Shadowmancer, Shepherd, Songweaver, Stormshifter) and Zephyr 3.2.
- Each of those classes now has its level 1 Skilled Hero line, and its skill bonuses and penalties show on the character sheet and in the new-character preview.
- Level-up HP follows Core Rules 3.3: roll your Hit Die with advantage, or take the flat bonus (d4 +2, d6 +3, d8 +4, d10 +5, d12 +6, d20 +10).
- Core Rules 3.3 rules text: Human Tenacious no longer adds Initiative, Fey Touched and Odd Constitution are reworded, Deflect! is a standard shield rule, starting gold is 25 gp, and Condemn, Vengeance and Shield of Justice are rewritten. Rules text says Defense where it said armor.
- The Psion and Revenant expansion drafts are now their 3.0 versions, with five and four subclasses.
- Poisoned, Invisible and Silenced use the 3.3 wording, and Guilty is a new minor status for the Condemn spell.

### Added

- New adventuring gear from Core Rules 3.3: Caltrops, Hand Drill, Iron Tongs, Monster Part, Net and Useful Book.

## [1.1.0] - 2026-11-14

### Added

- Player campaigns: set a campaign to "I play in it" and the plugin switches to the player side, with lore cards instead of stat blocks, battle notes instead of encounter blocks, and your party front and center. The campaign switcher doubles as the view switcher.
- Character sheets: a `nimble-sheet` block turns a note's properties into a full Nimble sheet, with HP and mana bars and a damage calculator, stats and skills, actions and reactions, weapons, spells, inventory and features. Everything you change is saved back to the note.
- A roll dialog for attacks, spells, saves and checks. Pick check or save, stack advantage or disadvantage, add a modifier, and roll class dice like Judgment Dice in with the attack.
- Class dice that follow the rules: Judgment Dice, Fury Dice, Combat Dice and Swarm Dice, drawn as dice of their size in a color you pick.
- A level-up wizard (hit points, subclass, new abilities, stats, skills) and a Camp button for Field rests, Safe rests and leveling up.
- The Character panel: your character in the sidebar, laid out for a narrow panel and for phones.
- The Nimble compendium: classes, subclasses, spells, items, ancestries and backgrounds from the core rules, the GM Guide and the class books. The expansion drafts sit behind a setting.
- Your own notes on any creature, shown under its lore in the bestiary, hover previews and quick looks.
- A Party section for campaigns you run. Each hero is a character sheet, and encounters are rated against those sheets.
- A changelog, and release notes taken from it.

### Changed

- The bestiary lists each creature once, with a pill for every book it's printed in.
- Campaigns keep their monsters and NPCs to themselves, so a name in your player journal won't open the stat block from a game you run.
- Clicking a hero in the encounter tracker shows the same HP bar, actions and Wounds as their sheet.
- Every row of pips moves one step at a time: tap an empty one to add one, tap a filled one to take one away.
- Campaign pages can open in reading view, with their properties shown as tags.

### Fixed

- Crits explode one die at a time again when extra dice are rolled with the attack.
- Icons and labels sit dead center in every pill and badge.

## [1.0.6] - 2026-11-11

### Added

- Merged pull requests release on their own.

### Fixed

- Cleared the Obsidian review warnings, and lint now runs on every pull request.

## [1.0.5] - 2026-11-11

### Changed

- Player feedback: NPC card previews, rules for chapter folders, an experience pass, and Spotlight.

## [1.0.4] - 2026-11-10

### Added

- 3D dice overhaul: new looks, Dice So Nice and Rollsmith imports, effects, and the Dice Workshop.

## [1.0.3] - 2026-11-10

### Changed

- Campaign panel: every folder shows up with a +, plus a starter picker, menus, and drag and drop.

## [1.0.2] - 2026-11-07

### Fixed

- Cleared the last Obsidian directory review warnings.

## [1.0.1] - 2026-11-06

### Fixed

- Cleared the Obsidian directory review warnings.

## [1.0.0] - 2026-11-06

### Added

- First release as Ember Vault: campaigns, the Nimble bestiary, encounter blocks rated for your party, the combat tracker, GM maps and 3D dice.
