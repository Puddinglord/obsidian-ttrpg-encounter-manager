---
nimble: scene
order: 6
area: Q6
---

```box read-aloud
Metal-bound crates leak coloured smoke, each a different hue. Glass jars line copper shelves, holding preserved specimens that still move. Copper tubes connect the containers in a maze-like pattern.
```

**Four Quicksilver Hounds** lurk among the crates. They formed from spilled mercury mixing with alchemically preserved animal remains, and they hunt as a pack.

```nimble-encounter
name: Hounds among the crates
party: true
monsters:
- 4 Quicksilver Hound
notes: They slip through the gaps between crates to come at heroes from two sides. When two are down, the rest flee through the copper tubes and turn up again in Q7.
```

```box trap title="Toxic gas"
**Trigger:** opening more than two crates.
**Effect:** every creature in the room makes a STR save DC 15 or takes 3d6 poison damage.
**Disarm:** opening crates one at a time from outside the door, with a pole or a rope, means only whoever's holding it is in the gas.
```

```box treasure
- **3 random potions**, in the one crate that doesn't smoke.
- **Scroll of Gaseous Form:** the reader turns to mist for 10 minutes and can pass through any crack.
- **Rare alchemical ingredients** worth 400 gp to the Guild, or double that to the right buyer.
```

```box exits
- **North:** [[Q4 Shattered Laboratory]].
```
