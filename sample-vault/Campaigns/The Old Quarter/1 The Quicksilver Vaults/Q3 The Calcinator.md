---
nimble: scene
order: 3
area: Q3
---

```box read-aloud
A massive iron furnace squats in darkness, its maw cold but lined with crystalline residue that glows faintly blue. Blackened chains hang from the ceiling in a deliberate pattern that suggests a ritual purpose.
```

**An Ash Phantom** waits inside the furnace. It emerges if the furnace or the chains are disturbed. It's the spirit of an apprentice who died here, in Vess's early attempts at transformation.

```nimble-encounter
name: The Ash Phantom
party: true
monsters:
- 1 Ash Phantom
notes: It emerges from the furnace mouth in a rush of cold ash. It goes for whoever disturbed the furnace first, and won't leave the room.
```

```box trap title="Crystal residue"
**Trigger:** harvesting the glowing residue from the furnace walls.
**Effect:** DEX save DC 10 or take 1d4 damage from the cuts.
**Reward:** 3 doses. Each one drunk works as a potion of fire resistance: Resistant to fire for 1 hour.
```

```box clue title="The chains"
The chains hang in the same pattern as the silver inlay in [[Q7 Sacred Circle]]. A hero who studies them (**Lore**, DC 12) learns the circle's weak point: one link in the pattern is a deliberate break, and the same break in the inlay is where it can be scraped through.
```

```box exits
- **North:** the passage back to [[Q2 Mercury Pool]].
- **South:** [[Q7 Sacred Circle]]. The whispering of formulas is loud from here.
```
