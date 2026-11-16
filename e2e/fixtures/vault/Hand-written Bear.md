# Hand-written bear (issue #17)

```nimble
name: Misha's Bear
level: 2
role: solo              # regular, minion, legendary or solo
size: Large
type: Angry Brown Bear
hp: 25             # or a flat number
armor: none             # none, medium (M) or heavy (H)
movment: 6/10 charge             # e.g. 8, fly 10
saves: STR+
actionText:
- **Charge:** When first encountered, it can charge up to 10 in a
direct line and hit with its paw. If hit, knocked prone unless you
make a STR or Dex save vs DC 12
Attack either
- **Paw** 3d6+2 (12).
- **Bite 1d6+2 (5).

**BLOODIED:** (12) If bloodied, it can bite as a free
action.
easier: Have the Manglemaul jam after using Crack Skulls.
harder: Move often; end turns out of melee reach.
```
