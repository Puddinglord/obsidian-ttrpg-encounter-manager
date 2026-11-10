# Campaigns

Run several campaigns from one vault. Each has its own chapters, scenes, NPCs, session logs and party.

![The Campaign panel beside a scene note](images/campaign-panel.png)

## Start one

Use **New campaign**, from the castle icon in the ribbon or the command palette. You give it a name, a starting level and the number of heroes. It creates a folder with a home note, a first chapter and an opening scene.

## The Campaign panel

The panel in the left sidebar is home base. From it you can:

- switch campaigns
- see and edit the party
- **Continue** where you left off
- browse chapters and their scenes (map buttons sit on each chapter)
- browse every folder in the campaign: Sessions, NPCs, Locations, Monsters, Assets, and any you make yourself, like Factions. Empty folders show too. NPCs with a [portrait](npcs.md#portraits) show it as their icon.
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
| Location | Description and connections |
| Session log | Prep checklist, recap and loose threads, dated today |
| Map | A map block; pick its image from the campaign's files, or set it later |
| Monster | A stat block the bestiary picks up |
| Handout | Player-facing text and GM notes |

The folder decides what's picked first: NPC in NPCs, Scene in a chapter, Session log in Sessions, a blank Note in a folder of your own. You can pick any starter in any folder.

On a folder of files like **Assets**, **+** adds files from your computer or phone instead. Every New dialog also has an **Add files from this device instead** link.

**+** on the **Campaign** heading makes a session log, NPC, location, chapter or **New folder**. The folder icon next to it makes a folder straight away.

### Moving things around

- **Drag** a note or file onto a chapter or folder to move it there. Drop it on the **Campaign** heading to move it to the top of the campaign.
- **Drag from Obsidian's file explorer** to bring existing notes, or whole folders, into a campaign. This is the quickest way to move an older campaign over.
- A note moved into a chapter becomes that chapter's last scene.
- Links to moved notes are updated the way Obsidian always updates them (Settings → Files and links).

**Right-click** a note, file, folder or chapter (or **long-press** it on a phone or tablet) for:

- notes and files: **Open in new tab**, **Move to chapter or folder…**, **Rename…**, **Delete**
- folders: **New note…**, **Add files…**, **Rename folder…**, **Delete folder**
- chapters: **New scene or note…**, **Open chapter note**, **Add files…**, **Rename chapter…** (renames its folder and chapter note together), **Delete chapter**

Obsidian's own items (Bookmark, Reveal in navigation, and items from other plugins) are in the same menus. Deleted notes go wherever Obsidian's **Deleted files** setting sends them.

**Each campaign has its own party.** Opening a note inside a campaign makes that campaign active, so encounter blocks in it are rated against that table's heroes. Until you add heroes, the campaign's `level:` and `heroes:` properties are used.

**Moving through scenes:** the **Next scene** and **Previous scene** commands step through scenes in order, across chapters. Bind them to hotkeys under Settings → Hotkeys.

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
    NPCs/  Sessions/  Locations/  Monsters/  Assets/   ← any other folder is a section
```

- A **campaign** is any folder holding a note with `nimble: campaign`.
- A **chapter** is any folder inside it holding a note with `nimble: chapter`.
- Every other note in a chapter folder is a **scene**, even without frontmatter.
- `order:` sorts notes. Without it, names sort naturally (Q2 before Q10).
- `area:` is the short tag shown before a scene's title in the panel (Q1, Q2…). It's handy for matching map keys.
- Any other folder in the campaign is a **section** (NPCs, Locations, Sessions, Monsters, Handouts or anything you like). Sections list their notes and any other files in them, and show up even while empty.

A ```` ```nimble-campaign ```` block on the home note shows the same outline inside the note.

## Campaign properties

| Property | On | Meaning |
|---|---|---|
| `nimble: campaign` | home note | Marks the folder as a campaign |
| `level:` / `heroes:` | home note | Party level and size, used until you add real heroes |
| `nimble: chapter` | chapter note | Marks the folder as a chapter |
| `label:` | chapter note | Shown above the chapter name, e.g. "Chapter 1" or "Prelude" |
| `nimble: scene` | scene | Optional; any note in a chapter is a scene |
| `order:` | any | Sort order |
| `area:` | scene | Area key shown in the panel |
| `nimble: npc` / `location` / `session` / `map` / `monster` / `handout` | any note | What kind of note it is (sets its icon) |
