## What changed

<!-- A sentence or two, then screenshots if it's visible. -->

## Shipping checklist

<!-- The "Docs check" workflow fails on the first three for a new feature. Label the PR "docs: skip" or "site: skip" when one really isn't needed. -->

- [ ] `CHANGELOG.md`: bullets under `## [Unreleased]` (Added / Changed / Fixed), plus a one-line headline for a release worth announcing
- [ ] User guide (`docs/`): explained with an example; new pages listed in `docs/README.md`
- [ ] Landing page: a tile in the features bento (`#features` in `site/index.html`) linking its guide page, tagged New
- [ ] Screenshots retaken if the guide or tile shows it (`node e2e/screenshots.mjs <name>`)
- [ ] Release label if it isn't a patch: `release: minor`, `release: major` or `release: skip`
