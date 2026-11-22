# Changelog

What changed in each release of Ember Vault. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

New work goes under `## [Unreleased]`, sorted into Added, Changed and Fixed. A line of its own before the first of those is the release's headline: the changelog page on the site uses it as the title, and it's what shows when you share the release's link. Link the guide page an entry is about, repo-relative (`See the [builder guide](docs/builder.md).`): the site shows it as a Guide pill, and the release notes point it at the guide on the site. When a pull request merges, the release workflow moves that section under the new version number and uses it for the release notes.

## [Unreleased]

### Fixed

- The repository passes Obsidian's plugin review again. The design study kept in the repo loaded fonts from the web in its CSS and used CSS that Obsidian 1.6.5 only partly supports. The plugin itself doesn't change.

## [2.0.0] - 2026-11-22

Ember Vault runs 5e campaigns as well as Nimble, and every screen now looks like its game's own book.

### Added

- All of Obsidian wears your campaign's game: notes, sidebars and tabs turn to 5e's parchment and oxblood or Nimble's page and charcoal as you move between campaigns, in light and dark, with the game's headings. **Theme Obsidian to match the game** in settings turns it off. See [your game's look](docs/campaigns.md#your-games-look).
- The encounter tracker opens as a page in a tab: the swords icon in the ribbon, **Open encounter tracker in a tab**, or **Open in a tab** in the tracker's ⋯ menu (which offers the sidebar when it's already a page). A tracker in a tab and one in the sidebar show the same fight. See the [tracker guide](docs/tracker.md#where-it-opens).
- 5e campaigns, with the 2024 rules (SRD 5.2) or the 2014 rules (SRD 5.1). Pick **Game system** in **New campaign** or **Campaign settings…**; everything else about campaigns works as before. See the new [Playing 5e](docs/5e.md) guide.
- Both SRD bestiaries (341 and 334 monsters), ```` ```5e ```` stat blocks laid out the way each edition prints them, with clickable attack bonuses, saves, checks and damage, and `` `5e:Goblin` `` references with the CR, a hover card and a quick look. **Copy to vault** makes a book monster your campaign's own. See [Playing 5e](docs/5e.md#monsters).
- 5e encounters: an encounter block in a 5e campaign shows XP and difficulty by its rules (2024's XP budget, or 2014's thresholds and multipliers), and **Run** starts the fight in a 5e combat tracker with initiative order, turns and rounds, temporary HP, death saves, legendary actions and conditions. See [Playing 5e](docs/5e.md#encounters).
- The 5e compendium: spells, magic items, equipment, classes with their level tables, species and races, backgrounds, feats, rules and conditions from both SRDs, with `` `5e:spell:Fireball` ``-style references, autocomplete and Omnisearch. See [Playing 5e](docs/5e.md#the-5e-compendium).
- Slash commands in 5e campaigns: `/monster`, `/spell`, `/item`, `/equipment`, `/class`, `/species`, `/background`, `/feat`, `/rule` and `/compendium` write `5e:` references from the campaign's edition; `/encounter 4 goblin warrior, ogre` writes a block rated by the edition's rules; `/statblock`, `/add` (into the 5e tracker) and `/roll +5` with advantage or disadvantage. `/party-table` heads the defense column AC. See the [slash commands guide](docs/slash-commands.md#in-a-5e-campaign).
- The 5e compendium searches like Nimble's: typed filters that become chips (`cr:1/4 type:undead`, `school:evocation level:3`, `rarity:rare`, `weapon:martial prop:finesse`), sorting, keyboard navigation and a filter panel. Enter adds a monster to the fight or inserts a reference. The 5e slash commands and Omnisearch take the same filters. See [Playing 5e](docs/5e.md#the-5e-compendium).
- 5e builders: **New monster…**, **New spell…** and **New item…** (and `/new-monster`, `/new-spell`, `/new-item`) work in 5e campaigns. Proficiency, XP, hit points, saves, skills, passive Perception and attacks follow from what you fill in, worded for your edition. Spells and items are written as new ```` ```5e-spell ```` and ```` ```5e-item ```` blocks that references, autocomplete, `/spell`, Omnisearch and the compendium find before the SRD's. The pencil on a block reopens it in the builder. See [Playing 5e](docs/5e.md#make-your-own).
- Content packs: JSON files in your vault (`Ember Vault/Content`) add monsters, spells, magic items, equipment, feats, backgrounds, species, classes and subclasses to 5e, everywhere the SRD's show up. **Import content…** checks a pack and says, entry by entry, what it left out and why. A campaign can pick its packs with `packs:` on its home note. A note in your vault beats a pack, and a pack beats the SRD. See the new [Content packs](docs/content-packs.md) guide, with an example pack and a JSON Schema for editors.
- The 5e combat tracker has Nimble's HP keypad: tap a combatant's HP for Damage, Heal, Set or Temp, with Crit, Vulnerable (doubled) and Resisted (halved), and see where it lands before you apply it. The HP box takes `7v` and `7r` too. See [Playing 5e](docs/5e.md#the-5e-combat-tracker).
- Drag a row in the 5e combat tracker to change the turn order once the fight is running (on touch, drag the grip). The moved creature takes the initiative of the one above it and keeps the place you dropped it, round after round. **Move up** and **Move down** are in the row's menu. Rows show AC in a proper shield, and conditions on their own line under the name. See [Playing 5e](docs/5e.md#the-5e-combat-tracker).
- 5e NPCs: NPC notes in a 5e campaign get `ac`, `hp`, `cr` and `statblock` properties, and the NPC card shows the GM a small character sheet: AC in its shield, an HP bar you can change, abilities with save rolls, skills, senses and attacks with their damage. **Add to fight** puts the NPC in the 5e tracker under their own name, on the HP the note says. Its numbers come from a stat block or from stats you type into the note. Players never see stats. See [Playing 5e](docs/5e.md#npcs).
- 5e character sheets: **New character** in a 5e campaign walks you through class, species, background, abilities (standard array, point buy or your own, with each edition's bonuses), skills, subclass and spells, with the sheet's numbers beside you. It makes a note with a ```` ```5e-sheet ```` sheet that works out saves, skills, AC, attacks, spell DC and slots and features, rolls everything, and tracks HP, death saves, slots, rests and levels. The encounter party comes from the sheets. **Level up** walks through hit points, a subclass when it's time, an Ability Score Improvement or a feat, and new spells. See [Playing 5e](docs/5e.md#character-sheets).
- Import a D&D Beyond character into a 5e campaign: **Import a D&D Beyond character…** turns a public character's data into a character note with a 5e sheet (class, level, species, background, ability scores, hit points, skills, spells, gear, gold and feats). Ember Vault never connects to D&D Beyond; you paste the data or choose the file. See the [import guide](docs/import.md).
- Import a Fantasy Statblocks creature: **Import a Fantasy Statblocks creature…** turns a `statblock` block (or a JSON file of creatures) into a ```` ```5e ```` stat block. See the [import guide](docs/import.md).

- Rules words are clickable. In 5e stat blocks, compendium pages and character sheets, AC, Str, Darkvision, Passive Perception, Common, Prone and the rules in a monster's actions open a card with the rule from the SRD, and **Open in compendium** goes to its page. See [Playing 5e](docs/5e.md#rules-words).
- Nimble's conditions, stats (STR, DEX, INT, WIL), Concentration and languages open the same cards. See the [compendium guide](docs/compendium.md#rules-words).
- The 2024 Rules tab has SRD 5.2's Rules Glossary, and both editions list the six abilities, the skills and the languages. See [Playing 5e](docs/5e.md#the-5e-compendium).
- Encounter settings for each game, in the settings page and the tracker's **⋯** menu. 5e can leave heroes' initiative for players to type in, or monsters' too. See the [settings guide](docs/settings.md#5e).
- Maps in a 5e campaign show the 5e fight as tokens, like Nimble's encounter in a Nimble campaign. See the [maps guide](docs/maps.md).
- Timed conditions in both trackers. A condition can last some rounds and fall off by itself, counting down at the start or end of its creature's turn or the caster's, or last until a save ends it. It can deal damage, call for a save or show a reminder at the start or end of each of its creature's turns, and the tracker asks you when it comes up: "Ogre is Burning: 1d4 Fire damage", **Roll 1d4 and apply**. 5e's 2024 rules bring Burning ready-made. See [Playing 5e](docs/5e.md#timed-conditions).
- Make a condition on the spot: type a new name in a tracker's condition list, set how long it lasts and what it does, and keep it for next time. See the [tracker guide](docs/tracker.md#timed-statuses).

- Quests, places and sessions open on a card in your campaign's look. A quest shows its status, who gave it, where, the reward, objectives you can tick and the GM's secret; a place shows who's there (NPCs whose `location:` it is) and where it leads, with its monsters in Nimble and a boxed read-aloud in 5e; a session shows who was at the table, what happened, which quests moved, the loot and what's next. Sections the card already shows don't appear twice. See the [quests guide](docs/quests.md).
- The Campaign panel wears the campaign's look and lists its open quests with their status. See the [campaigns guide](docs/campaigns.md#the-campaign-panel).
- Nimble NPCs can carry the book's numbers: `level`, `armor`, `hp` and `statblock` show on the card as the level, the armor letter on its shield, HP in a heart and a link to the monster block, with **Add to fight**. See the [NPCs guide](docs/npcs.md#an-npcs-numbers).
- Dice rolled at the table go straight onto the sheet. Tap a held Fury or Judgment die to change its face, or an empty slot to add one you rolled. See the [character sheets guide](docs/character-sheets.md#class-dice).
- A Nimble class feature's rules are one tap away: the arrow beside its name opens the book's words. Features used once per rest (One with the Ancients, Steel Will) track their uses, and Hunter's Mark remembers its quarry. See the [character sheets guide](docs/character-sheets.md#the-class-panel).
- The Nimble tracker brings in a legendary monster's turn after each hero ("Done · Krogg acts"), with its actions to pick from; turn it off in the encounter settings. The damage keypad has quiet **Defend** and **Interpose** chips for a hero who takes a hit. See the [tracker guide](docs/tracker.md#legendary-monsters).
- Keys in both trackers: ↑ and ↓ move through the fight, Enter puts someone on the card, Space presses the main button (Done, Next) and Z undoes. See the [tracker guide](docs/tracker.md#keys).

- New character lets you place your stat array: the numbers start where your class puts them, and tapping two stats swaps them, with your key stats and ▲ ▼ saves marked on the sheet's own boxes. See the [character sheets guide](docs/character-sheets.md#making-a-character).
- A Nimble hero who starts above level 1 goes through every level's steps: hit points, subclass, your class's picks, spells, stat increases and skill points. Choose class gear or 25 gp a level, and add Heroic Skills if your GM allows them. See the [character sheets guide](docs/character-sheets.md#making-a-character).
- Levelling up a Nimble hero asks for the spell schools and Utility Spells your class learns, a Beastmaster's companion, and a Commander's extra Combat Ability or +1 max Combat Dice. See the [character sheets guide](docs/character-sheets.md#levelling-up).
- The 5e monster builder covers the whole stat block: armor and a shield set the AC, speeds and senses as numbers, 2024 initiative and lair XP, immunities as chips, melee-or-ranged attacks with extra damage, saving-throw actions with their DC, Recharge and per-day uses, and spellcasting with its save DC. A Goblin, an Ogre or an Adult Red Dragon built this way comes out with the book's numbers. See the [5e guide](docs/5e.md#building-a-monster).
- The 5e spell builder words a spell attack or saving throw, its area and its higher-level or cantrip damage the way the SRD does, and picks range, duration and a reaction's trigger for you. See the [5e guide](docs/5e.md#building-a-spell).
- The 5e item builder makes weapons, armor and gear with their numbers (damage, properties, mastery, AC, Strength, Stealth, cost, weight), and magic items with a +1 to +3 and charges. Character sheets use your items: a magic longsword attacks as a longsword with its bonus. See the [5e guide](docs/5e.md#building-an-item).
- 5e's New character asks for everything the SRD gives you: spells known or prepared (a wizard's spellbook), expertise, your class's options and weapon masteries, your species' and background's choices (with 2014 subraces' bonuses and skills), tools and languages, rolled scores or the array swapped between abilities, starting equipment or gold, and every increase when you start above level 1. It asks before throwing away a character you've started, and the sheet shows only the options you chose. See the [5e guide](docs/5e.md#character-sheets).
- 5e's Level up asks for new cantrips and spells by count, expertise and your class's new choices, and a feat's own +1, and shows the level's new features and spell slots. See the [5e guide](docs/5e.md#character-sheets).
- A content pack's 5e class works in New character, Level up and the sheet like an SRD class, including its own spell list, prepared column and limited-use features. See [content packs](docs/content-packs.md).

- Content packs work in Nimble: add your own classes, subclasses, class options, ancestries, backgrounds, spells, items, monsters, boons, rules and conditions as a JSON file. They show up in the compendium tagged with the pack's name, and in New character, Level up, the sheet, references, Omnisearch and Add to fight. **Import content…** takes Nimble packs and says what it left out and why. See the [content packs guide](docs/content-packs.md).
- A pack's Nimble class levels up like a book's: its subclass joins it, a new option joins its class's list (a new Savage Arsenal ability for the Berserker), and the class's own dice go into rolls the way Fury and Judgment Dice do. See the [content packs guide](docs/content-packs.md).

- Make your own classes, subclasses, feats, species, ancestries, backgrounds, boons, rules and conditions from the compendium: press + on its tab, give it a name, and fill in the block Ember Vault writes. It shows in the compendium tagged Homebrew and works in New character, Level up, the sheet, references and Omnisearch like the books' own. See the [guide to your own content](docs/homebrew.md).
- Type content by hand: a ```` ```5e-class ````, ```` ```nimble-ancestry ```` or any other kind's block in a note in your content folder, with the same fields as a content pack. Reading view shows it as its compendium card, with anything that needs fixing listed under it. See the [guide to your own content](docs/homebrew.md).
- Classes can say more than their wording: in 5e, uses from a formula ("Charisma modifier", at least 1), a class's or background's own starting equipment and tool choices, and options grouped by `group`; in Nimble, dice that grow by level or subclass, the states and target a class panel keeps, and a feature's stat increase, spell picks and uses per Safe Rest. See [content packs](docs/content-packs.md).

- Importing a D&D Beyond character brings its class, subclass, species, background, feats, spells and items into your compendium, tagged Imported, so a class the SRD doesn't have works in New character, Level up and the sheet. You choose what comes in; what the SRD already has is left out. Import the character again after they level up and their class fills in the levels it was missing, keeping any changes you made. **Import content…** takes a D&D Beyond character's data too and adds just its content. See the [import guide](docs/import.md).

- Nimble: New on the compendium's Classes, Features and Origins tabs opens a builder for a class, subclass, class option, ancestry, background or boon, so you never type a block. A class gets its key stats and saves on the sheet's stat boxes, its gear and magic, its own dice and pools, each level's features and what they grant, its option lists and a book class's scrollwork motif, and beside it you see what each level grants the way Level up will ask. The pencil on any of those blocks opens it in its builder again. See the [homebrew guide](docs/homebrew.md#nimbles-builders).
- Nimble: a class from a pack or your notes can say in its data what the books say in words: spell tiers, a list's next tier, what a feature gives outright, an Epic Boon, a subclass's swaps and companions, and dice that grow by level. Level up and the sheet read it first. See the [content packs guide](docs/content-packs.md#nimble).

- 5e: New on the compendium's Classes, Origins and Feats tabs opens a builder for a class, subclass, species (or race), background or feat. There's no YAML to type, the compendium card sits beside you, and for a class you see what each level grants. A class fills in its own level table: proficiency bonus, spell slots for full, half, third and pact casters, and cantrips and spells like an SRD class's or your own numbers. The pencil on the block opens it again. See the [5e builders](docs/homebrew.md#5e-builders).
- Your own 5e species, lineages, subraces and backgrounds can give skills, languages, tools and a cantrip, or let you choose them, and a subclass can list spells it always has prepared; New character and Level up ask for and add them. See [what the sheet and level up read](docs/homebrew.md#classes-what-the-sheet-and-level-up-read).
- New character and Level up offer your own 5e spells, homebrew or imported, to the classes they name, and Level up lets a 5e Bard, Sorcerer or Warlock (and a 2014 Ranger) swap a spell they know for another. See [Playing 5e](docs/5e.md#make-your-own).

- NPCs with stats can go in an encounter block: `- [[Ysolde Krenn]]` shows them under their own name with their numbers, counts them in the difficulty, and Run brings them in. See the [encounters guide](docs/encounters.md).

### Changed

- Hunter's Mark takes your Quarry in your own words ("Goblin 2", "the one in the red scarf"), as a reminder for you; nothing is picked from the fight. Its box has Clear mark for when the day is over. See the [character sheets guide](docs/character-sheets.md#the-sheet).
- Spotlight, the Cmd/Ctrl+K search box, is now called Omnisearch, since Daggerheart's turns use the word spotlight. The key, the command and any hotkey you gave it stay the same. See the [Omnisearch guide](docs/omnisearch.md).
- A Nimble hero's Armor is called Defense, as Core 3.3 calls it: on the sheet, the tracker, the quick look, Defend on the HP keypad, and an armor's number in the compendium ("2+DEX Defense"). Monsters keep Medium and Heavy Armor. Your notes don't change. See the [character sheets guide](docs/character-sheets.md).
- Each campaign keeps its own fight. Opening a note in another campaign switches the tracker to that campaign's encounter, and to its game's tracker (Nimble's or 5e's); going back brings the first fight back. See the [campaigns guide](docs/campaigns.md).
- Clicking a map pin shows its note in a quick look over the map instead of opening the page; Cmd/Ctrl-click still opens it. **Show pin labels** now shows labels on small maps too. See the [maps guide](docs/maps.md).
- Pips work the same in both games: tap a filled pip to take one away, an empty one to add one, and the one that changed animates. 5e's legendary actions, death saves and spell slots use them. See [Playing 5e](docs/5e.md#the-5e-combat-tracker).
- Each game has its own look, light and dark. Nimble's is its official sheet and books: parchment, warm charcoal, heavy italic names, khaki ribbons, red for HP and blue for mana. 5e's is its book: warm paper, oxblood and gold, small-caps names. The typefaces come with the plugin, and the icons are new and heavier, so they read at arm's length on an iPad. See the [character sheets guide](docs/character-sheets.md) and [Playing 5e](docs/5e.md).
- Both trackers show whoever is acting on a big card (HP, conditions, **Damage** and **Heal**, then the condition and stat block buttons), with everyone else in a queue below. In Nimble, heroes go in any order: tap whoever speaks up, and their side and the monsters' each say who has acted. In 5e the queue splits into who's still to act and who has acted this round, identical monsters share one initiative and the card steps through them, and tapping someone out of turn reshuffles nobody. The button at the bottom names the next step (**Done**, **Next: Ogre**), with **Back** beside it. See the [tracker guide](docs/tracker.md) and [Playing 5e](docs/5e.md#the-5e-combat-tracker).
- **Add to fight** on a 5e monster's quick look and hover card, wherever they open from (Omnisearch, references, the compendium). In Omnisearch, Cmd/Ctrl+Enter adds a 5e monster and keeps searching, and `3 goblin warrior` adds three, like Nimble's. See [Playing 5e](docs/5e.md#monsters).
- The 5e tracker tracks concentration (it gives the save's DC when someone concentrating takes damage) and Legendary Resistance, and conditions open with their rules and how long they last. See [Playing 5e](docs/5e.md#the-5e-combat-tracker).
- 5e encounter blocks show each group's CR, AC and HP, and a bar of the fight's XP against the party's thresholds. See [Playing 5e](docs/5e.md#encounters).
- The 5e character sheet is set like the book and takes the whole page: an oxblood banner with the portrait, AC shield, initiative, speed and proficiency; a framed band with the HP bar and keypad, hit dice and Heroic Inspiration; the six abilities as plaques with their saves and skills; the class's scrollwork; and tabs for Actions (grouped as the book groups them, damage showing its type), Spells (with their slots), Features (each opens to its rules) and Inventory. Limited-use features track their uses. See [Playing 5e](docs/5e.md#character-sheets).
- The Nimble character sheet follows the official sheet: notched stat boxes with their save marks, Armor and Initiative, Wounds as a chain ending in a skull, Hit Points as a wide bar with − and + and the keypad, the skills band, the Actions bar, and one panel for every class's own things (dice you hold, a pool, uses, a state, a target) under the class's scrollwork. Reactions are cards with what they cost. It holds together from a phone to a full-width note. See the [character sheets guide](docs/character-sheets.md#the-sheet).
- Stat blocks look like the books: Nimble's are the GM's Guide box (heart HP, the armor shield, passives on a khaki ribbon, legendary actions beside Bloodied and Last Stand); 5e's follow the 2014 and 2024 SRD layouts. The same block shows in notes, the compendium, hover cards and the tracker's quick look. See the [bestiary guide](docs/bestiary.md) and [Playing 5e](docs/5e.md#monsters).
- The condition picker says what each condition does, and encounter blocks wear their game's look. See the [tracker guide](docs/tracker.md#timed-statuses).
- 5e's New character and Level up show the character in brief beside every step; abilities are a card each, with point buy's points left; spells are grouped by level. See [Playing 5e](docs/5e.md#character-sheets).
- The compendium looks like your campaign's game, in its tab, its dialog and every picker: Nimble's on the sheet's parchment, 5e's on the book's paper. Each row leads with a monster's level in a box (a CR in gold, in 5e), a spell's tier or an icon, then dark tags and the facts as chips, and every entry reads like its book. Class pages open under the class's scrollwork. See the [compendium guide](docs/compendium.md).
- Omnisearch and the "/" menu wear the campaign's look, with the compendium's level boxes and icons in their rows. See the [Omnisearch guide](docs/omnisearch.md).
- Dialogs wear the game's look: its paper and type, with Cancel beside the main button. The roll dialog shows the dice it will roll, slides between Check and Save and through Advantage, has the modifier on keypad keys, and lists class dice as tiles you tap in. Advantage is no longer green and red; its label says it ("Advantage 2"). See the [character sheets guide](docs/character-sheets.md#rolling).
- A roll's result shows its die, what was rolled, the dice and the total in the game's figures, with **CRIT** or **MISS** as a tag. See the [dice guide](docs/dice.md#the-rolls-result).
- **Add several…** takes the count on keypad keys and has **Weaker**, **Normal** and **Tougher** as three equal choices, with what you'd get beside them. See the [encounters guide](docs/encounters.md#several-at-once).
- The encounter builder shows the rating as the encounter block's tag over a meter that names each band, links the party it's rated against, and lists the monsters and the fight as rows. Balance slides between its targets, in the builder and on the block. See the [encounters guide](docs/encounters.md#the-encounter-builder).
- `nimble:` and `5e:` references take their game's colours: Nimble's charcoal, with spells in mana blue and items in ochre; 5e's oxblood, with items in gold. Hover cards are framed in the look of what they show. See the [compendium guide](docs/compendium.md#referencing-anything).
- Homebrew spell and item blocks show as the compendium's card, framed in the note. See the [builder guide](docs/builder.md#homebrew-spells-and-items-in-your-notes).
- The New monster, spell and item builder wears each game's look, with its verdict as a tag ("Tougher than level 3"). 5e's fits a phone: sizes three by two, and what a field works out to beside its label. See the [builder guide](docs/builder.md).
- The party editor is a dialog in the game's look, with **Add hero** and **Level up**. See the [settings guide](docs/settings.md#party).
- Maps wear their campaign's game: its paper, pill buttons in the toolbar, pins in its colours with an icon for each kind, and tokens as the game's dark discs. See the [maps guide](docs/maps.md).

- Under the hood, Nimble and 5e are separate modules that can't reach into each other (the build checks), so a change to one can't break the other. The plugin itself holds no game: Nimble plugs in the same way 5e does.
- Settings are grouped: what every game shares first (General, Campaigns, Party, Content packs, Dice, Combat), then Nimble's own. See the [settings guide](docs/settings.md).
- Nimble attack rolls (miss on a 1, explode on the max) only apply in Nimble campaigns; 5e attack rolls are plain d20s.

- Nimble's New character and Level up look like the Nimble sheet and fit a phone, and Level up follows your subclass: an Honorseeker picks Honorable Gambits, a Spellblade picks Commander's Orders, and a Muscle Mage skips the Savage Arsenal. See the [character sheets guide](docs/character-sheets.md#levelling-up).
- The 5e builder and character wizard wear the sheet's look: the oxblood banner, ability plaques and proficiency diamonds. See the [5e guide](docs/5e.md#make-your-own).
- The tracker's quick look is in your game's look: its paper and type, buttons like the tracker's, no Obsidian purple. See the [tracker guide](docs/tracker.md).
- A monster that's the only one of its kind shows without a number: "The Alchemist", not "The Alchemist-1". Two or more are still numbered. See the [tracker guide](docs/tracker.md).
- Battle notes in a campaign you play in are in Nimble's look, like the GM's encounter block, and the trackers drop hint lines that repeated what the screen already says. See the [tracker guide](docs/tracker.md).
- Add several says **As written** for the middle strength, like the encounter block, and 5e's compendium tags your spells and items **Homebrew**. See the [encounters guide](docs/encounters.md).

- The compendium's + makes something for the tab you're on and says what: New class or subclass on Classes, New feat on Feats. What you make is tagged Homebrew, with Open note on its page, and `source:Homebrew` and `is:homebrew` find it; a content pack's entries carry their pack's name as a dark tag. See [the compendium](docs/compendium.md#making-your-own).
- A content pack's own 5e Bard gets only the limited-use features it lists. See [content packs](docs/content-packs.md#5e).

- The Import a D&D Beyond character window uses 5e's look. See the [import guide](docs/import.md).

- In a 5e campaign, an NPC card's From a stat block, a sheet's Add spell and Add item, and the tracker's Add monster open the compendium, with its filters and each entry's page. See the [compendium guide](docs/compendium.md#the-compendium-as-a-dialog).
- A name under a place's Who's here, or a quest's Given by, opens the NPC's quick look, like NPC links everywhere else; Cmd/Ctrl-click opens their page. See the [campaigns guide](docs/campaigns.md#places).

### Fixed

- An NPC note written by hand, without a `nimble-npc` block, shows its card and portrait instead of only a row of properties. See the [NPCs guide](docs/npcs.md#character-cards).
- Spell, item and condition references (`5e:spell:Fireball`, `nimble:spell:…`) sit on the line exactly like monster references, instead of a little higher.
- The icons on the quick look's buttons (Add to fight, Open page, Open notes) sit level with their labels instead of a little high.
- Your own 5e spells and items say Homebrew at the foot of their card, not "SRD 5.2". See [Playing 5e](docs/5e.md#the-5e-compendium).
- The Edit pencil shows when you point at a 5e monster, spell or item block, as it does on Nimble's. See the [builder guide](docs/builder.md#opening-it).
- Nimble's Level up no longer asks for a Weapon Mastery at level 14 or a Direbeast form at Stormshifter level 6, a Psion's picks offer every tier they've unlocked, a Hexbinder starts knowing Withered and Frenzied, and Razor Wind's text no longer repeats its range. See the [character sheets guide](docs/character-sheets.md#levelling-up).
- With Vulnerable on, the HP keypad's big number and button show the damage that lands (19 for 9 + 10 in Nimble, 18 for 9 doubled in 5e), matching its sum.
- Defend on a Nimble character sheet's HP keypad takes your Defense off the hit and spends an action. It used to do nothing.
- Omnisearch no longer offers an NPC's role as a `role:` filter, and the Nimble quick look calls a hero's number Defense, as the card and sheet do.
- Renaming a combatant just after a hit no longer saves half the name.
- Import content's summary gets plurals right ("2 classes", "1 species"). See the [content packs guide](docs/content-packs.md).
- Nimble boons in content packs are read: a boon gives its kind as `"type": "epic"`. See [content packs](docs/content-packs.md#nimble).
- With Styled tables on, a 5e class's level table in a note (or a table in a ```` ```5e-spell ````) keeps the compendium's look. See [Playing 5e](docs/5e.md).
- A 2014 Draconic Sorcerer's AC without armor is 13 + Dex, and a 2024 one adds Charisma. See [Playing 5e](docs/5e.md#character-sheets).
- A new Nimble character's sheet shows when you open their note for editing, instead of the sheet block's code. See the [character sheets guide](docs/character-sheets.md).
- Encounter blocks and the encounter builder say "1 hero, level 2" for a party of one, not "1 heroes". See the [encounters guide](docs/encounters.md).
- Done and Next in the Nimble tracker say when a condition wears off, as marking a turn done from its row always did. See the [tracker guide](docs/tracker.md).
- A new Monster note in a 5e campaign starts with a 5e stat block, so the 5e bestiary finds it, and monsters you build with New monster… or import from Fantasy Statblocks get the monster icon in the Campaign panel and the monster pill in links. See the [bestiary guide](docs/bestiary.md).
- Add item on a 5e sheet equips magic weapons and armor, so a +1 longsword shows up as an attack right away, and your own 5e spells and items say Homebrew in the compendium list. See [Playing 5e](docs/5e.md#character-sheets).
- Level up: a 5e feat that raises one ability score raises it without asking, and in a 2014 campaign the tracker's condition list no longer starts each line with a dash. See [Playing 5e](docs/5e.md#character-sheets).
- Content you delete from the content folder leaves the compendium straight away, even right after you changed it. See the [guide to your own content](docs/homebrew.md).
- Renaming or moving a note updates the links to it in map pins, encounter blocks, boxes, NPC card rows, and properties like a session's `quests:` lines, which Obsidian doesn't update itself. See the [campaigns guide](docs/campaigns.md#moving-things-around).
- Clicking a map pin, or a link in a card or box, that goes to a note that doesn't exist says so instead of making an empty note at the top of your vault. See the [maps guide](docs/maps.md).
- A player's battle notes in a 5e campaign show how it went, where, when and the loot, with Edit, like Nimble's; `/fought` offers Fill in the rest… there too. See [Playing in a campaign](docs/players.md#battle-notes).
- New character… in a campaign you run makes a party member, not a hero marked You. See the [character sheets guide](docs/character-sheets.md).
- A quick look in a narrow window keeps the name readable, with its buttons under it, and the compendium's rows no longer cut their last tag in half on narrow screens. See the [compendium guide](docs/compendium.md).
- A Nimble hero's "Level 2" stays on one line in the sheet's heading, and Speed and Hit dice stay inside the turn band in a narrow Character panel. See the [character sheets guide](docs/character-sheets.md).
- Language chips, the damage die button and the compendium's Back to the list on phones line up their icon and label, and the SRD notice in settings stays inside its box in a narrow window. See the [settings guide](docs/settings.md).
- In the dark theme, Nimble's school, key stat, "Yours" and count tags and the choices you've made in New character and Level up, 5e's Bloodied and temp HP ribbons, and the level on 5e monster references are readable. They were light text on a light fill. See the [character sheets guide](docs/character-sheets.md).
- A link to a note in an NPC card's "First met" row or a battle note's place, and feature names on the Nimble character sheet, line up with the rest of their row. See the [NPCs guide](docs/npcs.md).
- On a phone or in a narrow sidebar, the tracker card keeps Damage and Heal whole: they take the full row, and Condition and the stat block (or Sheet) get a row of their own. See the [tracker guide](docs/tracker.md).
- Map pin labels near the edge of the map stay inside it, and token names in the tray keep one line. See the [maps guide](docs/maps.md).
- Dialogs fit a phone-width window: the import file picker, builder choices (now in even rows), the encounter builder's buttons and the party editor; a builder's or wizard's current step stays in view when the window narrows. See the [builder guide](docs/builder.md).
- The compendium shows the list or the page when it's too narrow for both, instead of squeezing the page until names broke mid-word; filter labels no longer wrap, and rows no longer show above a group heading. See the [compendium guide](docs/compendium.md).
- The Character panel's skills fit a 260px sidebar; Omnisearch on a phone gives the name the row; the condition picker's title is the creature's name on one line; a battle's place shows one map pin; and links in an NPC's or a battle's labelled rows stay on one line. See the [character sheets guide](docs/character-sheets.md).
- Buttons keep their whole label in narrow windows: a builder's Next when its label is long, Add several's Add button, the balance targets in the encounter builder, and the compendium picker's tabs on a phone. See the [builder guide](docs/builder.md).
- A tap on a character sheet, the tracker or the quick look no longer gets lost when the note or the fight changes at that moment (tapping HP again right after a hit): the redraw waits until you let go. See the [character sheets guide](docs/character-sheets.md).
- Pressing Enter in a sheet's small boxes (Hunter's Mark, a number, coins, a language, a condition) or a map pin's label no longer opens the box again behind you. See the [character sheets guide](docs/character-sheets.md).

## [1.6.1] - 2026-11-17

### Fixed

- The user guide's style sheet no longer uses `:has()`, which Obsidian's plugin review flags. Phone screenshots in the guide still get their narrower frame.

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
