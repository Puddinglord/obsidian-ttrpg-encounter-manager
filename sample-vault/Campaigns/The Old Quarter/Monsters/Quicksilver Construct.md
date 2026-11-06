---
nimble: monster
---

These guardians were Vess's first successful fusion of mercury and animation magic. Originally meant to be simple laboratory assistants, they developed an unsettling tendency to split and reform when damaged. The constructs still follow their original directives to protect the vaults, though their interpretation of "protection" has grown more aggressive over time.

```nimble
name: Quicksilver Construct
level: 2
size: Medium
type: Construct
hp: 24
armor: none
movement: 6
saves: STR+
attacks:
- **Slam.** 1d8+3.
abilities:
- Split: The first time it drops to 0 HP, it splashes apart into 2 Quicksilver Droplets in its space.
- Old Directives: It doesn't attack anyone who reads the warding symbols on the stair aloud, in order.
vulnerabilities:
- Cold
group: Vess's creations
habitat: The Quicksilver Vaults
easier: It splits into 1 Droplet, not 2.
harder: Droplets split again, once, into 2 more Droplets.
```
