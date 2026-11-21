# Content packs

A **content pack** adds what Ember Vault doesn't ship: your table's homebrew class, a third-party bestiary, a subclass from a book you own. It's a JSON file in your vault. Ember Vault never downloads or hosts packs.

Packs work with both games. In Nimble they add classes, subclasses, a class's options, ancestries, backgrounds, spells, items, monsters and more. In 5e they add what isn't in the SRD.

## Add a pack

1. Run **Import content…** (command palette, or **Settings → Ember Vault → Content packs**).
2. Choose the pack's `.json` file, or paste its text.
3. Read the report: what the pack adds, and anything it left out with the reason.
4. Choose **Add to vault**.

The file is saved in `Ember Vault/Content` (change the folder in settings). You can also drop `.json` files in that folder yourself. They're read straight away, and again whenever they change.

## What a pack adds

Whatever a pack adds goes into the compendium, tagged with the pack's name, and works like the books' own:

- **Nimble:** New character and Level up offer the pack's classes, subclasses, ancestries, backgrounds and options; character sheets read them; its monsters are in the compendium, `nimble:` references, the encounter builder and **Add to fight**; its spells and items are in `nimble:spell:` references, autocomplete, slash commands and Spotlight. A subclass joins its class, and an option joins its class's list (a new Savage Arsenal ability shows up when a Berserker levels up).
- **5e:** monsters, spells, magic items, equipment, feats, backgrounds, species, classes and subclasses, in `5e:` references, autocomplete, slash commands, Spotlight, the compendium, character sheets, **New character** and **Level up**. A subclass joins its class.

When two things share a name, the closest one wins: a note in your vault, then a pack, then the books.

## Pick packs per campaign

Every campaign uses every pack for its game unless its home note says otherwise, with a `packs` property:

| `packs:` | Uses |
|---|---|
| (not set) | Every pack |
| `none` | No packs |
| `[Hearth and Cinder, Table Rules]` | Just these (by pack name or file name) |

## Write a pack

A pack is one JSON object: its name, the game, and a list of entries. Each entry has a `kind` and a `name`, then that kind's fields.

```json
{
  "pack": "The Lantern Road",
  "system": "nimble",
  "entries": [
    {
      "kind": "spell",
      "name": "Lantern Ward",
      "school": "Radiant",
      "tier": 1,
      "class": "Lamplighter",
      "actions": "2 Actions",
      "text": "Your lantern burns white. While you concentrate, enemies within 2 spaces of you have disadvantage on attacks against your allies."
    }
  ]
}
```

`"system"` is `"nimble"` or `"5e"`.

### Nimble

- **Kinds:** `class`, `subclass`, `option`, `ancestry`, `background`, `spell`, `item`, `monster`, `boon`, `property` (a weapon property), `language`, `rule` and `condition`.
- **Classes** are written the way the class books are: `keyStats`, `saves`, `hitDie`, `startingHp`, `startingGear`, and `levels`, each with its features. New character and Level up read the features' words:
  - A feature called **Subclass** offers the subclass.
  - **Key Stat Increase** with "+1 WIL or DEX." raises a stat.
  - "Choose 1 Kindling." picks from the class's option list called Kindlings (`optionGroups`).
  - When the words don't name the list, give the feature `choose`: `{ "from": ["Combat Tactics"], "count": 1 }`.
- **Resources** are what the class panel counts: `{ "name": "Ember Dice", "max": "WIL", "die": "d6" }`. For dice, `dice` says how they're used: rolled when spent or gained, which rolls they go into (`attack`, `spell`, `save`, `check`), and the die at each level.
- **Casting:** `casting` gives the mana pool (`"manaFormula": "WIL+LVL"`) and the schools known. A spell with `"class": "Lamplighter"` is that class's own.
- **Subclasses** name their class: `"class": "Berserker"`.
- **Options** name their class and list: `"class": "Berserker", "group": "Savage Arsenal"`.
- **Monsters** can be written field by field (`level`, `hp`, `armor`, `actions`…), or as `"statblock"`: the text of a ```` ```nimble ```` block (see the [bestiary](bestiary.md)).

The full example is [nimble-lantern-road.json](content/examples/nimble-lantern-road.json): the Lamplighter class with its own Ember Dice and a subclass, a new Savage Arsenal ability for the Berserker, an ancestry, a background, two spells, a magic item and a monster.

### 5e

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
- **Classes** work in **New character**, **Level up** and the sheet from their own level table: each row's `features` (an `Ability Score Improvement` or `Expertise` there asks for one), `slots` and `cantrips`, and `prepared` for how many spells the class knows or prepares at that level. Its subclass comes at its first feature's level. `"spellList": "Paladin"` casts from another class's list. A row's `extra` holds the class's own numbers; one named `…_uses` is a limited-use feature with pips on the sheet: `"extra": { "blood_maledict_uses": 2 }`. Features named `Group: Option` under a feature named `Group` are a choice ("Ward Stance: Ember" under "Ward Stance").
- **Subclasses** name their class: `"class": "Barbarian"`.

The full example is [5e-hearth-and-cinder.json](content/examples/5e-hearth-and-cinder.json): a subclass, a spell, a magic item, a feat and a monster.

### Check it as you write

Point your editor at the game's schema and it suggests fields and flags mistakes as you type. Add this line at the top of the pack:

```json
"$schema": "https://raw.githubusercontent.com/Puddinglord/obsidian-ttrpg-encounter-manager/main/docs/content/nimble.schema.json",
```

For 5e, end it with `5e.schema.json` instead.

Import content checks it too, and says exactly what's wrong: `Entry 2 (Half Done): "tier" is missing`.

## Sharing

Packs are plain files: send one to your players, or keep them in a synced vault. Only share content you're allowed to share. Packs made from a book you own are for your own table.
