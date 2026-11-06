---
nimble: monster
---

The spirit of an apprentice who died in Vess's furnace during an early attempt at transformation. The intense heat and alchemical residue preserved their consciousness in the ash and smoke. Now it haunts the Calcination Room, bitter and vengeful, seeking to share its burning emptiness with the living.

```nimble
name: Ash Phantom
level: 3
size: Medium
type: Undead
hp: 30
armor: none
movement: fly 6
saves: DEX+ WIL+
attacks:
- **Burning Touch.** 1d8+4. On a hit: STR save DC 12 or the target's max HP drops by 1d4 until its next Safe Rest.
abilities:
- Incorporeal: Resistant to damage from non-magical weapons. It can move through solid objects.
- Ash and Water: A bucket or waterskin of water thrown on it makes it Dazed until the end of its next turn.
resistances:
- Non-magical weapons
group: Vess's failures
habitat: The Quicksilver Vaults
easier: Burning Touch drops max HP by 1, not 1d4.
harder: It starts the fight Invisible inside the smoke.
```
