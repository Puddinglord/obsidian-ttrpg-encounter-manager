# FAQ and troubleshooting

**Is this a virtual tabletop?**
No. Everything is for the GM: your notes, your monsters, your tracker. Players don't connect to anything. To show players a character, open their portrait and use **Show in its own window** to put it on a second screen.

**Do I need the Nimble books?**
The plugin includes the Nimble monsters, conditions and rules text with the creator's permission, so it works on its own. If you enjoy Nimble, please support it by buying the books at [nimbleRPG.com](https://nimbleRPG.com).

**Can I use it for another system?**
It runs [5e](5e.md) campaigns as well as Nimble, each in its own book's look. For another game, campaigns, NPC cards, boxes and maps work as they are; the bestiary, encounter difficulty and tracker follow Nimble's or 5e's rules. You can turn the bundled bestiary off and write your own stat blocks.

**Can I make my own monsters, spells and items?**
Yes. The [builder](builder.md) (**New monster…**, **New spell…**, **New item…**) fills in the books' numbers for the level or tier you pick and writes an ordinary block into a note. You can also write the blocks by hand; homebrew spells and items join the compendium and the character sheet's Add spell and Add item.

**Can I add my own class, ancestry or subclass?**
Yes. Press **+** on the compendium's Classes or Origins tab and fill in the block it writes (see [Your own content](homebrew.md)), or bring in a [content pack](content-packs.md). Either way the class works in New character, Level up and the sheet like the books' classes, and a subclass or a new option joins a class that's already there.

**My 5e character's class isn't in the SRD. Can I still use it?**
Yes, if you own it on D&D Beyond. [Import the character](import.md#what-it-brings-into-your-compendium) and its class, subclass, feats, spells and items join your compendium, tagged Imported, and work in New character and Level up. D&D Beyond only includes features up to the character's level; import again after they level up to fill in the rest.

**A stat block says some lines "aren't shown as written".**
A line in a ```` ```nimble ```` block you wrote couldn't be read: a misspelled field, a missing colon, list items with no heading, attacks under `abilities:`. Click the line under the stat block to see which ones and why, and use **Fix** where it's offered. See [When a line isn't shown](bestiary.md#when-a-line-isnt-shown).

**A monster reference shows as unknown.**
The name has to match a bundled monster or a note in your vault that has a `nimble` stat block. Check the spelling in the compendium, or use `/monster` to insert it with autocomplete.

**My encounter is rated against the wrong party.**
Inside a campaign, encounters use that campaign's party. Outside, they use the party in settings. The line under the encounter block ("4 heroes, level 2") shows which, and clicking it opens that party.

**I changed a monster but the old version still shows.**
A note with the same name as a bundled monster replaces it. Use **Copy to vault** in the compendium to make an editable copy, then edit that note.

**The 3D dice don't appear.**
They switch off by themselves without WebGL, or when your system asks for reduced motion. On phones they're off unless you turn on **3D dice on phones** in settings. A d100 or other odd-sized die, or more than 12 dice at once, shows just the result.

**Can I import monsters from another site or tool?**
Yes, from many: Nimble Nexus, 5etools, Open5e, Watabou, donjon, D&D Beyond, Fantasy Statblocks, or a stat block copied out of a PDF. See [Importing](import.md). For a tool it doesn't know, write a [mapping file](mapping-files.md).

**Can I use 5e monsters in my Nimble game?**
Yes. Import them into a Nimble campaign and they're converted on the GM Guide's numbers. See [Convert 5e monsters to Nimble](import.md#convert-5e-monsters-to-nimble).

**Does it work on mobile?**
Yes. See [Phone and iPad](mobile.md).

**Does the plugin use the internet?**
Only when you ask it to. Importing a dice set by link downloads it from the address you give (a module.json you import, as a link or a file, points at the set's download, and that is fetched too). An NPC portrait you set to an `https://` image URL is loaded from that address. In Import…, a link you paste is fetched only when you choose **Fetch from…**, and only that page's data. Nothing else goes online, and no data about you or your vault is sent anywhere. It writes to the clipboard only when you select a **Copy** button.

**Where's my data?**
Encounters, stat blocks, maps and NPC cards are text in your notes. The party, the tracker's current fight and map token positions are in the plugin's `data.json` inside your vault's `.obsidian` folder.

**Something's broken.**
Open an issue on [GitHub](https://github.com/Puddinglord/obsidian-ttrpg-encounter-manager/issues). Include your Obsidian version, the plugin version, and what you expected to happen. A screenshot helps. If there's an error, it's in the developer console (Cmd/Ctrl+Shift+I → Console).
