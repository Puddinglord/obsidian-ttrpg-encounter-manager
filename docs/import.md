# Importing characters and creatures

Bring a 5e character from D&D Beyond, or a creature from the Fantasy Statblocks plugin, into a 5e campaign.

Ember Vault never connects to D&D Beyond. It only reads the text you paste or the file you choose.

## A D&D Beyond character

### 1. Make the character public

D&D Beyond only shares public characters.

1. Open the character on D&D Beyond.
2. Choose **Manage**, then **Character Settings**.
3. Under **Character Privacy**, choose **Public**.

### 2. Get the character's data

1. Look at the character's address in your browser. It ends in a number, like `https://www.dndbeyond.com/characters/123456789`.
2. Open this address, with your number at the end instead of `123456789`:

   `https://character-service.dndbeyond.com/character/v5/character/123456789`

3. The page is a wall of text. That's the character. Do one of these:
   - Select all of it (**Ctrl+A**, or **Cmd+A** on a Mac) and copy it (**Ctrl+C** or **Cmd+C**). In Firefox, click **Raw Data** first.
   - Or save the page as a file (**File → Save Page As…**).

If the page says "Unauthorized Access Attempt", the character isn't public yet. Go back to step 1.

### 3. Import it

1. In Obsidian, open the command palette (**Ctrl+P**, or **Cmd+P** on a Mac).
2. Run **Import a D&D Beyond character…**.
3. Paste the text, or choose the file you saved.
4. Choose **Import**.

You get a character note with a 5e sheet.

### What comes across

Name, class and level, subclass, species or race, background, ability scores, hit points, skills, spells, gear, coins (as gold) and feats.

Only names and numbers come across. Where a name is in the SRD or one of your [content packs](content-packs.md), the sheet shows its text. Anything else shows just its name.

A few things to check after importing:

- **Rules.** Ember Vault works out whether the character uses the 2014 or the 2024 rules. If it got it wrong, change `edition` on the note.
- **More than one class.** The sheet shows the first class, at the character's total level. The other classes are listed on the note under `classes`.
- **Feats** are listed by name in the sheet's features.

The import window lists anything else that didn't come across.

## A Fantasy Statblocks creature

1. Open the note with the creature's `statblock` block.
2. Copy the block: everything from ```` ```statblock ```` to the closing ```` ``` ````.
3. Run **Import a Fantasy Statblocks creature…** from the command palette.
4. Paste it, or choose a `.json` file of creatures.
5. Choose **Import**.

You get a 5e stat block (```` ```5e ````) that works in encounters and the combat tracker, like any [stat block you write yourself](bestiary.md).

Lair actions, regional effects and mythic actions have no place of their own in a 5e stat block, so they go in its description.
