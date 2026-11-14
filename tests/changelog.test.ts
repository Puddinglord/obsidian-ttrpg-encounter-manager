import { describe, expect, it } from 'vitest';
import { dropEmptySubsections, hasEntries, releaseChangelog, sectionBody } from '../scripts/changelog.mjs';

const BASE = `# Changelog

All notable changes.

## [Unreleased]

### Added

- Character sheets.

### Fixed

## [1.0.6] - 2026-11-11

### Changed

- Lint in CI.
`;

describe('CHANGELOG.md releases', () => {
	it('moves Unreleased under the version and date, leaving an empty Unreleased on top', () => {
		const r = releaseChangelog(BASE, '1.1.0', '2026-11-14', 'PR title');
		expect(r.notes).toBe('### Added\n\n- Character sheets.');
		expect(r.text).toContain('## [Unreleased]\n\n## [1.1.0] - 2026-11-14\n\n### Added\n\n- Character sheets.\n\n## [1.0.6] - 2026-11-11');
		expect(sectionBody(r.text, 'Unreleased')).toBe('');
		expect(sectionBody(r.text, '1.0.6')).toBe('### Changed\n\n- Lint in CI.');
	});

	it('an empty Unreleased falls back to the PR title, so a release always says something', () => {
		const empty = BASE.replace('- Character sheets.\n', '');
		const r = releaseChangelog(empty, '1.0.7', '2026-11-14', 'Fix the tracker (#16)');
		expect(r.notes).toBe('### Changed\n\n- Fix the tracker (#16)');
		expect(sectionBody(r.text, '1.0.7')).toBe(r.notes);
	});

	it('refuses a version that is already there', () => {
		expect(() => releaseChangelog(BASE, '1.0.6', '2026-11-14')).toThrow(/already has a section/);
	});

	it('works on a changelog with no Unreleased section', () => {
		const r = releaseChangelog('# Changelog\n\n## [1.0.0] - 2026-11-06\n\n- First.\n', '1.0.1', '2026-11-07', 'Tidy up');
		expect(r.text).toMatch(/## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-11-07\n\n### Changed\n\n- Tidy up\n\n## \[1\.0\.0\]/);
	});

	it('helpers: empty subsections and entries', () => {
		expect(hasEntries('### Added\n\n### Fixed')).toBe(false);
		expect(hasEntries('### Added\n\n- One')).toBe(true);
		expect(dropEmptySubsections('### Added\n\n- One\n\n### Fixed\n')).toBe('### Added\n\n- One');
	});
});
