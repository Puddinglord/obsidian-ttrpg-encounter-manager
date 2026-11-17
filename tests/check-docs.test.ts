import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { checkLinks, headingIds, markdownLinks, prRules, slug, unreleased } from '../scripts/check-docs.mjs';
import { parseChangelog } from '../scripts/build-changelog.mjs';
import { releaseChangelog, siteLinks } from '../scripts/changelog.mjs';

const log = (unrel: string) => `# Changelog\n\n## [Unreleased]\n\n${unrel}\n\n## [1.0.0] - 2026-11-06\n\n### Added\n\n- First release.\n`;

describe('prRules', () => {
	const before = log('');
	const after = log('### Added\n\n- Quests.');

	it('holds a new feature with no guide or landing page change', () => {
		const r = prRules({ changed: ['src/quests.ts', 'CHANGELOG.md'], before, after });
		expect(r.errors).toHaveLength(2);
		expect(r.errors[0]).toMatch(/user guide/);
		expect(r.errors[1]).toMatch(/features bento/);
	});

	it('passes once docs and the landing page change', () => {
		const r = prRules({ changed: ['src/quests.ts', 'CHANGELOG.md', 'docs/quests.md', 'site/index.html'], before, after });
		expect(r.errors).toEqual([]);
	});

	it('lets labels skip either half', () => {
		expect(prRules({ changed: ['docs/quests.md'], before, after, labels: ['site: skip'] }).errors).toEqual([]);
		expect(prRules({ changed: ['site/index.html'], before, after, labels: ['docs: skip'] }).errors).toEqual([]);
	});

	it('only counts entries this PR added', () => {
		const r = prRules({ changed: ['src/x.ts'], before: after, after });
		expect(r.errors).toEqual([]);
	});

	it('warns when code changes with nothing under Unreleased', () => {
		const r = prRules({ changed: ['src/x.ts'], before, after: before });
		expect(r.errors).toEqual([]);
		expect(r.warnings[0]).toMatch(/PR title/);
		expect(prRules({ changed: ['src/x.ts'], before, after: before, labels: ['release: skip'] }).warnings).toEqual([]);
	});

	it('nudges a feature entry to link its guide page', () => {
		const r = prRules({ changed: ['docs/quests.md', 'site/index.html'], before, after });
		expect(r.warnings.some((w) => /guide page/.test(w))).toBe(true);
		const linked = log('### Added\n\n- Quests. See the [quests guide](docs/quests.md).');
		expect(prRules({ changed: ['docs/quests.md', 'site/index.html'], before, after: linked }).warnings).toEqual([]);
	});

	it('reads Unreleased by subsection', () => {
		expect(unreleased(log('Headline.\n\n### Added\n\n- A\n- B\n\n### Fixed\n\n- C'))).toEqual({ Added: ['A', 'B'], Fixed: ['C'] });
	});
});

describe('links', () => {
	it('makes GitHub heading ids', () => {
		expect(slug("When a line isn't shown")).toBe('when-a-line-isnt-shown');
		expect(slug('Homebrew `nimble-spell` blocks')).toBe('homebrew-nimble-spell-blocks');
		expect([...headingIds('# A\n## Same\n## Same\n```\n## Not a heading\n```')]).toEqual(['a', 'same', 'same-1']);
	});

	it('finds relative links outside code', () => {
		const md = 'See [quests](quests.md#linking-a-quest) and [site](https://x.y).\n```\n[no](nope.md)\n```\nAnd `[no](nope.md)`.';
		expect(markdownLinks(md).map((l) => l.href)).toEqual(['quests.md#linking-a-quest']);
	});

	it('finds nothing broken in the repo', () => {
		expect(checkLinks(join(__dirname, '..')).errors).toEqual([]);
	});
});

describe('the site changelog', () => {
	it('reads releases newest first, with headlines and kinds', () => {
		const text = `## [Unreleased]\n\n### Added\n\n- Soon.\n\n## [1.1.0] - 2026-11-14\n\nCharacter sheets.\n\n### Added\n\n- Sheets.\n  Wrapped line.\n\n### Fixed\n\n- A bug.\n\n## [1.0.0] - 2026-11-06\n\n### Added\n\n- First release as Ember Vault. More words.\n`;
		const [a, b] = parseChangelog(text);
		expect(parseChangelog(text)).toHaveLength(2);
		expect(a).toMatchObject({ version: '1.1.0', date: '2026-11-14', title: 'Character sheets', groups: [{ name: 'Added', items: ['Sheets. Wrapped line.'] }, { name: 'Fixed', items: ['A bug.'] }] });
		expect(b.title).toBe('First release as Ember Vault');
	});

	it('points guide links at the site in release notes', () => {
		expect(siteLinks('See the [builder guide](docs/builder.md#review). [Home](docs/README.md)'))
			.toBe('See the [builder guide](https://puddinglord.github.io/obsidian-ttrpg-encounter-manager/docs/builder.html#review). [Home](https://puddinglord.github.io/obsidian-ttrpg-encounter-manager/docs/)');
	});

	it('keeps a release headline when the release workflow moves Unreleased', () => {
		const { text, notes } = releaseChangelog('# Changelog\n\n## [Unreleased]\n\nQuests.\n\n### Added\n\n- Quest notes.\n\n### Fixed\n', '1.4.0', '2026-11-16');
		expect(notes).toBe('Quests.\n\n### Added\n\n- Quest notes.');
		expect(parseChangelog(text)[0].title).toBe('Quests');
	});
});
