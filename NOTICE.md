# Third-party content and credits

The plugin's source code is MIT-licensed (see [LICENSE](LICENSE)). These parts are not:

- **Nimble TTRPG text** (the bundled bestiary, rules and conditions in `src/data`) is © Nimble Co. It's included with permission under the Nimble 3rd Party Creator License. Ember Vault is an independent product and isn't affiliated with Nimble Co. Buy the books at [nimbleRPG.com](https://nimbleRPG.com).
- **three.js** (MIT, © three.js authors) and **cannon-es** (MIT, © Stefan Hedman and cannon-es contributors) power the 3D dice. **fflate** (MIT, © Arjun Barrett) unpacks imported dice sets.
- **Dice So Nice compatibility.** To roll 3D-model dice made for Dice So Nice, `src/dice3d/model-layout.ts` records which face carries which number on those models (the shared layout model dice are made against). No Dice So Nice code, textures or images are included. Dice sets you import are not part of the plugin: they stay on your device and belong to their creators, under their own licenses.
- **The sample vault** (`sample-vault/`, and the `Ember-Vault-Sample-Adventure.zip` download on the landing page) contains *The Quicksilver Vaults* by Dakotah Cote (layout by Daria Greenlee), with illustrations by Nagy Sz. Attila from *The Quicksilver Vaults* and *First Watch*, and a map made with Dungeon Scrawl. They're © their creators and included with permission. They are not covered by the MIT license, and the same art appears in `docs/images/` screenshots.
- **The landing page** (`site/`) uses the Fraunces and Figtree fonts (SIL Open Font License, in `site/fonts/`).
