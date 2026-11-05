# Nimble bestiary extraction brief

Goal: transcribe every monster stat block in an assigned page range of a Nimble TTRPG book into JSON, accurately. The JSON ships inside an Obsidian plugin as its bestiary (Nimble's creator has given permission to include the text, with attribution), so faithful transcription matters more than anything else. Don't invent, summarise or "improve" rules text.

## Sources (read only)
- Monsters & More (M&M): `/Users/dakotah/Downloads/Nimble/NimbleExpansionDraftFiles/MonstersAndMoreDraft/MonstersAndMore-v0.1.pdf` (124 PDF pages; PDF page N ≠ printed page number)
- GM Guide (GMG): `/Users/dakotah/Downloads/Nimble/NimbleCoreDraftFiles/CoreBooks3.0/NimbleGMG3.0.pdf` (57 PDF pages)

The books are two-column layouts, so plain text extraction interleaves columns and separates names from their stats. Use both:
- text: `pdftotext -f N -l N -layout <pdf> -` (and without `-layout`)
- image: `pdftoppm -f N -l N -r 110 -png <pdf> /tmp/bestiary/pages/<yourtag>-p` then view the PNG with the Read tool. **Read every page visually**; use the text only to copy wording exactly. Put scratch files only under `/tmp/bestiary/`.

## Stat block conventions in these books
- Header line like `lvl 2, large`, `lvl 1/2`, `lvl 3 Legendary Large Owlbear`, `lvl 2 Solo Angry Bugbear`, `minion, small`, `Lvl 3x (triple the lvl of all nearby Kobolds), Large`.
- Name line, then stat tokens rendered as icons: `[hp]31` (HP; `[hp]28/hero` = per hero), `[ar]M` / `[ar]H` (armor), `[mv]8` (Speed), `[fly]`, `[swm]`/swim, `[clb]`/climb, `[bur]`/burrow, `[sv]STR+ DEX-` (saves). Icons may show as pictures in the image; the text layer has the bracket tokens.
- Defaults when omitted: Medium size, unarmored, Speed 6, no special saves.
- Passive abilities as `Name. text`; actions often bulleted `• Name. text`, sometimes joined with "Or:" / "Then:".
- Legendary/Solo blocks: `LEGENDARY: After each hero's turn, choose one:` (or `ACTIONS: …`), `BLOODIED:` and `LAST STAND:` entries.
- Minions "follow minion rules"; some give a die size (e.g. `size:d8`).
- M&M blocks often have an italic flavour paragraph and two tactics lines marked with icons that extract as `d` (easier/"dial down") and `c` (harder/"crank up").
- Group headings (creature families like "Goblins", "Forest Wolves", "Enemy Heroes") and group-wide abilities printed once for the family.

## Output
Write a single JSON array to the path given in your task. One object per stat block:

```jsonc
{
  "name": "Goblin Taskmaster",
  "book": "M&M",              // "M&M" or "GMG"
  "page": 6,                   // printed page number (look at the page footer); null if none
  "pdfPage": 9,
  "group": "Goblins",          // family/section heading, or null
  "habitat": null,             // environment heading if the book groups by one (e.g. "Hill & Field"), else null
  "levelText": "2",            // exactly as printed: "1/2", "3x", "1 (per hero)", "" for minions without level
  "level": 2,                  // number (1/2 → 0.5, 1/3 → 0.3333, 1/4 → 0.25, 1/8 → 0.125); null if not numeric
  "size": "Small",             // Tiny|Small|Medium|Large|Huge|Gargantuan (default Medium)
  "kind": null,                // creature descriptor printed in the header (e.g. "Angry Bugbear", "Owlbear"), else null
  "role": "regular",           // regular | minion | legendary | solo
  "armor": "none",             // none | M | H
  "hp": 30,                    // flat HP, or null
  "hpPerHero": null,           // N for "[hp]N/hero"
  "hpText": null,              // only if HP is printed in some other way
  "speed": 6, "fly": null, "swim": null, "climb": null, "burrow": null,
  "movementText": null,        // anything unusual about movement
  "saves": "STR+ DEX-",        // as printed, normalised spacing; null if none
  "resist": [], "vuln": [], "immune": [],   // only if printed as such
  "minionDie": null,           // e.g. 8 for size:d8
  "traits":  [{ "name": "Meat Shield", "text": "Can force other Goblins to Interpose for you." }],
  "actionsIntro": null,        // e.g. "After each hero's turn, choose one:" when printed before actions
  "actions": [{ "name": "Stab", "text": "1d6 (or Shoot, Range 8). Then:" }],
  "bloodied": null,            // { "name": "...", "text": "..." } — name may be "" if none printed
  "lastStand": null,           // same shape
  "flavor": "…",               // flavour paragraph if present, else null
  "tactics": { "easier": "…", "harder": "…" }, // or null
  "groupTraits": [],           // family-wide abilities printed once that apply to this monster: [{name,text}]
  "notes": null                // anything uncertain, or differences you noticed; keep short
}
```

Rules:
- Transcribe wording exactly, but tidy extraction artifacts: rejoin hyphenated line breaks, fix obvious OCR splits, keep dice like `2d6+4` exact, keep capitalisation of game terms (Grappled, Prone, Reach 2).
- Replace stat icons inside rules text with words: `[hp]10/hero` → "10 HP per hero"; `[mv]` → "Speed".
- For legendary/solo monsters, put the choose-one options in `actions` and the header sentence in `actionsIntro`.
- A stat block split across a column or page break is still one entry.
- Skip non-monster boxes (items, traps, hazards, encounter tables) unless they are written as a stat block with a level and HP; if a trap/hazard has a full stat block, include it with `kind: "Hazard"`.
- If two blocks share a name (e.g. variants), keep both and disambiguate in `notes`.
- Count the blocks on each page as you go; at the end, make sure your count matches the number of entries.

## Report back
Under 150 words: the output path, number of entries, a list of any pages you couldn't read cleanly, and any judgement calls.
