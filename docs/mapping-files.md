# Mapping files

A mapping file tells [Import…](import.md) how to read another tool's JSON or YAML: how to recognise the file, where its records are, and which of its fields go into which of ours. Write one when a tool you use exports a format Ember Vault doesn't read yet. You don't need to change any code or wait for an update.

Put mapping files in your content folder's **Importers** folder (`Ember Vault/Content/Importers` by default). Ember Vault reads them as soon as they're saved. **Settings → Ember Vault → Content packs → Mapping files** lists each one, and says what's wrong with any it can't use.

## An example

A made-up tool, Lantern Forge, exports creatures and people like this:

```json
{
  "items": [
    { "id": 41, "slug": "mire-hag", "type": "creature",
      "creature": { "title": "Mire Hag", "lvl": 3, "health": "30 hp", "armour": "Medium",
        "moves": [{ "label": "Claw", "detail": "<p><strong>1d8+2</strong> slashing.</p>" }] } },
    { "id": 52, "type": "person",
      "person": { "name": "Irinia", "job": "Cleric", "goal": "Hold the gate" } }
  ]
}
```

This mapping turns its creatures into Nimble monsters and its people into NPC notes:

```json
{
  "$schema": "https://raw.githubusercontent.com/Puddinglord/obsidian-ttrpg-encounter-manager/main/docs/import/mapping.schema.json",
  "format": "ember-vault-mapping",
  "version": 1,
  "id": "lantern-forge",
  "label": "Lantern Forge",
  "system": "nimble",
  "detect": { "all": ["creature.title", "creature.lvl"], "files": [".json"] },
  "records": [
    {
      "each": "items[*]",
      "when": { "path": "type", "equals": "creature" },
      "kind": "monster",
      "from": { "id": { "template": "lantern-forge:{id}" } },
      "fields": {
        "name": "creature.title",
        "level": { "path": "creature.lvl", "as": "string" },
        "hp": { "path": "creature.health", "as": "integer" },
        "armor": { "path": "creature.armour", "map": { "medium": "medium", "heavy": "heavy", "*": "none" } },
        "actions": { "path": "creature.moves", "each": { "name": "label", "text": { "path": "detail", "as": "html" } } }
      }
    },
    {
      "each": "items[*]",
      "when": { "path": "type", "equals": "person" },
      "into": "note",
      "kind": "npc",
      "from": { "id": { "template": "lantern-forge:{id}" } },
      "fields": { "name": "person.name", "role": "person.job" },
      "card": { "wants": "person.goal" }
    }
  ]
}
```

The full example, with more fields and a link it can fetch, is [lantern-forge-mapping.json](import/examples/lantern-forge-mapping.json).

## The parts

| Part | What it says |
|---|---|
| `format`, `version` | Always `"ember-vault-mapping"` and `1`. |
| `id` | A short name for the mapping. One of yours with the same `id` as one Ember Vault ships replaces it. |
| `label` | What people call the format. Import… shows it as "Read as Lantern Forge". |
| `system` | The game its content is for: `"nimble"` or `"5e"`. Not needed if it only makes notes. |
| `license` | The licence the content comes under. Import… shows it before anything is written. |
| `detect` | How to recognise the file. `all` lists paths every record has, `any` lists paths it has at least one of, and `files` limits it to some file extensions. `score` (0.7 if you leave it out) decides which importer wins when two fit. |
| `links` | Links it can fetch when one is pasted into Import…: `match` is a pattern for the link, and `data` is the https address of its data (`{url}` is the link). Import… asks before it fetches anything. |
| `records` | One entry for each kind of thing in the file. With only one kind, put `each`, `kind` and `fields` at the top instead. |

Each entry in `records` has:

| Part | What it says |
|---|---|
| `each` | Where the records are: `"items[*]"`. Leave it out when the file is one record, or a list of records. |
| `when` | Only records where `path` has a value, or equals `equals`. |
| `into` | `"content"` (the default) for a game's monsters, spells and items, or `"note"` for NPCs, locations, quests and plain notes. |
| `kind` | What each record becomes: a content kind (`monster`, `spell`, `item`…, the same kinds as [content packs](content-packs.md)) or a note kind (`npc`, `location`, `quest`, `note`). |
| `fields` | Our fields, each filled from the file. For content they're the game's content-pack fields. For notes they're the note's properties. |
| `from` | Where each record came from. Give it an `id` (usually a template like `"lantern-forge:{id}"`) so that importing the same file again updates what it made instead of adding copies. |
| `card`, `body` | Notes only: the NPC card (`look`, `wants`, `voice`, `secret`) and the note's text. |

## Filling a field

A field is a **path** into the record, or a **rule**.

Paths: `name`, `stats.hp` (inside an object), `moves[0]` (the first item), `moves[*].label` (every item's label), `$` (the record itself). `hp | health` takes the first of the two that has a value.

A rule is an object:

| Key | What it does |
|---|---|
| `path` | Where the value is. |
| `value` | A fixed value instead. |
| `as` | What to make of it: `text`, `html` (HTML as plain text with bold and italic kept), `string`, `number`, `integer`, `boolean`, `lower`, `upper`, `dice` (the first `2d6+3` in the text), `list`. |
| `map` | Swap values: `{ "light": "none", "medium": "medium", "*": "none" }`. Case doesn't matter. `*` catches everything else. |
| `split`, `join`, `first` | Text to a list (`"split": ","`), a list to text (`"join": ", "`), or a list's first item. |
| `each` | For a list of objects: how each item's fields are filled, from the item (actions, traits). |
| `fields` | For an object: its fields (a monster's `tactics`). |
| `template` | Text with `{path}` slots: `"lantern-forge:{id}"`. `{$}` is the value at `path`. |
| `default` | What to use when the file has nothing there. |

There are no formulas or scripts in a mapping, on purpose: a mapping can only move and tidy text. That makes a mapping file from someone else safe to use.

## Checking your mapping

Import… shows what each record became before anything is written. A record it can't use is listed under **Left out**, with the reason in the same words as for [content packs](content-packs.md) (`"hp" should be a number`). Settings lists mistakes in the mapping itself, such as a misspelt key.

Point your editor at [mapping.schema.json](import/mapping.schema.json) (the `$schema` line above) and it will suggest keys and catch mistakes as you type.
