# The GM screen: a design study (parked)

[`../gm-screen-study.html`](../gm-screen-study.html) explores a GM screen for Ember Vault: one page where the GM pins what they reach for at the table (rules, tables, monsters, NPCs, notes) beside widgets (the fight, the party, dice, clocks, a random table, a scratchpad). It's a base-plugin feature: the same in every game, each game adding its look and its own cards.

**Status:** an exploration, saved to come back to. Nothing in the plugin uses it yet.

```bash
node prototypes/gm-screen-study/build.mjs   # src/ + the design study's library → ../gm-screen-study.html
node prototypes/gm-screen-study/check.mjs   # every page in headless Chrome; screenshots to /tmp/gm-screen-study
```

It's built on the design study's library (`../design-study/src/`: tokens, icons, Obsidian chrome, each game's parts), so its rules apply here too ([README](../design-study/README.md)).

## Where it stands

- **Recommended:** screens of columns. Tabs of screens (Combat, Exploring, Town), each a few columns of cards the GM arranges; columns merge in order as the width shrinks. Opens as a page in a tab, as a drawer over the current note, or in its own window.
- **Saved as a note:** `GM Screen.md` in each campaign, with a ```` ```gm-screen ```` block listing screens, columns and pins (the references the plugin already reads). Not built; the name isn't settled.
- **The Campaign panel's top** goes with it: the switcher on its own row, then Omnisearch, then a GM screen button; the home button goes (its note opens from the switcher's menu).

## Open questions (the study's last page)

1. Layout: screens of columns (recommended), the tri-fold, or the board.
2. Where it opens by default: a page, with the drawer on Shift-click (recommended), or the drawer.
3. A player's screen ("My screen") in campaigns you play in, or GM only for now.
4. Its button: the Campaign panel's third row (recommended), and/or the ribbon.
5. The home button: remove it (recommended) or keep it.
6. One screen note per campaign (recommended), or also one for the whole vault.
