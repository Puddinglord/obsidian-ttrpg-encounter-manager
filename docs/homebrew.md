# Your own content

Everything a game ships, you can add yourself: classes, subclasses, a class's options, feats, species and ancestries, backgrounds, boons, rules and conditions. What you add works like the books' own. **New character**, **Level up**, the character sheet, the compendium, references, autocomplete, Spotlight, the "/" menu and the tracker all see it.

Your content lives in the [compendium](compendium.md), not beside your campaign notes. Each entry is a note in your content folder holding one block, written in a few lines of `field: value`.

## Make something

1. Open the compendium (the book in the ribbon, or **Open compendium**) and go to the tab it belongs on: Classes, Feats, Origins…
2. Press **+** at the end of the search bar. On a tab with more than one kind (Classes has classes and subclasses), pick which.
3. Give it a name. Ember Vault writes a note with a starter block and opens it.
4. Fill in the block. In reading view it shows as the compendium's card for it, and anything that still needs fixing is listed under the card.

As soon as the block reads cleanly it's in the compendium, tagged **Homebrew**. Change the block and everything that uses it changes too.

Monsters, spells and items open the [builder](builder.md) instead, as they always have.

## Where the notes live

New puts each note at `Ember Vault/Content/<game>/<kind>/<name>.md`, for example `Ember Vault/Content/5e/Classes/Hearth Warden.md`. The folder is the **Content folder** setting, the same one [content packs](content-packs.md) use.

Any note anywhere in the content folder counts, so move and rename them as you like. A block in a note outside the content folder still shows its card, with a line saying it isn't in the compendium.

## Our syntax

A block is named for its game and its kind: ```` ```5e-feat ````, ```` ```nimble-ancestry ````. Inside, one field on each line:

- `name: Kindler`: text needs no quotes, unless it has a colon and a space in it (`skillChoice: "Choose 2: Athletics or Insight"`).
- `saves: [STR, WIS]`: a short list on one line, or one item a line, each starting with `- `.
- Longer text goes on the lines under a `|`, indented:

  ```yaml
  desc: |
    You light fires with a word.
    Once a day, you can light one in the rain.
  ```

- Things with several fields of their own (a feature, a trait) are list items with their fields indented under them.

The field names are the ones [content packs](content-packs.md) use, and so are the checks, so any entry in a pack can be copied into a block and back.

| Game | Blocks |
|---|---|
| 5e | `5e-class`, `5e-subclass`, `5e-feat`, `5e-species`, `5e-background` |
| Nimble | `nimble-class`, `nimble-subclass`, `nimble-option`, `nimble-ancestry`, `nimble-background`, `nimble-boon`, `nimble-property`, `nimble-language`, `nimble-rule`, `nimble-condition` |

Monsters, spells and items keep the blocks they've always had: ```` ```5e ````, ```` ```5e-spell ````, ```` ```5e-item ````, ```` ```nimble ````, ```` ```nimble-spell ```` and ```` ```nimble-item ````.

## 5e examples

A class, with its level table (`slots` are spell slots by spell level, `prepared` the spells it prepares):

```5e-class
name: Hearth Warden
hitDie: 10
primary: Wisdom
saves: [STR, WIS]
proficiencies: [Light Armor, Medium Armor, Shields, Simple Weapons, Martial Weapons]
skillChoice: "Choose 2: Athletics, Insight, Medicine, Perception, or Survival"
spellcasting: WIS
spellList: Ranger
resources:
  - name: Hearthfire
    uses: Wisdom modifier
    min: 1
    shortFrom: 5
startingEquipment:
  - label: "(A) Chain Mail, Longsword, Shield and 2 Javelins; or (B) 100 GP"
    options:
      - label: A
        items: [Chain Mail, Longsword, Shield, 2 Javelin]
      - label: B
        gold: 100
toolChoices: { count: 1, from: [Cook's Utensils, Woodcarver's Tools] }
features:
  - level: 1
    name: Hearthfire
    desc: As a Bonus Action, you kindle a warding flame around an ally you can see within 30 feet.
  - level: 1
    name: Warding Style
    desc: Choose one of the following options.
  - level: 1
    name: Ember Guard
    group: Warding Style
    desc: While your flame burns around an ally, attacks against them have disadvantage.
  - level: 1
    name: Ash Step
    group: Warding Style
    desc: You can teleport to an ally your flame warms.
  - level: 3
    name: Warden Circle
    desc: Choose a circle.
levels:
  - { level: 1, pb: 2, features: [Hearthfire, Warding Style] }
  - { level: 2, pb: 2, features: [Spellcasting], slots: [2], prepared: 2 }
  - { level: 3, pb: 2, features: [Warden Circle], slots: [3], prepared: 3 }
```

A subclass, for its class (one of the SRD's, a pack's or yours):

```5e-subclass
name: Circle of Embers
class: Hearth Warden
flavor: Warden Circle
features:
  - level: 3
    name: Banked Coals
    desc: Your Hearthfire lingers for 1 round after it ends.
```

A feat:

```5e-feat
name: Kindler
type: general
prerequisite: Level 4+
desc: You can light a fire with a word, and a creature you set alight takes an extra 1d4 Fire damage.
```

A species (`subspecies` for 2014's subraces):

```5e-species
name: Emberfolk
size: Small
speed: 30
type: Humanoid
traits:
  - name: Warm Blood
    desc: You have Resistance to Cold damage.
  - name: Spark
    desc: You know the Produce Flame cantrip.
```

A background:

```5e-background
name: Lamplighter
abilityScores: [WIS, DEX, CON]
feat: Alert
proficiencies: ["Skill: Perception", "Skill: Stealth", "Tool: Tinker's Tools"]
startingEquipment:
  - options:
      - label: A
        items: [Tinker's Tools, Traveler's Clothes, 2 Oil]
        gold: 10
      - label: B
        gold: 50
```

## Nimble examples

A class, as the class books write one:

```nimble-class
name: Cinderwright
tagline: A smith who hammers fire into the fight.
keyStats: [STR, WIL]
hitDie: 10
startingHp: 17
saves: { adv: STR, dis: DEX }
armor: Mail, Shields
weapons: STR weapons
startingGear: [Club/Mace, Chain Shirt]
resources:
  - name: Forge Dice
    max: 2
    die: d6
    reset: Safe Rest
    dice:
      rolled: spent
      addTo: [attack]
      use: any
levels:
  - level: 1
    features:
      - name: Strike the Anvil
        text: When you hit with a melee attack, spend any number of Forge Dice and add them to the damage.
  - level: 3
    features:
      - name: Subclass
        text: Choose a Cinderwright oath.
```

A subclass:

```nimble-subclass
name: Anvil Oath
class: Cinderwright
levels:
  - level: 3
    features:
      - name: Unbreakable
        text: You can't be knocked prone.
```

One more option for a class's list (a new name makes a new list):

```nimble-option
name: Cleave Through
class: Berserker
group: Savage Arsenal
cost: 1 Action
text: Hit two creatures within Reach with one attack.
```

An ancestry:

```nimble-ancestry
name: Emberkin
size: Small
rarity: uncommon
traits:
  - name: Warm Blood
    text: You're immune to cold weather, and resist cold damage.
```

A background:

```nimble-background
name: Ferryman
text: You know every crossing on the river, and every boatman owes you a favor.
```

A boon (`type` is `epic`, `lodging` or `other`):

```nimble-boon
name: Undying Flame
type: epic
text: Once a day, when you would drop to 0 HP, drop to 1 instead.
```

A weapon property, a language, a rule and a condition:

```nimble-property
name: Brittle
text: On a roll of 1, the weapon breaks.
```

```nimble-language
name: Ashcant
speakers: Smiths and their apprentices.
```

```nimble-rule
name: Lamplight
topic: Travel
text: A lit lantern shows the way 8 spaces ahead at night.
```

```nimble-condition
name: Soot-Blind
text: You can't see anything more than 2 spaces away.
minor: true
```

## Classes: what the sheet and level up read

A class's own words do most of the work, the way the books' do ("Choose 1 Kindling", "+1 STR or DEX"). When the words don't say, the class can:

**5e**

- `resources`: limited-use features the level table doesn't count, with pips on the sheet. `uses` is a number or a formula of ability modifiers, `PB` and `level` (`Charisma modifier`, `2 + WIS`); `min`, the level it starts at, the rest that brings them back (`reset: short`), from which level a short rest does (`shortFrom`), or one back on a short rest (`shortOne`).
- `startingEquipment` and `toolChoices`, for a class or a background (and a background's `tools`). Each choice lists its options; an option has `items` (`2 Javelin` for two), `picks` from a list, and `gold`.
- `group` on a feature: it's one choice of the feature named there, whatever it's called.

**Nimble**

- A resource's `dice.maxSteps`: hold more from a level, for one subclass if it names one: `- { level: 3, add: 1, subclass: Anvil Oath }`.
- `spend`: the word on a number's button (`Heal`).
- `states`: what the class panel switches on and off. `- { name: Forgeheat, condition: Forgeheated }` puts Forgeheated on the hero; dice that are `onWhile` it are rolled when it starts and lost when it ends.
- `target`: what the class panel keeps one of at a time: `{ name: Branded Foe, feature: Brand }`.
- On a feature: `increase` (`{ stats: [STR, WIL] }`, or `count` for several), `learn` (spell schools or Utility Spells: `- { kind: utility, from: [Fire] }`) and `uses` (`WIL`: uses between Safe Rests).

## In the compendium

- Everything you make is tagged **Homebrew**. `source:Homebrew` or `is:homebrew` finds it all, and its page has **Open note**.
- A name you reuse replaces what was there: your note beats a pack, and a pack beats the books.
- A campaign's `packs:` property can leave your homebrew out: it counts as a pack called Homebrew (`packs: [Hearth and Cinder, Homebrew]`). See [Pick packs per campaign](content-packs.md#pick-packs-per-campaign).
- If your content folder is inside a campaign's folder, what's in it is that campaign's alone.
