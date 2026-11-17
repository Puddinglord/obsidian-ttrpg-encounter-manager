# Agent plan: custom domain, repo rename, new description

**When:** after the multi-system rewrite ([MULTI-SYSTEM.md](MULTI-SYSTEM.md)), so the new description can say "Nimble and 5e". Until then, everything stays as it is.

**Fill in before starting:** `<domain>` (for example `embervault.app`) and `<new-repo>` (for example `ember-vault`).

## What changes and what doesn't

| Thing | Changes? | Notes |
|---|---|---|
| Plugin id `nimble-gm` | **Never** | Listed in the community directory. Users' installs, settings and update checks are keyed on it. |
| Display name "Ember Vault" | Already done | Nothing to do. |
| Description | Yes | `manifest.json`, `package.json`, and the directory entry in `obsidianmd/obsidian-releases` (still shows the old "Run Nimble TTRPG encounters…" text, so it doesn't sync on its own). |
| Landing page URL | Yes | `puddinglord.github.io/obsidian-ttrpg-encounter-manager/` → `https://<domain>/` |
| GitHub repo name | Yes | `Puddinglord/obsidian-ttrpg-encounter-manager` → `Puddinglord/<new-repo>` |
| Branches, tags, releases, issues, PRs, stars, Actions secrets | No | A rename only changes the URL. GitHub redirects the old repo URLs (web, git push/pull, API, release downloads) as long as nobody creates a new repo under the old name. |

## Order matters

Do the **domain first, the rename second.** With a custom domain set, the site's canonical URL no longer contains the repo name, so the rename can't move it. If the rename went first, `puddinglord.github.io/obsidian-ttrpg-encounter-manager/` would 404, because GitHub doesn't redirect Pages URLs on rename.

## Steps

Steps marked **[you]** happen outside the repo (DNS, GitHub settings, a PR to Obsidian's repo). The agent stops and hands these over. It doesn't do them.

### 1. Custom domain

1. **[you]** Buy `<domain>`. Verify it under GitHub → Settings (account) → Pages → Verified domains. Verification stops anyone else from claiming it for their Pages site.
2. **[you]** DNS:
   - Apex (`<domain>`): `A` records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (plus the `AAAA` records GitHub lists if you want IPv6).
   - `www`: `CNAME` to `puddinglord.github.io`.
3. **[you]** Repo → Settings → Pages → Custom domain: `<domain>`. Wait for the DNS check, then tick **Enforce HTTPS**.
   - Pages deploys through Actions (`.github/workflows/pages.yml`), so the domain is set in Settings. A `CNAME` file in `site/` is ignored for Actions deploys, so don't add one.
   - Once it's set, GitHub redirects `puddinglord.github.io/obsidian-ttrpg-encounter-manager/` to `https://<domain>/`.
4. **Agent:** replace every site URL with `https://<domain>/`:
   - `scripts/build-docs.mjs:14` (`SITE`, used for canonical links, og:image and the docs sitemap)
   - `site/index.html` lines 8, 11, 14, 21, 36, 39, 47 (canonical, og:url, og/twitter images, JSON-LD)
   - `site/sitemap.xml:3`
   - `README.md:7`
   - `docs/sample-adventure.md:20` (sample zip download link)
   - `RELEASING.md` lines 12 and 17 (page URL, `--homepage`)
   - Update the repo's homepage too: **[you]** `gh repo edit --homepage https://<domain>/`
5. **Agent:** verify with `git grep -n "github.io"`, which should return nothing except history and changelog entries. Then run `npm run build`, `npm test` and `npm run lint`.

### 2. New description

The same sentence goes in three places. Keep it under ~250 characters, with no "Obsidian" in the name and no emoji, per Obsidian's directory rules. Draft once the 5e work has shipped, for example:

> Run and play tabletop RPG campaigns from your notes (Nimble and 5e): bestiaries, encounter blocks rated for your party, a combat tracker, maps, 3D dice and interactive character sheets.

1. **Agent:** `manifest.json` `description`, `package.json` `description`.
2. **Agent:** `README.md` intro and the `site/index.html` meta description and og:description, if they still say Nimble-only.
3. **[you]** After that merges and releases: open a PR to `obsidianmd/obsidian-releases` editing only your entry in `community-plugins.json` (`"id": "nimble-gm"`). Change `description` to match the manifest. If the repo rename (step 3) is already done, change `repo` in the same PR. The agent can draft the PR text, and you review it before it's opened.

### 3. Repo rename

1. **[you]** Repo → Settings → General → Repository name → `<new-repo>`.
   - Never create a repo called `obsidian-ttrpg-encounter-manager` afterwards. It would break every redirect.
2. **[you]** Point every clone at the new URL. Old remotes keep working through the redirect, but don't rely on it:
   - `git remote set-url origin https://github.com/Puddinglord/<new-repo>.git`
   - Worktrees share their main clone's remote, so one change per clone is enough.
3. **Agent:** replace `github.com/Puddinglord/obsidian-ttrpg-encounter-manager` with `github.com/Puddinglord/<new-repo>`:
   - `scripts/build-docs.mjs:15` (`REPO`)
   - `site/index.html` lines 45, 46, 48, 307, 309, 314
   - `docs/faq.md:34`
   - `sample-vault/Start Here.md` lines 24 and 37 (then rebuild the sample zip so the download has the new links)
   - `RELEASING.md:10` (`gh api … repos/Puddinglord/…/pages`)
   - `README.md`: anything left over
4. **Agent:** optionally rename `package.json` `name` from `nimble-gm` to `<new-repo>`, then run `npm install` to refresh `package-lock.json`. It's private, and nothing outside the repo uses it.
5. **Agent:** check the workflows for hard-coded `Puddinglord/obsidian-ttrpg-encounter-manager` (`git grep` in `.github/`). Most use `${{ github.repository }}`, which follows the rename on its own.
6. **[you]** The `obsidian-releases` PR from step 2.3 updates `repo`, if it hasn't been opened yet.
7. **Agent:** verify:
   - `git grep -n -i "obsidian-ttrpg-encounter-manager"` returns only CHANGELOG/history.
   - Build, test and lint pass.
   - After the Pages workflow runs, `https://<domain>/` loads, `https://<domain>/docs/` loads, and the sample zip downloads.

## Leave alone

These are tied to the plugin id, which stays `nimble-gm`:
- `.obsidian/plugins/nimble-gm/` paths in `deploy.sh`, the e2e harness, `docs/getting-started.md` and `.gitignore`
- `manifest.json` `id`
- `obsidian://show-plugin?id=nimble-gm` (`site/index.html:293`, `RELEASING.md:43`)
- The `nimble*` code-block names and the `nimble:` reference prefix (the multi-system spec covers aliases)

## Old links in the wild

- **Old repo links** (github.com/…/obsidian-ttrpg-encounter-manager) keep redirecting.
- **Old site links** (puddinglord.github.io/obsidian-ttrpg-encounter-manager/) redirect to `<domain>` only while the repo has that name. After the rename they 404, including the links inside copies of the sample zip that people already downloaded. If that matters, add a tiny redirect page at `obsidian-ttrpg-encounter-manager/index.html` in a `Puddinglord.github.io` user-site repo. Once the project repo is renamed, that path falls through to the user site. This is untested, so check it before relying on it.

## Shipping

One commit per section (domain, description, rename) in the rewrite PR, or a small PR of its own right after. A patch release is enough, since users see no change apart from the new description.
