---
nimble: scene
order: 1
area: Q1
---

```box read-aloud
Stone steps descend into darkness, each tread marked with worn alchemical symbols that pulse weakly when touched. Beads of mercury collect between flagstones, forming tiny moving rivers that flow toward the chamber's center. A brass brazier burns with green flame, casting strange shadows.
```

The walls bear warnings in an ancient script, some scratched out violently. **Two Quicksilver Constructs** guard the only other passage. They stay still as statues until someone tries to pass by.

```nimble-encounter
name: The constructs wake
party: true
monsters:
- 2 Quicksilver Construct
notes: The constructs only fight heroes who try to pass. Each one splits into 2 Quicksilver Droplets the first time it drops to 0 HP; add them with the tracker's quick add ("2 quicksilver droplet").
```

```box checks
| Check | DC | Result |
| --- | --- | --- |
| Arcana | 12 | The symbols are an alchemist's warding script. Reading them aloud in order makes the constructs bow and stand aside. |
| Lore | 10 | The scratched-out warnings read "DO NOT BREATHE DEEPLY" and "SHE IS NOT FINISHED". |
| Examination | 12 | The rivers of mercury on the floor all flow toward the passage to [[Q2 Mercury Pool]], as if drawn. |
```

```box exits
- **Up:** the stair to the cellar, and the street.
- **Down the passage:** [[Q2 Mercury Pool]].
```
