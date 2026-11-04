# Nimble Statblocks

An Obsidian plugin for creating Nimble TTRPG monster stat blocks and tracking encounters during play.

## Quick Start

1. Create a new note
2. Add a code block with the `nimble` language
3. Define your monster using simple YAML-like syntax
4. Click "Add to Encounter" to track it during combat

---

## Creating Monsters

Use a fenced code block with `nimble` as the language:

````markdown
```nimble
name: Goblin
type: Humanoid
size: Small
armor: none
hp: 12
movement: 6
str: -
dex: ++
will: -
attacks:
- Shortsword 1d6 slashing
- Shortbow 1d6 piercing
abilities:
- Nimble Escape: Can Disengage or Hide as a bonus action
```
````

This renders as a styled stat block in your note with an "Add to Encounter" button.

---

## Inline Monster References

Reference any monster from your vault inline using the `nimble:` syntax:

```markdown
The party encounters a `nimble:Goblin` and its leader, a `nimble:Goblin Boss`.
```

### Features

- **Works while you write** — References render in Live Preview as well as Reading view. Put your cursor inside one to edit the raw text.
- **Autocomplete** — Type `` `nimble: `` and pick a monster from the list
- **Hover Preview** — Hover over the reference to see the full stat block (Escape closes it)
- **Click to Navigate** — Click the monster name to open its source file (Cmd/Ctrl-click opens a new tab)
- **Quick Add** — Click the **+** button to add the monster to your active encounter (Shift-click adds two)
- **Auto-Detection** — If the monster isn't found in your vault, it shows with a **?** indicator. It resolves on its own as soon as you write that monster up.

This is useful for writing adventure notes where you want quick access to monster stats without leaving the page.

---

## Monster Fields Reference

### Basic Info

| Field | Description | Example |
|-------|-------------|---------|
| `name` | Monster name (required) | `Goblin` |
| `type` | Creature type | `Humanoid`, `Beast`, `Undead` |
| `size` | Size category | `Tiny`, `Small`, `Medium`, `Large`, `Huge` |
| `cr` | Challenge rating | `1`, `1/2`, `5` |

### Combat Stats

| Field | Description | Example |
|-------|-------------|---------|
| `armor` | Armor type (see below) | `none`, `medium`, `heavy` |
| `hp` | Hit points | `45` |
| `movement` | Speed in spaces | `6` or `6, fly 12` |

### Saving Throws (Nimble's Simplified System)

Saves use `+`, `++`, `-`, `--` notation to indicate advantage/disadvantage:

| Symbol | Meaning |
|--------|---------|
| `++` | Double advantage |
| `+` | Advantage |
| `-` | Disadvantage |
| `--` | Double disadvantage |

| Field | Description | Example |
|-------|-------------|---------|
| `str` | Strength save (includes Con) | `+`, `++`, `-` |
| `dex` | Dexterity save | `+`, `-`, `--` |
| `will` | Will save (Int/Wis/Cha combined) | `+`, `-` |

### Other Fields

| Field | Description | Example |
|-------|-------------|---------|
| `senses` | Special senses | `Darkvision 12 spaces` |
| `languages` | Known languages | `Common, Goblin` |
| `multiattack` | Multiattack description | `Makes two claw attacks` |
| `resistances` | Damage resistances (list) | See below |
| `immunities` | Damage immunities (list) | See below |

---

## Nimble Armor System

Nimble simplifies armor into three categories:

| Armor | Input | Effect |
|-------|-------|--------|
| **None** | `none` or `N` | Takes full damage (dice + modifiers) |
| **Medium** | `medium` or `M` | Takes dice only (ignores modifiers) |
| **Heavy** | `heavy` or `H` | Takes half damage from all sources |

---

## Attacks

List attacks under the `attacks:` section. Each line starts with `-`:

```yaml
attacks:
- Longsword 1d8 slashing
- Bite 2d6 piercing
- Fire Breath 8d6 fire
```

### Attack Format
```
- [Name] [Damage Dice] [Damage Type]
```

Examples:
```yaml
attacks:
- Claw 1d6 slashing
- Venomous Bite 1d4 piercing
- Life Drain (L) 2d6 necrotic
```

Add `(L)` after the name to mark it as a Legendary action.

### Rolling dice

Dice in attacks, abilities and phase text (like `1d6+2` or `2d10`) are clickable. Click one to roll it: the result pops up in a notice and is kept in the **Recent rolls** log at the bottom of the encounter tracker.

Dice in **attack lines** follow Nimble's attack rules:

- A **1** on the first (primary) die is a **miss**.
- The primary die's **max** is a **crit**: roll one more die and add it, and keep going while it rolls max.
- Otherwise it's the dice plus the modifier.

Attack lines that mention a **save** (like a breath weapon), and dice in abilities, Bloodied or Last Stand text, always roll a plain sum.

Turn the rules off with **Nimble attack rolls** in settings, or all dice clicking with **Clickable dice**.

---

## Abilities

List abilities under the `abilities:` section:

```yaml
abilities:
- Pack Tactics: Advantage on attacks when ally is adjacent to target
- Keen Senses: Advantage on Perception checks
- Sunlight Sensitivity: Disadvantage on attacks in sunlight
```

### Ability Format
```
- [Name]: [Description]
```

Add `(L)` after the name for Legendary abilities:
```yaml
abilities:
- Frightful Presence (L): Creatures within 6 spaces must make Will save or be Frightened
```

---

## Resistances & Immunities

List these as simple items:

```yaml
resistances:
- Fire
- Cold
- Bludgeoning from nonmagical weapons

immunities:
- Poison
- Necrotic
```

---

## Solo/Legendary Monsters

Nimble's Solo monsters act after **each hero's turn** instead of once per round. To create one:

```yaml
monsterType: solo
legendaryResistances: 3
bloodied: What changes at half HP
lastStand: What happens at 0 HP
actionText: After each hero's turn, choose one:
```

In the encounter tracker, solo monsters get legendary resistance pips you can click to spend, and their **Bloodied** and **Last Stand** text pops up the moment their HP crosses half or hits 0.

### Full Solo Monster Example

````markdown
```nimble
name: Young Dragon
type: Dragon
size: Large
monsterType: solo
armor: medium
hp: 120
movement: 8, fly 16
str: ++
dex: +
will: ++
legendaryResistances: 3
senses: Blindsight 6 spaces, Darkvision 24 spaces
languages: Common, Draconic
multiattack: Makes two claw attacks and one bite attack
attacks:
- Claw (L) 2d6 slashing
- Bite 2d10 piercing
- Fire Breath 10d6 fire
abilities:
- Frightful Presence: Creatures within 12 spaces must make Will save or be Frightened for 1 minute
- Wing Attack (L): All creatures within 2 spaces make Dex save or take 2d6 bludgeoning and are knocked prone
resistances:
- Fire
```
````

---

## Running Encounters

### Opening the Encounter Tracker

- Click the **swords icon** in the left ribbon, OR
- Use command palette: `Nimble Statblocks: Open Encounter Tracker`

### Creating an Encounter

1. Open the Encounter Tracker (right sidebar)
2. Type a name in the text field (e.g., "Goblin Ambush")
3. Click **+** or press Enter

### Adding Monsters

Any of these adds a creature to the active encounter, opening the tracker if it's closed:

- Click **"+ Add to Encounter"** on a stat block (Shift-click adds two)
- Click the **+** on an inline `nimble:` reference
- Click **Add monster…** in the tracker, or run the **Add monster to encounter…** command, and search your whole bestiary

Each copy is numbered: Goblin-1, Goblin-2, and so on. Numbers are never reused, so removing Goblin-1 and adding another gives Goblin-4, not a second Goblin-3. Click the pencil to rename a creature.

### Tracking Health

| Control | Effect |
|--------|--------|
| **-5 / -1 / +1 / +5** | Adjust HP |
| **Click the HP number** | Type an amount: `7` deals 7 damage, `+7` heals 7, `=20` sets HP to 20. Press Enter. |

The bar under each creature, and its border color, show its health:
- 🟢 **Green** — Above 50% HP
- 🟡 **Yellow** — 25-50% HP
- 🔴 **Red** — Below 25% HP
- ⚫ **Grey** — 0 HP

Creatures at half HP or less are tagged **Bloodied** automatically, and at 0 HP **Dying**.

The top of the tracker shows how many creatures are still standing, the encounter's total HP, and a **round counter** (use the arrows or the **Next round** command).

### Conditions

Click **+** under a creature to add a condition, and **×** on a tag to remove it. Click a tag to read what the condition does. Add your own conditions in settings.

### Removing Creatures

Click the **✕** button next to any creature to remove it, or **Clear all** to empty the encounter. Drag creatures by the ⋮⋮ handle to reorder them.

### Managing Multiple Encounters

- Create multiple encounters from the dropdown
- Switch between them using the selector
- Delete encounters with the "🗑️ Delete Encounter" button

---

## Installation

### From a release

1. Download `main.js`, `manifest.json` and `styles.css` from the latest GitHub release
2. Copy them into `<your vault>/.obsidian/plugins/nimble-statblocks/`
3. Restart Obsidian, then enable **Nimble Statblocks** in Settings → Community plugins

### From source

```bash
npm install
npm run build
```

Then copy `main.js`, `manifest.json` and `styles.css` into your vault's plugin folder as above. `./deploy.sh` does this for a dev vault at `~/Documents/DevVault`.

---

## Example: Complete Encounter Setup

### Step 1: Create Monster Notes

**Goblin.md**
````markdown
# Goblin

```nimble
name: Goblin
type: Humanoid
size: Small
armor: none
hp: 12
movement: 6
str: -
dex: ++
will: -
attacks:
- Shortsword 1d6 slashing
- Shortbow 1d6 piercing
abilities:
- Nimble Escape: Can Disengage or Hide as a bonus action
```
````

**Goblin Boss.md**
````markdown
# Goblin Boss

```nimble
name: Goblin Boss
type: Humanoid
size: Small
armor: medium
hp: 36
movement: 6
str: +
dex: ++
will: -
multiattack: Makes two scimitar attacks
attacks:
- Scimitar 1d6 slashing
- Javelin 1d6 piercing
abilities:
- Redirect Attack: When missed by an attack, can redirect it to an adjacent ally
```
````

### Step 2: Build the Encounter

1. Open Encounter Tracker
2. Create encounter: "Goblin Ambush"
3. Open Goblin.md, click "Add to Encounter" 4 times
4. Open Goblin Boss.md, click "Add to Encounter" once

Your tracker now shows:
- Goblin-1 (12/12 HP)
- Goblin-2 (12/12 HP)
- Goblin-3 (12/12 HP)
- Goblin-4 (12/12 HP)
- Goblin Boss-1 (36/36 HP)

### Step 3: Run Combat

As combat progresses, use the HP buttons to track damage. Dead goblins fade out but remain visible until you remove them.

---

## Commands

Access these from the command palette (Cmd/Ctrl + P):

| Command | Description |
|---------|-------------|
| **Open encounter tracker** | Opens the tracker sidebar |
| **Add monster to encounter…** | Search every monster in your vault and add one (Shift-Enter adds two) |
| **Next round** | Advances the tracker's round counter |
| **Insert monster template** | Inserts a basic monster template at the cursor |
| **Insert solo monster template** | Inserts a solo monster template with Bloodied and Last Stand |
| **Insert monster reference** | Starts a `` `nimble: `` reference so you can pick a monster |
| **Clear roll log** | Empties the tracker's Recent rolls list |

## Settings

| Setting | What it does |
|---------|--------------|
| **Stat block style** | Book (roomy) or Compact (tighter spacing and smaller text) |
| **Clickable dice** | Makes dice in stat blocks roll when clicked |
| **Nimble attack rolls** | Attack dice miss on a 1 and crit (exploding) on max; on by default |
| **Tap to preview on mobile** | First tap previews a monster reference, second tap opens it |
| **Multiple encounters** | Create and switch between named encounters |
| **Custom conditions** | Add, edit and delete your own conditions |

---

## Tips

1. **Organize monsters by folder** — Create a `Bestiary/` folder with all your monster notes

2. **Link monsters in adventure notes** — Use `[[Goblin]]` for simple links, or `` `nimble:Goblin` `` for inline references with hover previews and quick-add buttons

3. **Prep encounters ahead of time** — Create and name encounters before the session, then just add monsters as needed

4. **Use the sidebar** — Keep the encounter tracker open in the right sidebar during play for quick access

5. **Custom labels** — The auto-generated labels (Goblin-1, Goblin-2) help distinguish identical creatures
