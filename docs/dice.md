# Dice

- **Interactive text:** dice are clickable, and attack lines follow Nimble rules (a 1 on the first die misses, its max crits and explodes). Condition names such as Grappled or Prone show their rules when clicked.

## 3D dice

Clicking a dice expression throws real dice across the screen. They tumble, collide and bounce differently every time, yet always land on the rolled result. The notice appears when they land. 3D dice switch off by themselves without WebGL or with reduced motion, and phones only get them if you turn that on.

Everything below is in **Settings → Ember Vault → 3D dice**.

### Dice workshop

**Open dice workshop** (in the 3D dice settings, or **Open dice workshop** in the command palette) opens a workshop on top of settings:

- **Roll a pool**: add any mix of up to 12 dice and throw them.
- **Test a moment**: a crit (pick the die and how many times it explodes), a miss, a max roll or a min roll.
- **Effects**: pick the effect for each moment. Changing one plays it straight away, and ▶ replays it.
- **Look**: try any look on every die, then **Use for all dice** to keep it.
- **Size and motion**: dice size, speed, throw, shadows and how long the dice stay.

Rolls in the workshop aren't logged. Effects, size and motion you change there are saved.

### Looks

The gallery shows every look: the presets, your own, and any you've imported. Click one to see it turning in the preview (pick d4 to d20 under it), then:

- **Use for all dice**, **Primary die** or **Crit dice** to put it to work
- **Roll them** to throw one of each die in that look
- **New look** to make an editable copy of whichever look is selected

A look you own can change:

| Setting | What it does |
|---|---|
| Body colour | One colour, or up to six for a mixed set (each die picks one) |
| Numbers, number outline, edges | Colours for the numbers, an outline around them, and lines along the edges |
| Finish | Plastic, resin, pristine, velvet, stone, wood, metal, chrome, glass, frosted glass, iridescent, or the animated lava, nebula, opal, frost, marble and glitter |
| Texture | Speckles, marble veins, wood grain, stone, clouds, stars, swirl, dragon scales, parchment or hex grid. Or **Image from vault…** to use any picture in your vault |
| Texture blend | How the texture mixes with the colour: multiply, overlay, soft light, screen, paint over, or tint to the body colour |
| Font, number size | Sans, serif, monospace, rounded, old style or your Obsidian font, from 60% to 140% |
| 3D models | Use an imported set's models for the die sizes it has |

### Which dice use which look

- **Other dice**: every die that isn't an attack's primary die or a crit.
- **Primary die**: the first die of an attack.
- **Crit dice**: the dice that explode on a crit, and the primary die that set them off.
- **Per die size**: give a d20 (or any size) a look of its own.

### Size and motion

- **Dice size**: 50% to 300%. If that many dice won't fit on your screen at that size, they shrink just enough to stay on it.
- **Speed**, **Throw** (gentle, normal or hard), **Stay on screen** (1 to 8 seconds) and **Shadows** (off, soft or sharp).

### Crits and effects

A crit's extra dice burst out of the die that exploded, and the crit dice glow while they're on screen. Each kind of roll can also play an effect:

| Effect | What you see |
|---|---|
| Ring burst | A shockwave along the table: gold for a crit, red for a miss |
| Sparks, Embers | Hot streaks flying out, or embers drifting up |
| Starburst, Twinkling stars, Shooting stars | Glints bursting out, a dome of stars winking in and out, or stars streaking away |
| Nebula | A swirling cosmic cloud with stars glinting inside |
| Supernova | A white-hot flash with rays and a racing shock ring |
| Arcane circle | A rotating rune circle under the dice, in the roll's colour |
| Confetti, Smoke, Shatter, Gloom | A party, a billow of smoke, glass shards, or a dark mist |

Effects are tuned for both light and dark themes.

- **Effect on a crit**: plays once as each die explodes out (a gold ring burst by default).
- **Effect on a miss**: an attack that rolls a 1 (a red ring burst from under the die by default). The die that missed also dims.
- **Effect on a max roll**: every die on its highest face, like a natural 20 (a supernova by default).
- **Effect on a min roll**: every die on a 1 (not an attack).

**Test roll**, **Test crit**, **Test miss** and **Test natural 20** try them out.

### Importing from Dice So Nice

Ember Vault reads dice made for Dice So Nice, the Foundry VTT dice module:

- **A dice set**: paste the module.json link from your download page (this is how The Rollsmith delivers sets) and press **Import link**, or use **Import file…** on the module's zip. Sets that come as 3D models (like The Rollsmith's) roll as those models, and still land on the number you rolled. Colour sets in a module become looks.
- **Your Dice So Nice settings**: in Foundry, open Dice So Nice's **Profiles & Data** tab and export, then **Import file…** that JSON. Your dice look, any die sizes you'd set apart, and each saved profile become looks.

Imported files stay on your device, in the plugin's folder. Only model and image files are kept. A set's scripts are read as data and never run. Imported dice belong to their creators: check a set's license before you use it outside Foundry.

## The roll log

Every roll is kept in the tracker's **Recent rolls** list. Right-click an entry for **Copy result**. **Clear roll log** in the command palette empties it.

## Rolling into a note

`/roll 2d6+3` rolls now and writes the result into the note, either plainly or as a Nimble attack.
