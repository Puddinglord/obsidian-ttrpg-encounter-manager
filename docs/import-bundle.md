# The import bundle

An Ember Vault bundle is one JSON file that holds content for a game, NPC, place and quest notes, and maps with their pins. Every format [Import…](import.md) reads is turned into a bundle first, and other tools (or an AI you hand an adventure to) can write one directly. Import… checks it, shows what it will add, and writes it the way a hand-made note would be.

The schema is [bundle.schema.json](import/bundle.schema.json). Point your editor or your tool at it:

```json
"$schema": "https://raw.githubusercontent.com/Puddinglord/obsidian-ttrpg-encounter-manager/main/docs/import/bundle.schema.json"
```

## An example

```json
{
  "format": "ember-vault-bundle",
  "version": 1,
  "system": "nimble",
  "source": { "name": "The Mire Book", "license": "CC-BY-4.0", "url": "https://example.com/mire" },
  "content": [
    {
      "kind": "monster", "name": "Mire Hag", "level": "3", "hp": 30, "armor": "medium",
      "actions": [{ "name": "Claw", "text": "Reach 1. 1d8+2 slashing." }],
      "importedFrom": { "id": "mire-book:mire-hag" }
    }
  ],
  "notes": [
    { "kind": "npc", "name": "Irinia", "fields": { "role": "Cleric", "faction": "The Gate" }, "card": { "wants": "To hold the gate" } },
    { "kind": "location", "name": "The East Gate", "body": "Oak doors, banded in iron." }
  ],
  "maps": [
    {
      "name": "Sunken Crypt", "image": { "file": "crypt.png" }, "grid": "30x20",
      "pins": [{ "x": 41.5, "y": 22, "label": "1. Altar", "text": "A cracked altar, still warm." }, { "x": 70, "y": 60, "label": "Irinia", "note": "Irinia", "kind": "npc" }]
    }
  ],
  "files": [{ "name": "crypt.png", "data": "<base64>" }]
}
```

## The parts

| Part | What it holds |
|---|---|
| `format`, `version` | Always `"ember-vault-bundle"` and `1`. |
| `system` | The game the content is for: `"nimble"` or `"5e"`. Only needed when there's content. |
| `edition` | 5e only: `"2024"` or `"2014"`. |
| `source` | Where the bundle came from: `name`, `url`, `license`. Import… shows them before anything is written, and each note it writes says `imported: <name>`. |
| `content` | The game's monsters, spells, items, classes and the rest: the same entries a [content pack](content-packs.md) holds, plus `importedFrom`. Monsters become monster notes in the campaign; the rest become notes in the content folder. |
| `notes` | NPCs, locations, quests and plain notes: `kind`, `name`, `fields` (the note's properties: `role`, `faction`, and the game's own, like Nimble's `level`, `armor`, `hp`), `card` (an NPC's `look`, `wants`, `voice`, `secret`) and `body` (Markdown). |
| `maps` | A map note each: `image` (a file in `files`, or one chosen with the bundle), `grid` (`"30x20"`), `pins` and `body`. |
| `files` | Pictures, as base64 in `data`. |
| `campaign` | Reserved for whole campaigns (chapters and scenes). Not read yet. |

A pin's `x` and `y` are percent of the picture's width and height, from the top left. Its `text` goes in the map's key, under its `label`, and the pin links there. `note` links a note instead. `kind` is one of `place`, `area`, `encounter`, `npc`, `treasure`, `danger`, `note` or `secret`.

## Updating instead of copying

Give each record an `importedFrom` with an `id` that stays the same each time your tool exports it (`"mire-book:mire-hag"`). Import the bundle again and Import… offers what changed as an update to the note it wrote before, instead of a second copy. Without an id, it matches imported notes by name.

## What Import… says about it

Import… checks every record and says, in plain words, what it can't use: `content 3 (Mire Hag): "hp" should be a number`. Records it can use still come in; the rest are listed under **Left out**. Anything it doesn't know (a part it doesn't read yet, a field a kind doesn't have) is listed under **Worth a look**.
