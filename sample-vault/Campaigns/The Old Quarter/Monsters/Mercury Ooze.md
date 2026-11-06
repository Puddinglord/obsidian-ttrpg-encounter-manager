---
nimble: monster
---

Born from failed experiments where mercury was mixed with various alchemical catalysts, these semi-conscious masses survived by absorbing both metal and magical energy. They lurk in dark corners of the vault, drawn to anything metallic, from coins to armor, which they attempt to dissolve and incorporate into their mass.

```nimble
name: Mercury Ooze
level: 3
size: Large
type: Ooze
hp: 36
armor: none
movement: 4
saves: STR+
attacks:
- **Engulfing Touch.** 2d6+2.
abilities:
- Corrode: A creature that hits it with a metal weapon makes a DEX save DC 12, or the weapon's damage die drops one size (minimum d4) until it's cleaned and sharpened.
- Split: The first time it drops to 10 HP or less, it divides into two oozes, each with half the HP left. It only splits once.
- Drawn to Metal: It always moves toward the creature wearing the most metal.
vulnerabilities:
- Cold
group: Vess's failures
habitat: The Quicksilver Vaults
easier: It doesn't split.
harder: Both halves keep Corrode at DC 14.
```
