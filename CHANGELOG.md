# Changelog

What changed in each release of Ember Vault. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

New work goes under `## [Unreleased]`, sorted into Added, Changed and Fixed. When a pull request merges, the release workflow moves that section under the new version number and uses it for the release notes.

## [Unreleased]

### Added

- Map pins can link to other maps. Pick a map note in the pin's **Links to** picker (map notes are listed first, with a map icon) and the pin becomes a **map** pin; clicking it opens that map in the same tab, so Back takes you up again.
- Map blocks understand new optional keys (`grid: hex`, `cell`, `offset`, `show-grid`, `scale`, `travel`, `party` and `drawings`), ready for grids, the party marker and drawing.

### Fixed

- Saving a map (adding, moving or editing a pin) no longer deletes lines from the block that Ember Vault doesn't know about, and lines you didn't change are written back exactly as you typed them.
- A map keeps its zoom and position after you add or move a pin, and when you switch between Add pin and Move pins, instead of jumping back to the whole map. Coming back to a map's note puts you where you were.

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
