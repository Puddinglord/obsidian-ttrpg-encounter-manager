# Campaigns

Run several campaigns from one vault. Each has its own chapters, scenes, NPCs, session logs, party and fight.

![The Campaign panel beside a scene note](images/campaign-panel.png)

## Start one

Use **New campaign**, from the castle icon in the ribbon or the command palette. First pick whether you **run it** or **[play in it](players.md)**, and its **Game system**: Nimble, or [5e](5e.md) with the 2024 or 2014 rules. For a game you run, give it a name, a starting level and the number of heroes; it creates a folder with a home note, a first chapter and an opening scene. For a game you play in, name it and your character.

## The Campaign panel

The panel in the left sidebar is home base, in the look of the campaign's game. From it you can:

- switch campaigns, and with them between GM and [player](players.md) view (the tag beside the name says **GM** or **Player**); **Campaign settings…** in the same menu changes the name, side, level and game system
- open [Spotlight](spotlight.md) from the search bar under the campaign name, to find adversaries, NPCs and notes or roll dice
- see the party: a card for each hero's character sheet, with their HP
- **Continue** where you left off (**Start** on the first scene, until you've opened one)
- browse chapters and their scenes (map buttons sit on each chapter)
- see the open quests, wherever they're kept, with a dot for each: filled when it's active, a ring while it waits ([quests](quests.md#open-finished-and-failed))
- browse every folder in the campaign: Sessions, Quests, NPCs, Locations, Monsters, Assets, and any you make yourself, like Factions. Empty folders show too. NPCs with a [portrait](npcs.md#portraits) show it as their icon.
- see the files in a folder, not just notes: Assets lists its images and PDFs, and clicking one opens it
- add to any chapter or folder with its **+** button
- reorganize by dragging, or from the right-click menu

### Adding notes and folders

**+** on a chapter or folder opens **New**. Pick what you're making, name it, and press Enter:

| Starter | What you get |
|---|---|
| Note | A blank note |
| Scene | Read-aloud box, what's here, encounter and exits (chapters only) |
| NPC | An NPC with a [character card](npcs.md) |
| Location | A [card](#places), then the overview, people, points of interest, factions, rumors, connections, history and visits |
| Quest | A [card](quests.md#the-quest-card), the hook, objectives, stakes, the truth behind it, clues, complications and rewards |
| Session log | A [card](#sessions) with the party filled in, a prep checklist, recap and loose threads, dated today |
| Map | A map block; pick its image from the campaign's files, or set it later |
| Monster | A stat block the bestiary picks up |
| Handout | Player-facing text and GM notes |

The folder decides what's picked first: NPC in NPCs, Quest in Quests, Scene in a chapter, Session log in Sessions, a blank Note in a folder of your own. In a folder of your own, any starter is saved right there.

A chapter holds its scenes, maps and notes. An NPC, location, quest, monster or handout you make from a chapter's **+** is saved in the campaign's folder for it (**NPCs**, **Locations**, **Quests**, **Monsters**, **Handouts**), so it's listed with the rest and not among the chapter's scenes. The dialog says where it's going before you create it. If you've renamed one of those folders, say NPCs to Characters, that folder is used.

On a folder of files like **Assets**, **+** adds files from your computer or phone instead. Every New dialog also has an **Add files from this device instead** link.

**+** on the **Campaign** heading makes a session log, NPC, location, quest, chapter or **New folder**. The folder icon next to it makes a folder straight away.

### Quests

New campaigns come with a **Quests** folder. Make a quest with its **+**, **New quest** on the **Campaign** heading's **+**, or the **New quest…** command. A quest note opens on a card with its status, who gave it, the reward, objectives you can tick and the GM's secret. The open ones are listed near the top of the panel; set `status: completed` and the quest gets a green tick and moves to the bottom of the folder. `/quest` links one in any note.

See [Quests](quests.md) for the full note, every property and examples.

### Links to campaign notes

![A session log where links to a location, scenes, a map and NPCs show as pills with their icons](images/link-pills.png)

A link to a campaign note shows what it links to. `[[Bring Wick Home]]` is an orange pill with a flag, in reading view and Live Preview:

| Linked note | Icon | Colour |
|---|---|---|
| Quest | Flag (a tick once `completed`, a cross once `failed`) | Orange |
| Location, map | Map pin, map | Blue |
| Party member (character sheet) | Shield | Purple |
| Monster, creature, saved fight | Skull, paw, swords | Red |
| Handout | Scroll | Yellow |
| Session, scene, chapter, campaign | Calendar, clapperboard, book, castle | Grey |
| NPC | Person | Green ([NPC chips](npcs.md)) |

It's the `nimble:` property on the linked note that counts, so a link to a plain note stays a plain link. Clicking a pill opens the note as usual.

A link in a card, a box or on a map that goes to a note that doesn't exist says so when you click it, rather than making a new empty note.

### Moving things around

- **Drag** a note or file onto a chapter or folder to move it there. Drop it on the **Campaign** heading to move it to the top of the campaign.
- **Drag from Obsidian's file explorer** to bring existing notes, or whole folders, into a campaign. This is the quickest way to move an older campaign over.
- A scene or plain note moved into a chapter becomes that chapter's last scene. An NPC, handout or map moved there is kept with the chapter but isn't numbered as a scene.
- Files you add to a chapter, or drop on the **Campaign** heading, are listed there too.
- Links to moved notes are updated the way Obsidian always updates them (Settings → Files and links).
- **Renaming or moving a note updates the plugin's links to it too:** map pins, encounter blocks, boxes, NPC card rows, and properties that hold a link among other words, like a session's `quests:` line `"[[The Missing Lantern]] advanced"`. Obsidian doesn't track those itself. If Obsidian asks whether to update links and you say **Do not update**, they're left alone too.

**Right-click** a note, file, folder or chapter (or **long-press** it on a phone or tablet) for:

- notes and files: **Open in new tab**, **Move to chapter or folder…**, **Rename…**, **Delete**
- folders: **New note…**, **Add files…**, **Rename folder…**, **Delete folder**
- chapters: **New scene or note…**, **Open chapter note**, **Add files…**, **Rename chapter…** (renames its folder and chapter note together), **Delete chapter**

Obsidian's own items (Bookmark, Reveal in navigation, and items from other plugins) are in the same menus. Deleted notes go wherever Obsidian's **Deleted files** setting sends them.

**Each campaign has its own party.** In a campaign you run, the party is the [character sheets](character-sheets.md) in its Party folder: **+** next to Party makes a new one, and each card opens the hero's sheet. Encounter blocks and the tracker read the party from those sheets (name, level, max HP, Defense and max Wounds), so levelling a hero up changes the encounter maths too. Opening a note inside a campaign makes that campaign active, so encounter blocks in it are rated against that table's heroes. Until you add heroes, the campaign's `level:` and `heroes:` properties are used.

**Each campaign has its own fight.** The tracker shows the active campaign's encounter: open a note in another campaign and the tracker switches to that campaign's fight (and to its game's tracker, for a 5e campaign beside a Nimble one). Go back and the first fight is where you left it. A party you entered by hand before keeps counting: those heroes show in the Party section after the sheets, with a button to make character sheets for them, until a sheet with the same name replaces each one.

**Pages open ready to read.** Characters, chapters, scenes, NPCs, locations, quests, maps and handouts open in reading view, where cards, sheets and blocks look their best. Use Obsidian's edit button (or its hotkey) to change one; it stays in editing until you move to another page. Session logs, which you write in at the table, and notes you've just made open for editing as usual. Turn this off under Settings → Campaigns → **Open campaign pages in reading view**. In reading view, a campaign note's properties show as a row of tags (Ancestry Human, Status alive…) rather than the Properties form, leaving out what a card already shows; switch to editing to change them, or turn off **Properties as tags**.

**Moving through scenes:** the **Next scene** and **Previous scene** commands step through scenes in order, across chapters. Bind them to hotkeys under Settings → Hotkeys.

## Places

![The Alchemists' Guild's card: its banner, the region, the monsters to use there, who's here, and where it leads](images/guide-place-card.png)

A location note opens on a card: a banner (the note's image, or contour lines in the game's colours), what kind of place it is, its name and region, then:

- **Who's here:** every NPC in the campaign whose `location:` links to this place, with their portraits. Click a name for a quick look at the NPC, as with NPC links everywhere; Cmd/Ctrl-click opens their page.
- **Leads to:** the `leads:` property, or the links under a **Leads to**, **Exits** or **Connections** heading.
- **Monsters here** (Nimble, GM only): the `monsters:` property, as references to their stat blocks. Hover one for the block, or use its **+** to add it to the fight.
- **Read aloud** (5e, GM only): the `read_aloud:` property, in a boxed paragraph.
- **Secret** (GM only): the `secret:` property.

```yaml
---
nimble: location
type: guildhall
region: The Old Quarter
image: "[[Alchemy bench.png]]"
leads: ["[[Q1 Entry Chamber]]"]
monsters: [City Guard]
secret: The Guild bricked up the cellar under Lantern Row a year before Vess went quiet.
---
```

A new location note starts with an empty ```` ```nimble-note ```` block, which is where the card goes; it shows the card while you edit too. Older notes without it still open on the card in reading view.

## Sessions

![Session 1's card: the date, the title, who was at the table, what happened, and the quests it moved](images/guide-session-card.png)

A session note opens on a card that repeats nothing: "Session 1 - Silver Between the Stones" becomes the kicker's number and date, and the title's name. Then:

- **At the table:** the `party:` property, with portraits. A new session note fills it in with the campaign's party.
- **What happened:** the list under your **Recap** heading (or **What happened**, or **Summary**).
- **Quests:** the `quests:` property, one quest per line with how it moved: `advanced`, `new`, `done` or `failed` after the link. A line with no word counts as advanced.
- **Loot** and **Next time:** the `loot:` and `next:` properties, or the lists under **Loot** and **Next time** headings.

```yaml
---
nimble: session
date: 2026-11-07
party: ["[[Brakka]]", "[[Ilse]]", "[[Tomas]]", "[[Wren]]"]
quests:
  - "[[The Guild's Quiet Job]] new"
  - "[[The Sealed Cellar]] done"
loot: ["30 gp each, up front", "Vess's last letter"]
next: Down the cellar stair, into Q1.
---
```

Sections the card shows (the recap, and loot and next time when they're not properties) step aside in reading view, as does the note's title, so nothing shows twice.

## How it's laid out

It's plain folders and a little frontmatter, so you can also build it by hand or convert an existing vault:

```
Campaigns/
  The Old Quarter/
    The Old Quarter.md                 nimble: campaign   (level: 2, heroes: 4)
    1 The Quicksilver Vaults/
      1 The Quicksilver Vaults.md      nimble: chapter    (order: 1, label: "Mercury Rises, Sanity Falls")
      Q1 Entry Chamber.md              nimble: scene      (order: 1, area: Q1)   ← any note here is a scene
      Q2 Mercury Pool.md
      Map - The Quicksilver Vaults.md  nimble: map
    NPCs/  Quests/  Sessions/  Locations/  Monsters/  Assets/   ← any other folder is a section
```

- A **campaign** is any folder holding a note with `nimble: campaign`.
- A **chapter** is any folder inside it holding a note with `nimble: chapter`. It can sit straight in the campaign folder or deeper, such as `Chapters/Act 1`.
- Every other note in a chapter folder is a **scene**, even without frontmatter.
- `order:` sorts notes. Without it, names sort naturally (Q2 before Q10).
- `area:` is the short tag shown before a scene's title in the panel (Q1, Q2…). It's handy for matching map keys.
- `title:` is the name shown in the panel when it differs from the file name. File names can't hold characters like `:` `?` and `"`, so a campaign you call "Vecna: Eve of Ruin" is saved as `Vecna- Eve of Ruin` with `title: "Vecna: Eve of Ruin"`, and the panel and NPC cards show the name you typed.
- Any other folder in the campaign is a **section** (NPCs, Locations, Quests, Sessions, Monsters, Handouts or anything you like). Sections list their notes and any other files in them, and show up even while empty.

A ```` ```nimble-campaign ```` block on the home note shows the same outline inside the note, open quests included.

## Campaign properties

| Property | On | Meaning |
|---|---|---|
| `nimble: campaign` | home note | Marks the folder as a campaign |
| `role: player` | home note | A campaign you [play in](players.md) rather than run |
| `level:` / `heroes:` | home note | Party level and size, used until you add real heroes |
| `nimble: chapter` | chapter note | Marks the folder as a chapter |
| `label:` | chapter note | Shown above the chapter name, e.g. "Chapter 1" or "Prelude" |
| `nimble: scene` | scene | Optional; any note in a chapter is a scene |
| `order:` | any | Sort order |
| `area:` | scene | Area key shown in the panel |
| `nimble: npc` / `location` / `quest` / `session` / `map` / `monster` / `handout` | any note | What kind of note it is (sets its icon) |
| `status:` | quest | Where it stands; `completed` and `failed` quests move to the bottom of the folder ([quests](quests.md#open-finished-and-failed)) |
