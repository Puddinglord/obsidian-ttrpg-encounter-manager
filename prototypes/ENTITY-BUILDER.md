# The builder: guided monsters, spells and items

Status: spec, November 2026. Grew out of issue #17, where a GM writing their own stat blocks lost the attacks to a formatting slip. Stage 1 (forgiving stat blocks with quiet hints) has shipped on this branch. This doc covers the rest.

## The idea in one line

A GM should be able to make a monster, a spell or an item without learning the stat block format, and the plugin should know Nimble's numbers well enough to say "that's a level 4 monster" or "a level 4 monster has about 52 HP", whichever way round they work.

## What it does

- **One builder, three kinds.** Monster, Spell and Item share one dialog. It opens on the kind that fits where you are (the compendium's Spells tab opens a spell), and a switch at the top changes it.
- **Two ways in, no question asked.** The first step holds everything a quick build needs. **Create** works from that step; anything you didn't fill in comes from the book's numbers for that level. **Next** walks through the rest. There's no "quick or full?" screen.
- **Level first or stats first.** Set a level and every field you haven't touched follows the book's numbers for it. Type your own HP or damage and the **level check** says what it plays like ("Plays like level 4", with a range). One tap sets the level to match. Fields you've typed are never overwritten; they show how far they are from expected.
- **From a template.** Start from any monster (a Goblin, your own note) and change what you like. Moving its level re-levels the numbers the book's way.
- **Solo and legendary monsters** get HP per hero, Bloodied at half, and Last Stand HP from the GM Guide's legendary table, plus small and big attacks at the expected damage.
- **Spells** get tier from damage (or damage from tier), upcast and cantrip scaling suggestions, and actions and range defaults from the Creator's Kit.
- **Items** get price and rarity guidance, weapon dice by type, and a reminder that a good magic item has a trade-off.
- **It writes ordinary text.** A monster is a ```` ```nimble ```` block in a note, the same as one typed by hand, so the stat block hints, references, the tracker and the bestiary all work with it unchanged.

## Where the numbers come from

Book first. Where books disagree, the newer one wins (GM Guide 3.0 and Core 3.3 over the Creator's Kit).

| What | Source |
|---|---|
| HP by level and armor, damage per attack for 1, 2 or 3 attacks, sample dice, save DC (levels 1/3 to 20, +per level past 20) | GM Guide p.26-27, Monster Builder table |
| Legendary HP per hero and Last Stand per hero by armor, small and big attack damage, save DC | GM Guide p.40, Legendary Monster Builder |
| Armor floors: Medium from level 3, Heavy from 8 (legendary: 4 and 7) | GM Guide p.23, 26, 40 |
| Flavourful abilities, 1d20 × 2 | GM Guide p.27 |
| Minion die by party level; minions as budget | GM Guide p.23 |
| Spell average damage by tier (cantrip 6, then 14, 23, 33, 44, 56, 69, 83, 98, 114) | Creator's Kit p.21 |
| Spell actions (cantrip 1, tiered 2, ranged area 3), Range 8 default | Creator's Kit p.21 |
| Mana = tier, upcast one step per mana, cantrips scale every 5th level | Core 3.3 p.44 |
| Weapons, armor, shields, potions, scroll and wand prices, magic item rarity bands | Core 3.3 p.33-43 |

The 525 bundled monsters check the guesses. With the GM Guide table, the level guess must land within one level for most of the bundled regular monsters (a unit test keeps it honest). Note: Monsters & More monsters run lighter on HP than the table at the same level (level 4: about 40 against the table's 52), because the table assumes the monster has a simple ability. The builder follows the table, and says so.

## The dialog

Same frame as the level-up wizard: a carousel of steps with step chips across the top, Back and Next at the bottom, arrow keys and swipe between steps. What's different:

- **Fixed size.** Every step and every kind is the same size: `min(1080px, 96vw)` by `min(680px, 90vh)` on desktop and tablets. Steps are laid out to fit without scrolling at that size; only long lists (attacks, abilities) scroll inside their own box.
- **Wide, not tall.** Two columns. The form is on the left. The live preview is on the right: the real stat block (or spell or item card) as it will appear, with the level check card above it.
- **Phones.** Full screen. The preview becomes a **Preview** button in the footer that slides up a sheet, and the level check becomes a chip at the top of the step ("Plays like 4 ✓"). Every target is at least 44px.
- **Inputs that fit the field.** Numbers use `inputmode="numeric"` (the number pad on phones) and steppers. Names capitalise words. Dice are built with a count stepper, a die picker (d4 to d20, d44, d66, d88) and a bonus stepper, so nobody types `2d6+3` on a phone keyboard, though a text field accepts it. `enterkeyhint="next"` moves through a step.
- **Chips and segmented controls** use one text size and one height across the dialog. Labels sit above controls, help text under, and numbers that matter (expected HP, damage) sit right of the field in the same row.

### Monster steps

1. **Start.** Name. Start from: Blank, or search any monster to copy. Role: Regular, Solo, Minion. Level: a stepper along Nimble's ladder (1/3, 1/2, 1 … 20), or **Auto** to follow the stats. Size and type.
   Footer: **Create** (quick build) and **Next: Toughness**.
2. **Toughness.** HP (HP per hero for solos) with the expected value beside it. Armor: None, Medium, Heavy, with a note when it's earlier than the book recommends. Movement, with fly, climb, burrow and swim. Saves for solos (STR, DEX, INT, WIL: − 0 + ++). Resistances, immunities, vulnerabilities as chips.
3. **Attacks.** Regular: how many attacks a turn (1, 2, 3) and the die (d8 by default; the book's themes: d4 undead, d6 goblins, d8 humans, d10 beasts, d12 giants, d20 the mightiest). Each attack: name, dice, what else it does. **Suggest dice** fills the book's sample dice for the level. Solo: the line above the attacks, and a small and a big attack at the table's damage. Minion: one attack with the minion die.
4. **Abilities.** Name and text for each. **Roll an ability** picks from the GM Guide's flavourful abilities. Solos: Bloodied (at half HP) and Last Stand (HP per hero from the table), both with suggested wording.
5. **Story.** Description, easier and harder tactics, group, habitat.
6. **Review.** The finished stat block, the level check, and where it's saved. **Create**.

### Spell steps

1. **Start.** Name, school (the six, or your own), tier (cantrip to 9, or Auto), utility or damage.
2. **Casting.** Actions, Range or Reach and how far, area (none, AoE around, cone, line, square), concentration, save.
3. **Effect.** Damage dice against the tier's expected average, what it does, upcast ("+N damage per extra mana", suggested), cantrip scaling.
4. **Review.**

### Item steps

1. **Start.** Name, kind (weapon, armor, shield, consumable, magic item, gear), rarity.
2. **Details.** Weapon: dice, STR or DEX, properties (two-handed, Reach, Range, Thrown, Load, Vicious, Light), price suggested by dice. Armor and shields: Defense, STR needed, price. Consumable: effect and uses. Magic item: charges, what it does, and its catch (the GM Guide: the memorable ones have a trade-off).
3. **Review.**

## Where it's saved

A new note per creation, named after it. In the active campaign you run, monsters go in its `Monsters` folder (where campaign monster notes already live), spells and items in `Homebrew`. With no active campaign, a `Bestiary` or `Homebrew` folder at the vault root. The Review step shows the folder and lets you change it.

## Ways in

- The compendium: a **New** button in the header, set to the tab you're on. On a monster's page, **Use as a template** opens the builder on a copy.
- Commands and Spotlight: **New monster…**, **New spell…**, **New item…**.
- `/monster new`, `/spell new`, `/item new` in a note insert the block where you are instead of making a note.
- Under any ```` ```nimble ```` block in your notes: **Edit in builder** opens it, and saving writes the block back.

## Stages (one PR, a commit each)

1. Forgiving stat blocks and quiet hints. **Done.**
2. Builder math: the GM Guide tables, expected stats, level and tier guesses, re-levelling, d44/d66/d88 averages. Pure and unit-tested against the bundled data. Tougher/Weaker moves onto the same tables. **Done.**
3. The builder frame and the monster builder: quick and full, regular, solo and minion, from a template. **Done.**
4. Spell and item builders, and homebrew spells and items in the compendium. **Done.**
5. Ways in: compendium, commands, slash commands, Edit in builder. **Done.**
6. Phone and layout pass, guide pages, e2e tests, screenshots. **Done.**

## Found along the way

- `parseDice('d44')` rolls one 44-sided die (average 22.5). In Nimble d44 is a tens die and a ones die (average 27.5); d66 and d88 the same. The builder computes their averages correctly; rolling them (and the 3D dice) is a follow-up.
- Tougher/Weaker in the tracker multiplies HP by 1.25 per level. The GM Guide table grows more slowly at high levels (and so do the bundled monsters, about ×1.16 per level): +6 levels on a 40 HP level-4 monster gives 153 HP, where the table says a level 10 monster has 126.
