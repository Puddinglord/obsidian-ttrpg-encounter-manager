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
```

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

1. Navigate to a note with a monster stat block
2. Click **"+ Add to Encounter"** on the stat block
3. The monster appears in your tracker with a label like "Goblin-1"

Each time you add the same monster, it auto-numbers: Goblin-1, Goblin-2, etc.

### Tracking Health

For each creature in the encounter:

| Button | Effect |
|--------|--------|
| **-5** | Subtract 5 HP |
| **-1** | Subtract 1 HP |
| **+1** | Add 1 HP |
| **+5** | Add 5 HP |

The creature's border color indicates health status:
- 🟢 **Green** — Above 50% HP
- 🟡 **Yellow** — 25-50% HP
- 🔴 **Red** — Below 25% HP
- ⚫ **Grey** — 0 HP (dead)

### Removing Creatures

Click the **✕** button next to any creature to remove it from the encounter.

### Managing Multiple Encounters

- Create multiple encounters from the dropdown
- Switch between them using the selector
- Delete encounters with the "🗑️ Delete Encounter" button

---

## Installation

### First Time Install

1. Download and unzip the plugin
2. Open terminal in the plugin folder
3. Run:
   ```bash
   npm install
   npm run build
   ```
4. Copy the built files to your vault:
   ```bash
   # Replace with your vault path
   ./install.sh ~/Documents/MyVault
   ```
5. Restart Obsidian
6. Enable "Nimble Statblocks" in Settings → Community Plugins

### Updating the Plugin

After downloading a new version, just run:
```bash
./install.sh ~/Documents/MyVault
```

This rebuilds and copies the new files automatically.

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
| **Open Encounter Tracker** | Opens the tracker sidebar |
| **Insert Monster Template** | Inserts a basic monster template at cursor |

---

## Tips

1. **Organize monsters by folder** — Create a `Bestiary/` folder with all your monster notes

2. **Link monsters in adventure notes** — Use `[[Goblin]]` to quickly reference and open monster stats

3. **Prep encounters ahead of time** — Create and name encounters before the session, then just add monsters as needed

4. **Use the sidebar** — Keep the encounter tracker open in the right sidebar during play for quick access

5. **Custom labels** — The auto-generated labels (Goblin-1, Goblin-2) help distinguish identical creatures
