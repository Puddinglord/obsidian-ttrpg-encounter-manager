# Content packs

Ember Vault ships only what it's allowed to: all of Nimble, and the 5e SRD. A **content pack** adds the rest yourself: a subclass from a book you own, a third-party bestiary, your table's homebrew. It's a JSON file in your vault. Ember Vault never downloads or hosts packs.

Content packs work with 5e today.

## Add a pack

1. Run **Import content…** (command palette, or **Settings → Ember Vault → Content packs**).
2. Choose the pack's `.json` file, or paste its text.
3. Read the report: what the pack adds, and anything it left out with the reason.
4. Choose **Add to vault**.

The file is saved in `Ember Vault/Content` (change the folder in settings). You can also drop `.json` files in that folder yourself. They're read straight away, and again whenever they change.

## What a pack adds

A pack's monsters, spells, magic items, equipment, feats, backgrounds, species, classes and subclasses work like the SRD's: in `5e:` references, autocomplete, slash commands, Spotlight, the compendium (tagged with the pack's name), character sheets and **New character**. A subclass joins its class.

When two things share a name, the closest one wins: a note in your vault, then a pack, then the SRD.

## Pick packs per campaign

Every campaign uses every pack unless its home note says otherwise, with a `packs` property:

| `packs:` | Uses |
|---|---|
| (not set) | Every pack |
| `none` | No packs |
| `[Hearth and Cinder, Table Rules]` | Just these (by pack name or file name) |

## Write a pack

A pack is one JSON object: its name, the game, and a list of entries. Each entry has a `kind` and a `name`, then that kind's fields.

```json
{
  "pack": "Hearth and Cinder",
  "system": "5e",
  "entries": [
    {
      "kind": "spell",
      "name": "Ember Lash",
      "level": 1,
      "school": "Evocation",
      "castingTime": "Action",
      "range": "30 feet",
      "components": "V, S, M (a pinch of ash)",
      "duration": "Instantaneous",
      "classes": ["Sorcerer", "Wizard"],
      "desc": "A whip of fire cracks at a creature you can see within range…"
    }
  ]
}
```

- **`edition`** (optional): `"2024"` or `"2014"` keeps the pack to campaigns on those rules. Leave it out for both.
- **Kinds:** `monster`, `spell`, `item` (magic items), `equipment`, `feat`, `background`, `species`, `class`, `subclass`.
- **Monsters** can be written field by field, or as `"statblock"`: the text of a ```` ```5e ```` block (see [Playing 5e](5e.md)), which is often easier.
- **Subclasses** name their class: `"class": "Barbarian"`.

The full example is [5e-hearth-and-cinder.json](content/examples/5e-hearth-and-cinder.json): a subclass, a spell, a magic item, a feat and a monster.

### Check it as you write

Point your editor at the schema and it suggests fields and flags mistakes as you type. Add this line at the top of the pack:

```json
"$schema": "https://raw.githubusercontent.com/Puddinglord/obsidian-ttrpg-encounter-manager/main/docs/content/5e.schema.json",
```

Import content checks it too, and says exactly what's wrong: `Entry 2 (Half Done): "school" is missing`.

## Sharing

Packs are plain files: send one to your players, or keep them in a synced vault. Only share content you're allowed to share. Packs made from a book you own are for your own table.
