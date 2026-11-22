# Importing characters and creatures

Bring a 5e character from D&D Beyond (and its class, subclass, feats, spells and items, into your compendium), or a creature from the Fantasy Statblocks plugin, into a 5e campaign.

Ember Vault never connects to D&D Beyond. It only reads the text you paste or the file you choose.

## A D&D Beyond character

### 1. Make the character public

D&D Beyond only shares public characters.

1. Open the character on D&D Beyond.
2. Choose **Manage**, then **Character Settings**.
3. Under **Character Privacy**, choose **Public**.

### 2. Get the character's data

1. In Obsidian, run **Import a D&D Beyond character…** from the command palette (**Ctrl+P**, or **Cmd+P** on a Mac).
2. Paste the character's link (from your browser's address bar, like `https://www.dndbeyond.com/characters/123456789`) into the top box, and choose **Open the character's data**.

3. The page is a wall of text. That's the character. Do one of these:
   - Select all of it (**Ctrl+A**, or **Cmd+A** on a Mac) and copy it (**Ctrl+C** or **Cmd+C**). In Firefox, click **Raw Data** first.
   - Or save the page as a file (**File → Save Page As…**).

If the page says "Unauthorized Access Attempt", the character isn't public yet. Go back to step 1.

### 3. Import it

1. Back in the import window, paste the text into the big box, or choose the file you saved.
2. Check what it found. Under the character is what it brings into your compendium (see below). Untick anything you don't want.
3. Choose **Import**.

You get a character note with a 5e sheet, and a note in your compendium for each entry you kept ticked.

### What comes across

Name, class and level, subclass, species or race, background, ability scores, hit points, skills, spells, gear, coins (as gold) and feats.

The character note holds only names and numbers. The sheet finds each name's text in the compendium: the SRD's, your [content packs](content-packs.md), your own notes, and what the character brought in.

### What it brings into your compendium

A character's data carries the full text of what it plays: its class with its features at each level, its subclass, species, background, feats, spells and items. Import adds those to your compendium, so a class the SRD doesn't have (one from a book you own on D&D Beyond) works like the SRD's: in **New character**, **Level up**, the sheet and the compendium.

The import window lists it all before anything is written:

![The import window: Mira Hollowell, a level 7 Hollowblade, and what she brings for the compendium: her class, subclass, background, a feat, a spell, a magic item and a weapon, all ticked; Elf, Alert, Light and Longsword already in the SRD; and a note that D&D Beyond only gave the class's features up to level 7](images/guide-ddb-import.png)

> Hollowblade (class, levels 1–7 seen), Order of the Quiet Lantern (subclass), Elf (species), Grave Tender (background), 2 feats, 2 spells, 3 items: 4 already in the SRD

- **Ticked:** everything new. Untick what you don't want.
- **Already in the SRD:** left out. The SRD's version is used, so there's one of each name. If D&D Beyond's version is clearly different (homebrew, or another hit die, spell level or rarity), it comes in as its own entry, named `Fireball (D&D Beyond)`, and the character note uses that name.
- **Already imported** (from this character or another): left as it is.
- **Already yours:** a note or pack of yours with that name is never touched.

Each entry is a note in your content folder, under `Ember Vault/Content/5e/`: `Classes/Hollowblade.md`, `Spells/Lantern Lance.md` and so on. The compendium tags them **Imported**, and `source:Imported` or `is:imported` finds them. Each block says where it came from:

```5e-feat
name: Hollow Focus
imported: D&D Beyond
ddbId: 940001
type: general
prerequisite: Level 4+, Hollowblade
desc: |-
  You gain the following benefits.
  **Ringing Blade.** Your Hollow Strike die increases by one size against undead.
```

`ddbId` is how a later import finds it, so keep it if you edit the note. These notes are your own copy of what you own on D&D Beyond, for your own vault.

### Higher levels later

D&D Beyond only includes a class's features up to the levels in the character's data. When levels are missing, the import window says so: "D&D Beyond only gave Hollowblade's features up to level 7."

After the character levels up, import them again (or run **Import content…** with their data). The class shows as ticked, tagged with what it gains ("levels 8–9"), and Import adds those levels to the note you already have. Anything you changed in it stays.

### Only the content

**Import content…** takes a character's data too. It adds the character's content to your compendium without making a character note.

A few things to check after importing:

- **Rules.** Ember Vault works out whether the character uses the 2014 or the 2024 rules. If it got it wrong, change `edition` on the note.
- **More than one class.** The sheet shows the first class, at the character's total level. The other classes are listed on the note under `classes`.
- **Feats** show on the sheet, with their text from the compendium.

The import window lists anything else that didn't come across.

A character's data doesn't hold a class's spell list, so **New character** and **Level up** have no spells to offer an imported class that casts. Add spells on the sheet with **Add spell**, or give the class a `spellList` on its note (`spellList: Wizard` casts from the Wizard's). A feature's options (a fighting style's styles) come in as the feature's text.

## A Fantasy Statblocks creature

1. Open the note with the creature's `statblock` block.
2. Copy the block: everything from ```` ```statblock ```` to the closing ```` ``` ````.
3. Run **Import a Fantasy Statblocks creature…** from the command palette.
4. Paste it, or choose a `.json` file of creatures.
5. Choose **Import**.

You get a 5e stat block (```` ```5e ````) that works in encounters and the combat tracker, like any [stat block you write yourself](bestiary.md).

Lair actions, regional effects and mythic actions have no place of their own in a 5e stat block, so they go in its description.
