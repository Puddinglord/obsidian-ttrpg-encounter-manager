# FAQ and troubleshooting

**Is this a virtual tabletop?**
No. Everything is for the GM: your notes, your monsters, your tracker. Players don't connect to anything. To show players a character, open their portrait and use **Show in its own window** to put it on a second screen.

**Do I need the Nimble books?**
The plugin includes the Nimble monsters, conditions and rules text with the creator's permission, so it works on its own. If you enjoy Nimble, please support it by buying the books at [nimbleRPG.com](https://nimbleRPG.com).

**Can I use it for another system?**
Campaigns, NPC cards, boxes and maps work with any game. The bestiary, encounter difficulty and tracker follow Nimble's rules. You can turn the bundled bestiary off and write your own stat blocks.

**A monster reference shows as unknown.**
The name has to match a bundled monster or a note in your vault that has a `nimble` stat block. Check the spelling in the bestiary, or use `/monster` to insert it with autocomplete.

**My encounter is rated against the wrong party.**
Inside a campaign, encounters use that campaign's party. Outside, they use the party in settings. The line under the encounter block ("4 heroes, level 2") shows which, and clicking it opens that party.

**I changed a monster but the old version still shows.**
A note with the same name as a bundled monster replaces it. Use **Copy to vault** in the bestiary to make an editable copy, then edit that note.

**The 3D dice don't appear.**
They switch off by themselves without WebGL, or when your system asks for reduced motion. On phones they're off unless you turn on **3D dice on phones** in settings. A d100 or other odd-sized die, or more than 12 dice at once, shows just the result.

**Does it work on mobile?**
Yes. See [Phone and iPad](mobile.md).

**Does the plugin use the internet?**
Only when you ask it to. Importing a dice set by link downloads it from the address you give (a module.json you import, as a link or a file, points at the set's download, and that is fetched too). An NPC portrait you set to an `https://` image URL is loaded from that address. Nothing else goes online, and no data about you or your vault is sent anywhere. It writes to the clipboard only when you select a **Copy** button.

**Where's my data?**
Encounters, stat blocks, maps and NPC cards are text in your notes. The party, the tracker's current fight and map token positions are in the plugin's `data.json` inside your vault's `.obsidian` folder.

**Something's broken.**
Open an issue on [GitHub](https://github.com/Puddinglord/obsidian-ttrpg-encounter-manager/issues). Include your Obsidian version, the plugin version, and what you expected to happen. A screenshot helps. If there's an error, it's in the developer console (Cmd/Ctrl+Shift+I → Console).
