# GM maps

![The Quicksilver Vaults map with a pin on every area](images/map.png)

````markdown
```nimble-map
image: [[Cragmaw Hideout.jpg]]
grid: 30x20
pins:
- 40, 78 | 1. Cave Mouth | [[Part 1#1. Cave Mouth]] | area
- 18.3, 35 | 8. Klarg's Cave | [[Part 1#8. Klarg's Cave]] | encounter
```
````

Pins link to notes or headings, with Obsidian's hover preview. Clicking a pin shows its note in a quick look over the map, so you don't lose your place; Cmd/Ctrl-click (or **Open note** in its menu) opens the page. Images and PDFs open as pages. **Add pin**, **Move pins** and right-click (long-press on touch) → **Edit pin…** all save back into the block. A map shown inside another note (an embed or a hover preview) is view-only: open its own note to change pins. Scroll or pinch to zoom, drag to pan, double-tap to zoom in, and press `0` to fit. **Encounter tokens** shows the fight in the tracker as tokens you can drag onto the map, kept in plugin data rather than the note. In a 5e campaign it's the 5e fight, in initiative order once it starts.

The map wears the look of its campaign's game. The tag button shows every pin's label, and the buttons at the right zoom out, zoom in and fit the map.

| Pin kind | Icon | Colour |
|---|---|---|
| place, area, npc, note | Map pin, flag, person, note | The game's ink: charcoal in Nimble, oxblood in 5e |
| encounter, danger | Swords, skull | Red (a darker oxblood in 5e) |
| treasure | Chest | Ochre in Nimble, gold in 5e |
| secret | Eye with a slash | Near black |

Tokens are the game's dark discs (charcoal in Nimble, oxblood in 5e), with heroes on the game's paper. A legendary monster's token has an ochre ring (gold in 5e), and tokens fade when that creature has gone and grey out when it's down.

## Adding a map

1. Put the map image in your vault (a campaign's `Assets` folder is a good home).
2. Type `/map` and pick the image. You get a map block.
3. Select **Add pin**, click the map, and choose a label, a kind and a note or heading to link to.

Pin positions are stored as percentages of the image, so you can swap in a bigger or smaller version of the same map later and the pins stay put.

A note with `nimble: map` in its properties, inside a chapter folder, shows up as a map button on that chapter in the Campaign panel.
