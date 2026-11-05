---
nimble: npc
role: The Alchemist, half flesh and half mercury
aliases:
  - The Alchemist
  - Sylvie Vess
  - Vess
portrait: "[[The Alchemist.png]]"
portrait-position: center 15%
---

```nimble-npc
look: Hovers above the silver circle. Flesh with the sheen of polished metal; quicksilver tears flow upward from her eyes.
wants: To finish the final transformation, and turn all of reality into her vision of liquid perfection.
voice: Like fingers on crystal. Calm, delighted, a teacher with a slow class. Calls the heroes "material".
weakness: She can't hold her shape where the silver inlay of the circle is broken.
secret: She still writes to the Guild. The letters are in the Q5 notes, unsent, addressed to Tobren Kask.
```

Magistrix Vess achieved her dream of metallic transcendence, but at the cost of her humanity. Now she exists in a state between flesh and mercury, continuing her work with singular purpose. She sees herself not as mad, but as a pioneer on the brink of transforming all of reality into her vision of liquid perfection.

## Stat block

```nimble
name: The Alchemist
level: 2
role: legendary
size: Medium
type: Humanoid (mercury)
hp: 24/hero
armor: none
movement: 6, fly 6 (hover)
saves: INT+ WIL+
actionText: After each hero's turn, choose one:
attacks:
- **Staff and spell.** Reach 1. 1d6+2, and the target is Slowed until the end of its next turn.
- **Metallic Burst.** Cone 3. DEX save DC 12 or take 2d6 damage and be Slowed for 1 round.
- **Quicksilver Binding.** Range 6. STR save DC 13 or Restrained. A Restrained creature takes 1d6 at the start of each of its turns, and repeats the save to break free.
abilities:
- Mercury Skin: A creature that hits her with a melee attack makes a STR save DC 10 or takes 1d4 damage.
bloodied: At half HP, the circle's channels pour upward. If the Mercury Elemental isn't fighting yet, it rises from the circle now.
lastStand: At 0 HP she regains 6 HP per hero and the whispering becomes a scream. Every hero inside the circle is Dazed until she drops again.
easier: Skip Quicksilver Binding.
harder: She starts the fight with the Mercury Elemental and 2 Quicksilver Hounds.
description: "My failures birthed monsters. My successes? Far worse."
```
