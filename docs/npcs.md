# NPCs

A note is an NPC when its properties say `nimble: npc`, or it's tagged `#npc`. Add `role:` for a one-line description, `aliases:` for other names, and `portrait:` for their art.

```yaml
---
nimble: npc
role: Master assayer of the Alchemists' Guild
aliases:
  - Master Kask
portrait: "[[Tobren Kask.png]]"
---
```

**New NPC** (the **+** next to NPCs in the Campaign panel, or the command palette) makes this note for you, character card included, with a set of quick-fact properties to fill in or delete:

| Property | Shown on the card as |
|---|---|
| `ancestry:`, `pronouns:`, `age:` | A line under the name: "Dwarf · he/him · 61 years" |
| `faction:`, `location:` | **Faction** and **Found at**, as links if you write `[[links]]` |
| `first_met:` | **First met**: where the party first met them (player notes) |
| `status:` | A pill: alive, dead, missing or unknown. Click it to change |
| `attitude:` | A pill: friendly, neutral, hostile or unknown. Click it to change |

Below the card, the starter has headings for Personality, What they know, Relationships, Quotes, Appears in and Notes. In a campaign you [play in](players.md), they're written from the party's side instead: First impressions, What we learned, What they want from us, Promises & debts. All of them are optional; delete whatever you don't use.

An NPC whose `location:` is a place shows on that place's card, under **Who's here** ([places](campaigns.md#places)).

## Character cards

![Tobren Kask's card: his portrait, role, ancestry and age, faction and where he's found, Alive and Friendly, his level, armor, HP and stat block with Add to fight, then his rows](images/npc-card.png)

A `nimble-npc` block shows the NPC as a card in your campaign's look: the portrait, the name, the role, the quick facts and pills, the game's numbers, then rows of your own.

````markdown
```nimble-npc
look: Built like the forge he works at. Horned helm, a hammer he never puts down.
wants: Vess's research notes back in Guild hands, quietly.
voice: Slow and heavy, like he's weighing every word on a scale.
secret: He answered one of Vess's letters, the last one. He told her to stop writing.
```
````

- **Rows** are any `Label: text` lines, so add your own (`knows:`, `fears:`, `offers:`). Text can be Markdown, with links, bold and lists. Lines without a label carry on the row above.
- **Secret** rows (`secret:` or `gm:`) are blurred until you click them, which helps when your screen is shared.
- **Name and role** come from the note's title and `role:` property. Put `name:` or `role:` lines in the block to override them.
- Type `/npc-card` to insert a card anywhere. It works in scene notes too, for a minor character who doesn't need their own page.
- **No block?** An NPC note without one still gets its card at the top in reading view. Add the block when you want rows of your own.
- In reading view, the row of properties above the card leaves out what the card already shows.

### An NPC's numbers

In a Nimble campaign, an NPC can carry the book's numbers, for when the party ends up fighting them. **New NPC** adds these properties, empty; fill in what you need:

| Property | Example | On the card |
|---|---|---|
| `level:` | `level: 3` | Level 3 |
| `armor:` | `armor: M` (or `medium`, `H`, `heavy`, `none`) | The armor letter on its shield |
| `hp:` | `hp: 40` | HP in a heart |
| `statblock:` | `statblock: City Guard` (or `[[City Guard]]`) | The monster block they fight with, as a reference: hover it for the block, click it for a quick look |

**Add to fight** puts the NPC in the tracker under their own name, with the stat block's attacks and the NPC's own level, armor and HP on top. With no stat block, HP is enough. The GM sees all of this; players never do. In a 5e campaign, NPCs get a small character sheet instead: see [Playing 5e](5e.md#npcs).

### In a campaign you play in

Your NPC notes are your own: the card shows the portrait, name, role, facts and pills, then your rows under **What we know**. There are no numbers, and no secret rows (the player starter has `suspicions:` instead).

## Portraits

A card without a portrait shows an empty frame. Click it to:

- **Upload an image…** from your computer, or your photo library on a phone. It's copied into your vault, following your attachment folder setting in **Settings → Files and links**.
- **Choose from vault…** to pick an image you already have.

On desktop you can also drop an image file straight onto the frame.

Once it has a portrait:

- **Click it** to see it large, for a closer look or to turn the screen to your players. On desktop, **Show in its own window** opens it in a pop-out you can drag to a second screen.
- **Hover** over it and use the image button to change or remove it. You can also right-click it.
- The portrait is the NPC's icon in the Campaign panel, and it shows in hover previews of the note.

The portrait is saved in the `portrait` property, as a link like `"[[Tobren Kask.png]]"`, so you can also set it by hand. It can be an `https://` image URL too, although that image is then loaded from the internet. If a face gets cropped, set `portrait-position:` to a CSS position such as `top`, `center 10%` or `40% 30%`.

**Finding art:** art you drew, commissioned or bought for your table is fine for your own game. Before you share a vault with someone else's art in it, check the art's license allows that, and credit the artist.

## Links and mentions

- **Links become chips.** `[[Tobren Kask]]` shows as a green person chip, in reading view and Live Preview. Clicking a chip or a linked mention opens the NPC's note in a quick look over your page, with **Open page** if you want to go there; Cmd/Ctrl-click opens the page directly. Links to other campaign notes get pills too ([campaigns](campaigns.md#links-to-campaign-notes)).
- **Mentions are linked as you read.** The NPC's name or an alias anywhere in that campaign's notes gets a dotted underline and a hover preview. In Live Preview, Cmd/Ctrl-click opens the note. Your files aren't changed. Turn this off with **Link NPC names as you read** in settings.
- **`/npc`** searches the campaign's NPCs and inserts a link. Typing a new name offers **New NPC**, which creates the note in the campaign's NPCs folder.
- **Generic creatures** (a cultist, a zombie) are better as bestiary references (`` `nimble:Cultist` ``). NPCs are the named people with their own pages, and they can carry a stat block too.
