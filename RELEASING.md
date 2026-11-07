# Releasing Ember Vault

## First release and Obsidian submission (one time)

### 1. Turn on the landing page

The page lives in `site/` (static files) and `demo/` (the live demo). `.github/workflows/pages.yml` builds and publishes it whenever the page, the demo or the plugin code it reuses changes on `main`.

1. On GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
   (Or: `gh api -X POST repos/Puddinglord/obsidian-ttrpg-encounter-manager/pages -f build_type=workflow`)
2. Run the **Deploy landing page** workflow once from the **Actions** tab (or push a change to `site/`).
3. The page is at <https://puddinglord.github.io/obsidian-ttrpg-encounter-manager/>.
4. Put that URL in the repo's **About → Website** field, and add a description and topics (`obsidian-plugin`, `nimble`, `ttrpg`):

   ```sh
   gh repo edit Puddinglord/obsidian-ttrpg-encounter-manager \
     --homepage https://puddinglord.github.io/obsidian-ttrpg-encounter-manager/ \
     --description "Ember Vault: run Nimble TTRPG games from your Obsidian notes" \
     --add-topic obsidian-plugin --add-topic obsidian-md --add-topic nimble --add-topic ttrpg
   ```

To preview locally: `npm run site:serve`, then open <http://localhost:8765>. The build (`scripts/build-site.mjs`) copies `site/`, the screenshots and `styles.css` into `_site/`, and bundles the live demo from `demo/`. The demo runs the plugin's own code (stat blocks, hover previews, dice, 3D dice, encounter maths) against a small Obsidian stand-in in `demo/obsidian-shim.ts`, using the sample vault's monsters.

### 2. Publish the 1.0.0 release

Obsidian installs from the GitHub release whose tag exactly matches `manifest.json`'s `version` (no `v` prefix).

1. Make sure `main` has everything and CI is green.
2. `./tag.sh 1.0.0` tags `main` and pushes it. `.github/workflows/release.yml` then lints, tests, builds, and creates the release with `main.js`, `manifest.json`, `styles.css` and `Ember-Vault-Sample-Adventure.zip`.
3. Check the release page has all four files. Delete the old `0.0.x-alpha` releases if you don't want them showing up.

### 3. Submit to the Obsidian community directory

Obsidian no longer takes submissions as a pull request to `obsidianmd/obsidian-releases`. It uses a web directory with automated review ([docs](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)).

1. Go to <https://community.obsidian.md> and sign in with your Obsidian account.
2. Link your GitHub account to your profile. This proves you own the repo.
3. Choose **Add your plugin** and pick `Puddinglord/obsidian-ttrpg-encounter-manager`.
   The directory reads `manifest.json` from the head of `main`, so it must be merged first.
4. Automated review runs. If it lists anything to fix, fix it, bump the version (step "Later releases" below) and release again. The plugin can't be installed until those errors are cleared.
5. Edit the listing description if you want, then **Publish**.

Once it's listed, the landing page's **Install in Obsidian** button (`obsidian://show-plugin?id=nimble-gm`) opens the plugin in Obsidian.

### Pre-flight (already checked)

- [x] Repo is public, with `README.md`, `LICENSE` (MIT) and `manifest.json` in the root
- [x] `id` is `nimble-gm`: unique-looking and doesn't contain "obsidian"
- [x] `description` is 156 characters, ends with a period, and doesn't say "Obsidian"
- [x] `version` is `x.y.z`; `versions.json` maps `1.0.0` to `minAppVersion` `1.7.2`
- [x] `isDesktopOnly: false`, and there's no Node or Electron API use (the plugin runs on mobile)
- [x] README discloses network use (none, except NPC portrait URLs you set) and clipboard writes
- [x] Third-party content and permissions are listed in `NOTICE.md`
- [x] `npm run lint` (Obsidian's review rules) has no errors

## Later releases

```sh
npm version 1.0.1 --no-git-tag-version   # updates package.json, manifest.json, versions.json
git commit -am "Release 1.0.1"
./tag.sh 1.0.1
```

If you raise `minAppVersion`, change it in `manifest.json` before running `npm version` so `versions.json` records the new minimum.
