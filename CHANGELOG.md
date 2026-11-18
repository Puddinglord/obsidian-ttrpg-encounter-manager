# Changelog

What changed in each release of Ember Vault. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

New work goes under `## [Unreleased]`, sorted into Added, Changed and Fixed. A line of its own before the first of those is the release's headline: the changelog page on the site uses it as the title, and it's what shows when you share the release's link. Link the guide page an entry is about, repo-relative (`See the [builder guide](docs/builder.md).`): the site shows it as a Guide pill, and the release notes point it at the guide on the site. When a pull request merges, the release workflow moves that section under the new version number and uses it for the release notes.

## [Unreleased]

Ember Vault runs 5e campaigns as well as Nimble, on shared engines for slash commands, the compendium, builders and content packs.

### Added

- 5e campaigns, with the 2024 rules (SRD 5.2) or the 2014 rules (SRD 5.1). Pick **Game system** in **New campaign** or **Campaign settings…**; everything else about campaigns works as before. See the new [Playing 5e](docs/5e.md) guide.
- Both SRD bestiaries (341 and 334 monsters), ```` ```5e ```` stat blocks laid out the way each edition prints them, with clickable attack bonuses, saves, checks and damage, and `` `5e:Goblin` `` references with the CR, a hover card and a quick look. **Copy to vault** makes a book monster your campaign's own. See [Playing 5e](docs/5e.md#monsters).
- 5e encounters: an encounter block in a 5e campaign shows XP and difficulty by its rules (2024's XP budget, or 2014's thresholds and multipliers), and **Run** starts the fight in a 5e combat tracker with initiative order, turns and rounds, temporary HP, death saves, legendary actions and conditions. See [Playing 5e](docs/5e.md#encounters).
- The 5e compendium: spells, magic items, equipment, classes with their level tables, species and races, backgrounds, feats, rules and conditions from both SRDs, with `` `5e:spell:Fireball` ``-style references, autocomplete and Spotlight. See [Playing 5e](docs/5e.md#the-5e-compendium).
- Slash commands in 5e campaigns: `/monster`, `/spell`, `/item`, `/equipment`, `/class`, `/species`, `/background`, `/feat`, `/rule` and `/compendium` write `5e:` references from the campaign's edition; `/encounter 4 goblin warrior, ogre` writes a block rated by the edition's rules; `/statblock`, `/add` (into the 5e tracker) and `/roll +5` with advantage or disadvantage. `/party-table` heads the defense column AC. See the [slash commands guide](docs/slash-commands.md#in-a-5e-campaign).
- The 5e compendium searches like Nimble's: typed filters that become chips (`cr:1/4 type:undead`, `school:evocation level:3`, `rarity:rare`, `weapon:martial prop:finesse`), sorting, keyboard navigation and a filter panel. Enter adds a monster to the fight or inserts a reference. The 5e slash commands and Spotlight take the same filters. See [Playing 5e](docs/5e.md#the-5e-compendium).
- 5e builders: **New monster…**, **New spell…** and **New item…** (and `/new-monster`, `/new-spell`, `/new-item`) work in 5e campaigns. Proficiency, XP, hit points, saves, skills, passive Perception and attacks follow from what you fill in, worded for your edition. Spells and items are written as new ```` ```5e-spell ```` and ```` ```5e-item ```` blocks that references, autocomplete, `/spell`, Spotlight and the compendium find before the SRD's. The pencil on a block reopens it in the builder. See [Playing 5e](docs/5e.md#make-your-own).
- Content packs: JSON files in your vault (`Ember Vault/Content`) add monsters, spells, magic items, equipment, feats, backgrounds, species, classes and subclasses to 5e, everywhere the SRD's show up. **Import content…** checks a pack and says, entry by entry, what it left out and why. A campaign can pick its packs with `packs:` on its home note. A note in your vault beats a pack, and a pack beats the SRD. See the new [Content packs](docs/content-packs.md) guide, with an example pack and a JSON Schema for editors.
- The 5e combat tracker has Nimble's HP keypad: tap a combatant's HP for Damage, Heal, Set or Temp, with Crit, Vulnerable (doubled) and Resisted (halved), and see where it lands before you apply it. The HP box takes `7v` and `7r` too. See [Playing 5e](docs/5e.md#the-5e-combat-tracker).
- 5e NPCs: NPC notes in a 5e campaign get `ac`, `hp`, `cr` and `statblock` properties. The NPC card shows them to the GM, links the stat block, and **Add to fight** puts the NPC in the 5e tracker under their own name. See [Playing 5e](docs/5e.md#npcs).
- 5e character sheets: **New character** in a 5e campaign walks you through class, species, background, abilities (standard array, point buy or your own, with each edition's bonuses), skills, subclass and spells, with the sheet's numbers beside you. It makes a note with a ```` ```5e-sheet ```` sheet that works out saves, skills, AC, attacks, spell DC and slots and features, rolls everything, and tracks HP, death saves, slots, rests and levels. The encounter party comes from the sheets. **Level up** walks through hit points, a subclass when it's time, an Ability Score Improvement or a feat, and new spells. See [Playing 5e](docs/5e.md#character-sheets).
- Import a D&D Beyond character into a 5e campaign: **Import a D&D Beyond character…** turns a public character's data into a character note with a 5e sheet (class, level, species, background, ability scores, hit points, skills, spells, gear, gold and feats). Ember Vault never connects to D&D Beyond; you paste the data or choose the file. See the [import guide](docs/import.md).
- Import a Fantasy Statblocks creature: **Import a Fantasy Statblocks creature…** turns a `statblock` block (or a JSON file of creatures) into a ```` ```5e ```` stat block. See the [import guide](docs/import.md).

- Rules words are clickable. In 5e stat blocks, compendium pages and character sheets, AC, Str, Darkvision, Passive Perception, Common, Prone and the rules in a monster's actions open a card with the rule from the SRD, and **Open in compendium** goes to its page. See [Playing 5e](docs/5e.md#rules-words).
- Nimble's conditions, stats (STR, DEX, INT, WIL), Concentration and languages open the same cards. See the [compendium guide](docs/compendium.md#rules-words).
- The 2024 Rules tab has SRD 5.2's Rules Glossary, and both editions list the six abilities, the skills and the languages. See [Playing 5e](docs/5e.md#the-5e-compendium).
- Encounter settings for each game, in the settings page and the tracker's **⋯** menu. 5e can leave heroes' initiative for players to type in, or monsters' too. See the [settings guide](docs/settings.md#5e).
- Maps in a 5e campaign show the 5e fight as tokens, like Nimble's encounter in a Nimble campaign. See the [maps guide](docs/maps.md).

### Changed

- Clicking a map pin shows its note in a quick look over the map instead of opening the page; Cmd/Ctrl-click still opens it. **Show pin labels** now shows labels on small maps too. See the [maps guide](docs/maps.md).
- Pips work the same in both games: tap a filled pip to take one away, an empty one to add one, and the one that changed animates. 5e's legendary actions, death saves and spell slots use them. See [Playing 5e](docs/5e.md#the-5e-combat-tracker).
- The 5e tracker's controls sit on one line, with Next turn the big button.
- Each game has its own look. 5e's tracker, encounter blocks, builder, character wizards, stat blocks, compendium cards and NPC cards are set like its book: warm paper, rubric red, gold rules and small-caps names. Nimble's keep following your theme. See [Playing 5e](docs/5e.md).
- The 5e tracker shows each combatant on one row (initiative, name, conditions, CR or level, AC and HP), about twice as many on screen. The current turn says **Up now**, heroes and monsters have their own colour, defeated monsters fold away at the bottom, and tapping initiative lets you type or roll it. See [Playing 5e](docs/5e.md#the-5e-combat-tracker).
- The 5e tracker tracks concentration (it gives the save's DC when someone concentrating takes damage) and Legendary Resistance, and conditions open with their rules and how long they last. See [Playing 5e](docs/5e.md#the-5e-combat-tracker).
- 5e encounter blocks show each group's CR, AC and HP, and a bar of the fight's XP against the party's thresholds. See [Playing 5e](docs/5e.md#encounters).
- The 5e character sheet is redesigned and takes the whole page: a header with the portrait, the HP bar and keypad from Nimble's sheet, abilities with their skills, conditions with Exhaustion levels, and tabs for Actions, Spells (by level, with their slots), Features and Inventory. The note's raw properties no longer show above it. See [Playing 5e](docs/5e.md#character-sheets).
- 5e's New character and Level up show the character in brief beside every step; abilities are a card each, with point buy's points left; spells are grouped by level. See [Playing 5e](docs/5e.md#character-sheets).

- Under the hood, Nimble and 5e are separate modules that can't reach into each other (the build checks), so a change to one can't break the other. The plugin itself holds no game: Nimble plugs in the same way 5e does.
- Settings are grouped: what every game shares first (General, Campaigns, Party, Content packs, Dice, Combat), then Nimble's own. See the [settings guide](docs/settings.md).
- Nimble attack rolls (miss on a 1, explode on the max) only apply in Nimble campaigns; 5e attack rolls are plain d20s.

### Fixed

- An NPC note written by hand, without a `nimble-npc` block, shows its card and portrait instead of only a row of properties. See the [NPCs guide](docs/npcs.md#character-cards).
- The icons on the quick look's buttons (Add to fight, Open page, Open notes) sit level with their labels instead of a little high.

## [1.6.0] - 2026-11-17

A user guide that shows what it describes, and a changelog on the website.

### Added

- A changelog on the website, with every release on one page and each release on a page of its own to link to. A shared link shows the release's headline and a screenshot. Entries link to the guide pages they're about, and there's an RSS feed for feed readers and Discord bots. The guide's [overview](docs/README.md) links to it.
- A Quests page in the user guide, with a GM's and a player's quest note to copy, every property, and how finished quests sort. See the [quests guide](docs/quests.md).
- Screenshots throughout the user guide: the stat block helper, the builder's review and level check, the roll dialog, class dice, levelling up, the Character panel, the Dice Workshop, the roll log, rolls in a note, the encounter builder, battle notes, `/quest`, finished quests, the compendium's references, sorting and dialog, and the ribbon icons. See [when a line isn't shown](docs/bestiary.md#when-a-line-isnt-shown) for one.
- A worked example in the builder guide: a level 3 monster from **Create now**, the same monster typed stats first with the level check and its fixes, and a solo. See [your first monster](docs/builder.md#your-first-monster).
- A new landing page: every feature with a screenshot and a link to its guide page, the 3D dice turning through every look, an iPad and a phone running the plugin, and the newest release at the top.

### Changed

- The guide's older screenshots show the plugin as it looks now, with the Campaign panel open only on the folder each one is about.
- Getting started covers the compendium, the builder, quests and playing in a campaign, and lists all four ribbon icons, including your character sheet. See [getting started](docs/getting-started.md).
- The README lists the builder and quests.

### Fixed

- On phones and tablets, the icon in read-aloud, trap, treasure and other boxes shows again (it was a blank square). See [boxes](docs/boxes.md).
- The guide said a monster's hover preview has **Add to fight**; it has **Add** and **Open note**.

## [1.5.0] - 2026-11-17

Build your own monsters, spells and items on the books' numbers.

### Added

- The monster builder: **New monster…** in the command palette. Pick a role (regular, solo or minion) and a level and press **Create now** for a monster ready to run, with the GM Guide's HP, damage and dice for that level. Or walk through Toughness, Attacks, Abilities and Story, where everything you leave blank follows the book and everything you type is kept. Type the stats first and the level check beside the form says what it plays like ("Plays like level 4"), with one click to match. Start from any monster (a Goblin, your own note) and its HP and attacks re-level as you move the level. Solos get HP per hero, small and big attacks, Bloodied and a Last Stand the tracker can apply. The dialog keeps one size on every step, with a live stat block beside the form, and fills the screen on phones with the preview a tap away. See the [builder guide](docs/builder.md).
- The builder's review checks the build against the books and offers fixes: stats that play like another level, attacks far from the book's damage, early armor, a missing ability, a solo without saves, a spell that hits harder than its tier, a magic item without a catch. Type, Group and Habitat suggest the compendium's words as you type; each attack has its own die; spells and items can start from a book entry; **Saved in** is a pill that opens into a folder picker; segmented controls slide between choices.
- Closing the builder with something filled in (Cancel, the ×, Escape, a click outside) asks first: **Keep building** or **Discard**.
- Ways into the builder: a **+** in the compendium's search bar (set to the tab you're on), **Use as a template** on monster, spell and item pages, `/new-monster`, `/new-spell` and `/new-item` in a note (the block goes where you typed), and a pencil on any monster, spell or item block in your notes that opens it in the builder and saves it back in place. Saving changes only what you changed: anything the builder has no control for (senses and languages, a solo's flat HP, a spell's class or "Reaction", a wand's charges) is written back as it was, and if the block has lines it can't read, it asks before saving without them.
- Spell and item builders: **New spell…** and **New item…**, or switch kinds at the top of the builder. Spells get the Creator's Kit damage for their tier, its actions and range defaults, an upcast or cantrip scaling, and a check that says what tier the damage hits like (area spells count for more). Items get Core's weapon prices and rarity bands, book items to compare with, and a line for the item's catch.
- Homebrew spells and items. A ```` ```nimble-spell ```` or ```` ```nimble-item ```` block in any note shows as a compendium card and joins the compendium: search, `nimble:spell:` and `nimble:item:` references, and the character sheet's Add spell and Add item all find it. A note with the same name as a book entry replaces it, in every campaign. See [homebrew spells and items](docs/builder.md#homebrew-spells-and-items-in-your-notes).
- Help with stat blocks you write. When a line in a ```` ```nimble ```` block can't be shown as written, a quiet line under the stat block says so; click it to see each line, what's wrong in plain words (a misspelled field, a missing colon, list items with no heading, bold that never closes, a value Nimble doesn't know), and a **Fix** button when the fix is obvious. Turn it off in **Settings → Bestiary**. See [when a line isn't shown](docs/bestiary.md#when-a-line-isnt-shown).
- A [field reference for stat blocks](docs/bestiary.md#writing-a-stat-block) in the guide, with an example of each field.

### Changed

- `/new-monster` opens the monster builder instead of inserting a blank template.
- Tougher and Weaker follow the GM Guide's monster tables. A shift moves HP and the attack dice to the new level's numbers (the Legendary table for solos), where before it added 25% HP a level and noted "+2 damage". A level 4 monster made six levels tougher now lands near the book's level 10 (126 HP) instead of 153. Armor the book holds back at low levels drops a step on the way down. See [encounters](docs/encounters.md#encounter-blocks).
- Stat blocks forgive more. Field names don't mind capitals, spaces or bold (`Last Stand:`, `**Bloodied:**`, `HP per hero:`), lists can be headed `Legendary actions:` or `Traits:`, a bare `actionText:` over the attacks shows them as attacks, a `Choose one:` line over the attacks introduces them, a sentence that wraps onto the next line is joined back up, and a second `attacks:` heading adds to the list instead of replacing it.

### Fixed

- Copying a monster into your vault, or inserting its stat block in a note, keeps its habitat, and an older note's `cr`, `multiattack` and legendary `(L)` abilities.

## [1.4.0] - 2026-11-16

Quests get notes of their own, and links to campaign notes become pills.

### Added

- Quests. New campaigns get a Quests folder, next to NPCs and Locations, and you can add a quest from the folder's **+**, **New quest** on the Campaign heading, the **New quest…** command or Spotlight. A GM's quest note opens with the hook in a quest box, a checklist of objectives, then stakes, the truth behind it, clues, the people and places involved, complications, rewards and progress. A player's is written from the party's side: the job as it was put to you, what you know, leads, questions and progress. Properties hold the status, type, who gave it, where it leads, the reward and (for GMs) the level. See the [quests guide](docs/quests.md).
- `/quest` links a quest in any note, the way `/npc` links an NPC. On its own it lists the campaign's quests, open ones first, with their status and who gave them; type to narrow it down. See [linking a quest](docs/quests.md#linking-a-quest).
- Links to campaign notes show what they link to, in reading view and Live Preview: a quest is an orange pill with a flag (a tick once it's completed), a location a blue pill with a map pin, a party member a purple pill with a shield, and sessions, maps, handouts, monsters, scenes and chapters get their own icons too. NPCs keep their green chips. Pills on wrapped lines keep a little space between them, and so do NPC chips. See [links to campaign notes](docs/campaigns.md#links-to-campaign-notes).
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

The compendium: everything in Nimble, and everything you've written, in one search.

### Added

- The compendium: one searchable place for everything in Nimble and everything you've written. Adversaries, NPCs, companions, spells, items, class features, classes and subclasses, ancestries and backgrounds, conditions and rules, each on its own tab of a segmented control. See the [compendium guide](docs/compendium.md).
- Typed filters in the search box, offered as you type: `type:goblin`, `level:2-4`, `school:necrotic`, `tier:8`, `stat:str`, `die:d8`, `prop:light`, `class:oathsworn`, `is:minion`, `-role:minion` and more. A plain word that matches a filter is offered as one ("necrotic" offers `school:Necrotic`), Tab takes the suggestion, and finished filters become chips. A filter panel offers the same as pills.
- Sorting per tab: adversaries by level, type, role, habitat or HP; spells by tier, school or class; items by category, damage die, price or stat; features by class, level or option group. Grouping sorts put a heading over each group. Type `sort:-tier` or use the sort button.
- Filters are chips from the moment you name one: accept `type` and a Type chip waits for its value, suggestions follow what you type, and Enter, Tab or a space after a whole value finishes it. Backspace reopens or cancels chips. The same search field is in the Compendium, every compendium dialog and Spotlight, so Spotlight can filter too. See [typed filters](docs/compendium.md#typed-filters).
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

The compendium follows Core Rules 3.3 and the 3.1 class books.

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

Player campaigns and character sheets: Ember Vault for the other side of the table.

### Added

- Player campaigns: set a campaign to "I play in it" and the plugin switches to the player side, with lore cards instead of stat blocks, battle notes instead of encounter blocks, and your party front and center. The campaign switcher doubles as the view switcher. See [playing in a campaign](docs/players.md).
- Character sheets: a `nimble-sheet` block turns a note's properties into a full Nimble sheet, with HP and mana bars and a damage calculator, stats and skills, actions and reactions, weapons, spells, inventory and features. Everything you change is saved back to the note. See the [character sheet guide](docs/character-sheets.md).
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

The 3D dice overhaul and the Dice Workshop.

### Added

- 3D dice overhaul: new looks, Dice So Nice and Rollsmith imports, effects, and the Dice Workshop. See the [dice guide](docs/dice.md).

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

The first release as Ember Vault.

### Added

- First release as Ember Vault: campaigns, the Nimble bestiary, encounter blocks rated for your party, the combat tracker, GM maps and 3D dice. See [getting started](docs/getting-started.md).
