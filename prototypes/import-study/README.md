# Import…: a design study

A clickable mock of the Import dialog (`src/core/import/dialog.ts`, issue #27) at full size: a real drop zone, a list of what was given, and a preview of each record drawn the way the vault will show it.

```bash
open prototypes/import-study/index.html                 # every state; Frame, Game and Theme switches at the top
open "prototypes/import-study/index.html#review-map/phone"
node prototypes/import-study/shots.mjs                  # every state into shots/ (and checks for script errors and spill)
node prototypes/import-study/shots.mjs phone            # only the phone shots
```

The hash is `#<state>/<desktop|window|phone>[/list|/detail][/dark][/5e]`. Content is made up (Mire Hag, Irinia, the Sunken Crypt). The previews in the mock are stand-ins; the plugin draws the real ones (see "What each preview reuses").

## What was wrong

The dialog is 620px wide. It has the browser's own "Choose Files" button, an 8-row textarea that drops to 3 rows after reading, and the report under it. The drop target can't be seen. The only preview is raw JSON in a textarea, and on a phone everything stacks into one long scroll.

## Decisions

1. **One frame for every step.** The dialog is always the same size, as the builder is: `width: min(1080px, 96vw); height: min(780px, 92vh)`, full screen on phones. Nothing jumps as files are read. From top to bottom: title, **sources**, **read band**, **body**, **footer**. Only the body changes between states.
2. **Start is a big target.** The body is the drop zone and file chooser (a button: click, Enter or Space opens the picker), with the paste box beside it. Paste takes text or a link and is detected as you type, as it is today. One line under them lists what's read, built from `allImporters().map(i => i.label)` so it matches what's installed, and ends with a link to the import guide. On a phone (no drag and drop) the zone is a large **Choose files** button.
3. **The whole dialog is the drop target.** Dragging files over any part of it shows one overlay: "Drop to add 2 files" (counted from `dataTransfer.items` during `dragover`). Dropping always adds to what's there and never replaces it. ⌘V outside a text field pastes into the paste box, and a picture copied to the clipboard (`clipboardData.files`) comes in as a file.
4. **Sources are chips, not a file input.** Each file gets one chip with a kind icon or a thumbnail for pictures, its name, its size and what it is (`14 KB · bundle`, `1.2 MB · 1500 × 1000`), and a remove ×. A picture whose base name matches a data file (`crypt.json` + `crypt.png`) shares a box with that file, with a link glyph between them, so the pairing is visible before anything is read. Pasted text is a chip too (`Pasted text · 31 lines`), and so is a link. **+ Add** opens the picker again. A file that can't be read says so in red on its own chip.
5. **The read band says what it is, once.** It shows the source's name in the game's display face, then the format, what's inside, the game, the licence and the source link. On the right sit **Read as** (only when more than one importer fits), **Convert to <game>** (a switch, only when it applies), and "N to look at" for warnings about the whole bundle. The warnings open in place.
6. **Review is master–detail.** The checklist is on the left (`minmax(280px, 34%)`) and the selected record's preview on the right.
   - **Grouped by what will happen**, in this order: New, Updates, Already imported, Already yours, Left out. Each group header shows its count and folds. Already imported and Already yours start folded, and Left out starts open so its reasons are seen.
   - **Status is the group plus a glyph, never colour.** Rows that can be imported have a checkbox. The others have a glyph in its place: check-circle (imported), lock (yours), prohibit (left out). There are no stripes. The selected row gets a full tint and outline.
   - **Each row has two lines**: the name, then the kind plus one useful fact (`Monster · Level 4 · Fey`, `Map · 7 pins · 30 × 20`, `Monster · 2 changes`, `Monster · No HP and no stat block`). A record with something worth a look gets a warning glyph at the row's end. A converted record gets a **Converted** tag.
   - **All N** (tri-state) is at the top, with **Filter** once there are more than six records (a Nexus collection can bring 80).
7. **The preview is the thing itself.** The detail head shows the name in the game's name face, a status tag (New, Update, Imported, Yours, Left out), the kind and fact, an **Import** checkbox (the same tick as the row's) and ↑/↓ to step through records. Under it is a tab row:
   - **Preview**: drawn by the renderer the vault uses (below). Notes come first: "Worth a look", conversion notes, "Imported before" with **Open**, "The vault has its own…" with **Open yours**, and "Left out" with the reasons.
   - **Changes** (updates only, and their first tab): field by field, what the vault has against what the import brings. The rest of the note stays as it is, and the tab says so.
   - **Original** (converted records only): the record as its own game draws it.
   - **Source**: the file's text as code, with line numbers and a light tint for keys, strings and numbers, switching between **This record** and **Whole file**, plus **Copy**. When the whole file is shown, the record's lines are tinted. Left-out records open on Source, under their reasons.
8. **Errors carry their evidence.** An unreadable file names itself and its line ("crypt.json isn't valid JSON. Line 14: a comma is missing after the closing brace."), and the source shows below with that line marked. When nothing recognises the input, the card offers **Read as** with every importer, because a chosen importer's own error is clearer than "not recognised". It also links the import guide and shows the text.
9. **Links stay explicit.** A link shows a card with the address and a **Fetch from <host>** button. Fetching shows a spinner and **Stop**. If the fetch fails, the card gives the site's answer in plain words and **Try again**. If no importer reads the host, the card says Ember Vault can't read links from that site and points at the file. A D&D Beyond link is never fetched: **Open the data** opens its character-service address in the browser, to copy and paste back (today's hint, moved into the card).
10. **Custom reviews keep the frame.** A D&D Beyond character or a content pack gets the same sources, read band and footer, and its `CustomReview.render` draws into a centred column 720px wide. The footer's main button takes `custom.action` ("Add pack").
11. **After Import the dialog stays open on Done.** It shows "Added 6, updated 1", one row per note written (icon, name, path, **Open**), and every failure with its reason. The footer has **Import more** (back to Start, keeping nothing) and **Done**. When exactly one note was written, the main button is **Open <name>**. A Notice only appears when the dialog was closed while writing.
12. **Footer**: Cancel on the left. The main button on the right counts what's ticked: **Import 7**. It's off when nothing is ticked, and shows `⌘↵` beside it on desktop.

## States (all in the mock)

| State | Body |
|---|---|
| Start | Drop zone + paste box + "Reads …" line |
| Dragging | Overlay over the whole dialog ("Drop to add 2 files" / "1 more file") |
| Link pasted / Fetching / Fetch failed / Unknown link / D&D Beyond link | A status card with the address |
| Reading | A status card, shown only after ~200ms |
| Not recognised | A status card with Read as, the guide, and the text |
| Unreadable file | A status card with the file's error, and its source with the line marked |
| Review | Checklist + preview (monster, minion, NPC, location, map with pins, item, update with Changes, already imported, yours, left out, Source) |
| A map without its picture | The map's preview is a dashed drop target: "crypt.png is missing", with **Add crypt.png** |
| Pasted 5e in a Nimble campaign | Read as + Convert to Nimble; the record is tagged Converted, with notes, and has an Original tab |
| Nothing new | The list (all already imported) still previews; Import is off |
| D&D Beyond character, content pack | Custom review in the frame |
| Done | What was written, with Open; failures |

## Layout by width

The dialog is a size container (`container-type: inline-size`), and its layout follows its own width, not the window's.

- **720px and wider**: two columns. Sources and the read band stay put above them. The list and the preview scroll on their own.
- **Under 720px** (a 700px window, a split pane, a tablet in portrait): one column. Sources, the read band and the All/Filter row scroll away with the list, so the list gets the height. Tapping a row **pushes** the preview over the list from the right (`translateX`, 240ms, none with reduced motion). The preview's head has ← back and the Import tick, and the ↑/↓ steppers are hidden. The footer stays, so Import works from either view. The hidden preview is `visibility: hidden`, so it's out of the tab order and its shadow doesn't leak.
- **Phone (390)**: as under 720px, at full screen. The close button is round and sits top right, and the footer is Cancel 1 : Import 2 (as the compact dialogs already lay out their footer). Rows are 56px tall. The start view puts Choose files above Paste.
- The start view stacks under 720px. Map previews fit the pane's width, with the key under the map.

Checked at 1280 (dialog 1080), 700 (dialog 672) and 390 (phone), light and dark, Nimble and 5e. `shots.mjs` checks for sideways spill and found none.

## What each preview reuses

| Record | Draw it with | Notes |
|---|---|---|
| Content entry: monster, spell, item, class… | `system.content.writeEntry(kind, value, edition)` → `{ lang, body }`, then `MarkdownRenderer.render(app, "```" + lang + "\n" + body + "\n```", el, sourcePath, component)` | The block processors draw exactly what the note will show: Nimble's stat block (`render.ts`), 5e's (`renderStatblock5e`), ```nimble-spell/-item blocks (`drawNimbleContent`, `GameContent.card`). One path for every kind and game, with no new renderer. Use a `Component` owned by the dialog and unload it on each redraw. With no section info, the blocks render read-only, as in embeds. Fallback when `writeEntry` returns null: `GameContent.card(el, { kind, value }, ctx)`. |
| Converted monster | Same, on the converted entry. **Original** tab: the same on the source game's entry | |
| NPC | Factor the drawing out of `NpcCard` (core/npc-card.ts, a `MarkdownRenderChild` today) into `drawNpcCard(el, plugin, { fm, card, path })`, plus the game's `noteKinds.npc.card(el, { path, fm, player: false })` (Nimble `drawNpcNimble`, 5e `drawNpc5e`) for its stats | `fm` comes from `record.value.fields`, the card from `record.value.card`. The body goes through `MarkdownRenderer` under the card. |
| Location, quest | `drawCampaignCard(parent, kind, { plugin, path, fm, text, player: false, extras })` (core/campaign-cards.ts) | Already takes properties and text. `path` is the note's planned path. |
| Map | New `drawMapPreview(el, { imageUrl, pins, grid })` in core, using the pin markup and CSS of the ```nimble-map block (`app/map-block.ts`, `PIN_ICON`) | `MapBlock` needs a post-processor context and an image in the vault, so it can't be used as is. The image is a blob URL (`URL.createObjectURL(new Blob([bytes]))`) from the paired file or the bundle's `files`. Revoke it on close. Pins are percentages, so they sit right at any size. The key lists `pin.label`, `pin.note ?? ''` and `pin.text`. The "location note for each room" switch lives here (issue #27 stage 4). |
| Changes | `stableText`-style field diff between the vault's `Have.value` and `record.value` | `planRecords` already finds `earlier`. Keep `earlier.value` on the `PlanItem` (`before?: Record<string, unknown>`) so the dialog can diff it. |
| Source | `.ev-import-code`, built with `createSpan` per token (never `innerHTML`) | For a record, show `JSON.stringify(record.value, null, 2)` ("as read"). For the whole file, show the input text, capped at ~3000 lines with "Show all". The JSON parse error's position gives the marked line. |
| Picture source chip | `<img>` from a blob URL | Its size comes from `createImageBitmap` or the image's `naturalWidth`. |

## DOM and classes

Prefix `ev-import-`, inside `gameDialog(this, systemId, { cls: 'ev-import' })`:

```
.modal.ev-dialog.ev-import            fixed size; [.is-narrow] from a ResizeObserver at 720px; [.is-detail-open]; [.is-dragging]
  .modal-title                        "Import" (or "Import from <format>" when opened for one)
  .ev-import-sources[role=list]       chips; scrolls sideways
    .ev-import-pair                   a data file + its picture: two .ev-import-source and .ev-import-pair-link
    .ev-import-source                 .ev-import-source-thumb (img|svg) .ev-import-source-text(.ev-import-source-name, .ev-import-source-meta[.is-bad]) button.ev-import-source-remove
    button.ev-import-add              pill(): plus, "Add"
  .ev-import-read                     .ev-import-read-icon .ev-import-read-name .ev-import-read-sub(span…) .ev-import-read-tools(.ev-import-as select, .ev-import-switch, button.ev-import-look-toggle) [.ev-import-look]
  .ev-import-body
    .ev-import-start                  .ev-import-drop[role=button][tabindex=0] (.ev-import-drop-icon, -title, -sub, button.ev-import-choose) .ev-import-pastebox(label.ev-import-label, textarea.ev-import-paste) .ev-import-formats
    .ev-import-status                 .ev-import-card[role=status|alert] (.ev-import-card-icon[.is-bad], -title, -url, -text, -actions) [+ .ev-import-code]
    .ev-import-review
      .ev-import-rail                 .ev-import-tools(label.ev-import-all, input.ev-import-filter) .ev-import-list
        .ev-import-group[.is-closed]  button.ev-import-group-head[aria-expanded](.ev-import-group-title, -count, -caret) .ev-import-row…
        .ev-import-row[.is-selected][.is-off]  checkbox | .ev-import-row-state, .ev-import-row-icon, .ev-import-row-text(-name, -meta), .ev-import-row-end(.ev-import-tag, warning, .ev-import-row-go)
      .ev-import-detail               .ev-import-detail-head(button.ev-import-back, .ev-import-detail-title(-name, -meta + .ev-import-tag), label.ev-import-detail-tick, .ev-import-step)
                                      .ev-import-tabs > .ev-import-seg[role=tablist] > button…
                                      .ev-import-pane[role=tabpanel] (.ev-import-note[.is-look|.is-bad]…, .ev-import-paper | .ev-import-diff | .ev-import-code-bar + .ev-import-code)
    .ev-import-custom > .ev-import-custom-col   CustomReview.render(el, changed)
    .ev-import-done                   .ev-import-card-icon .ev-import-card-title .ev-import-written(.ev-import-written-row…)
  .ev-import-drag                     the drop overlay (aria-hidden)
  .ev-dialog-foot                     dialogFoot(): Cancel | Import N (or Import more | Done)
```

Pills: `.ev-import-tag`, `.ev-import-add`, `.ev-import-choose`, `.ev-import-btn`, `.ev-import-open`, `.ev-import-look-toggle` and `.ev-import-seg > button` are built with `pill()`. They go in the shared centring rule in styles.css and in `PILL_SELECTORS` in `e2e/align.mjs`, and the `pills:` test gets an Import surface. `.ev-import-tag` and `.ev-import-fetch` are there already. Map pin labels inside the preview already belong to the map's own rule.

Icons (Phosphor Bold). These need adding to `icons-data.ts`: `tray-arrow-down` (drop), `folder-simple` (choose), `clipboard-text` (pasted), `globe-simple` (link), `file-code` / `file-text` / `file-zip` (file kinds), `prohibit` (left out), `lock-simple` (yours), `code` (Source), `question` (not recognised), `circle-notch` (spinner), `arrow-square-out` (open/fetch), `caret-up`, `swap` (Changes). These are already there: `check`, `check-circle`, `warning`, `x`, `plus`, `minus`, `arrow-up`, `arrow-left`, `link`, `image`, `eye`, `scales`, `books`, `package`, `skull`, `user`, `map-pin`, `gem`, `spell`, `copy`, `magnifying-glass`.

Small changes outside the dialog that the design needs:
- `CustomReview` gains an optional `head?: { icon; title; summary }`, so the frame draws the read band. The D&D Beyond and pack reviews stop drawing their own `nimble-pack-head`.
- `PlanItem.before?` for Changes.
- A record "fact" for the row's second line. Either a small `recordFact(record)` in core (monster: level and role; NPC: role; location: region; map: pins and grid; content: rarity or tier, when the kind has it), or an optional `GameContent.fact?(kind, value)`.
- Each pasted, chosen or fetched input is kept as a source with an id, so the chips can remove one and re-read.

## Keyboard and screen readers

- Focus starts on the drop zone (Start) or on the first row (Review). The drop zone is `role=button`. Enter and Space open the picker.
- The list is a roving-tabindex list. ↑/↓ move between rows and select (the preview follows), Space ticks the row's checkbox, and Enter or → opens the preview on narrow widths (← or Esc goes back). The checkbox's label is "Import Mire Hag".
- Group headers are buttons with `aria-expanded`. The tabs are `role=tablist`/`tab`/`tabpanel`, with ←/→ between tabs.
- ⌘/Ctrl+Enter is Import, and Esc closes (Obsidian's). On narrow widths Esc in the preview goes back to the list first.
- A live region (`role=status`) says the result of a read ("Read as Ember Vault bundle: 10 records, 7 to import") and of Fetch. Errors use `role=alert`.
- The status of a row is in text, not only colour: the group's name, the glyph's `title`/`aria-label`, and the tag in the detail head.
- The source view is a focusable region, so it scrolls with the keyboard. The pushed preview is `visibility: hidden` when closed. Reduced motion turns off the push and slows the spinner.

## Open questions

1. **Files of different formats dropped together.** Today one importer reads the whole input. Dropping a Watabou `crypt.json` + `crypt.png` and a Nexus `mire-hag.json` together would read as one or the other. Should the dialog group files (pairs by base name, then each data file alone), read each group with its own importer and merge the plans into one list? That fits the sources strip well (each chip says what it was read as), but it changes the engine. *Leaning: yes. Otherwise say "Read 2 of 3 files: mire-hag.json is a different format, import it on its own."*
2. **Should D&D Beyond and content packs move onto the checklist?** Both are lists of entries already (the DDB compendium checklist is the same row). As bundle records with a "character note" record, they'd get previews and Source for free. *Leaning: the D&D Beyond character yes, later. A pack stays a report, because it's saved whole rather than written as notes.*
3. **Done screen or close-and-notice?** The mock keeps the dialog open on Done with links to everything written. The alternative is today's: close, open the note if there's one, show a Notice. *Leaning: Done screen. Several notes written in different folders are hard to find otherwise.*
4. **"Already yours": offer "Import as a copy"?** Today it's left alone with no way round it. *Leaning: no in v1.*

## Files

- `index.html`: the clickable mock (self-contained; fonts from Google Fonts, icons inlined from Phosphor 2.1.1 Bold, MIT).
- `shots.mjs`: screenshots of every state into `shots/`, with a check for script errors and spill.
- `shots/`: 46 screenshots. The main ones are `review-desktop.png`, `review-map-desktop.png`, `review-phone-390-list.png` / `-detail.png`, `empty-desktop.png`, `invalid-desktop.png`, `pasted-desktop.png`, `done-desktop.png`.
