import { describe, expect, it } from 'vitest';
import { linkBasename, linkNames, rewriteLinks, RewriteOptions } from '../src/core/link-rename';

const OURS = new Set(['nimble-map', 'nimble-encounter', 'box', 'nimble-npc', 'nimble-note', '5e']);

/** Renames as the vault reports them: old path → the link path to write now. */
function opts(renames: Record<string, string>): RewriteOptions {
	return {
		fence: (lang) => OURS.has(lang),
		target: (lp) => {
			const hit = Object.entries(renames).find(([old]) => linkNames(lp, old));
			return hit ? hit[1] : undefined;
		},
	};
}
const lowerGate = opts({ 'Campaigns/X/Locations/Lower Gate.md': 'The Lower Gate' });

describe('which links name a note', () => {
	it('takes the note\'s name, its path from any folder down, and the .md', () => {
		const p = 'Campaigns/X/Locations/Lower Gate.md';
		for (const lp of ['Lower Gate', 'lower gate', 'Locations/Lower Gate', 'X/Locations/Lower Gate', 'Campaigns/X/Locations/Lower Gate', 'Lower Gate.md', '/Campaigns/X/Locations/Lower Gate']) {
			expect(linkNames(lp, p), lp).toBe(true);
		}
	});

	it('only whole names', () => {
		const p = 'Campaigns/X/Locations/Lower Gate.md';
		for (const lp of ['Gate', 'r Gate', 'Lower', 'Other/Lower Gate', 'ations/Lower Gate', '']) expect(linkNames(lp, p), lp).toBe(false);
	});

	it('an attachment needs its extension', () => {
		expect(linkNames('gate.png', 'Campaigns/X/Assets/gate.png')).toBe(true);
		expect(linkNames('gate', 'Campaigns/X/Assets/gate.png')).toBe(false);
	});

	it('names a note by its basename', () => {
		expect(linkBasename('Campaigns/X/Locations/Lower Gate.md')).toBe('Lower Gate');
		expect(linkBasename('Lower Gate')).toBe('Lower Gate');
	});
});

describe('rewriting the links Obsidian leaves', () => {
	it('a map pin, in every form a link is written', () => {
		const text = [
			'```nimble-map',
			'image: [[gate.png]]',
			'pins:',
			'- 50, 50 | The gate | [[Lower Gate]] | place',
			'- 20, 30 | Guardhouse | [[Lower Gate#Guardhouse]] | area',
			'- 40, 10 | Gate | [[Lower Gate|the gate]] | place',
			'- 10, 10 | By path | [[Locations/Lower Gate]] | place',
			'- 15, 15 | Both | [[Locations/Lower Gate#Cells|cells]] | danger',
			'```',
		].join('\n');
		expect(rewriteLinks(text, lowerGate)).toBe([
			'```nimble-map',
			'image: [[gate.png]]',
			'pins:',
			'- 50, 50 | The gate | [[The Lower Gate]] | place',
			'- 20, 30 | Guardhouse | [[The Lower Gate#Guardhouse]] | area',
			'- 40, 10 | Gate | [[The Lower Gate|the gate]] | place',
			'- 10, 10 | By path | [[The Lower Gate]] | place',
			'- 15, 15 | Both | [[The Lower Gate#Cells|cells]] | danger',
			'```',
		].join('\n'));
	});

	it('shown text that repeated a path\'s note name follows it', () => {
		const text = '```box\n[[Locations/Lower Gate|Lower Gate]] and [[Lower Gate|Lower Gate]]\n```';
		expect(rewriteLinks(text, opts({ 'Locations/Lower Gate.md': 'Locations/The Lower Gate' })))
			.toBe('```box\n[[Locations/The Lower Gate|The Lower Gate]] and [[Locations/The Lower Gate|Lower Gate]]\n```');
	});

	it('only whole-name matches: other links in the same block stay', () => {
		const text = '```nimble-encounter\nname: At the gate\nwhere: [[Lower Gate]]\nmonsters:\n- [[Gate Warden]]\n- [[Lower Gate Guard]]\n- 2 Goblin\n```';
		expect(rewriteLinks(text, lowerGate)).toBe('```nimble-encounter\nname: At the gate\nwhere: [[The Lower Gate]]\nmonsters:\n- [[Gate Warden]]\n- [[Lower Gate Guard]]\n- 2 Goblin\n```');
	});

	it('leaves Obsidian\'s own links in the text, and other people\'s code blocks', () => {
		const text = 'We met at [[Lower Gate]].\n\n```js\nconst s = "[[Lower Gate]]";\n```\n\n```box\nAt [[Lower Gate]].\n```\n\nAgain: [[Lower Gate]]';
		expect(rewriteLinks(text, lowerGate)).toBe('We met at [[Lower Gate]].\n\n```js\nconst s = "[[Lower Gate]]";\n```\n\n```box\nAt [[The Lower Gate]].\n```\n\nAgain: [[Lower Gate]]');
	});

	it('a block in a callout or under a list item, and longer or tilde fences', () => {
		const text = '> [!note]\n> ```nimble-npc\n> knows: [[Lower Gate]]\n> ```\n\n- item\n  ````box\n  ```\n  [[Lower Gate]]\n  ````\n\n~~~nimble-note\n[[Lower Gate]]\n~~~';
		expect(rewriteLinks(text, lowerGate)).toBe('> [!note]\n> ```nimble-npc\n> knows: [[The Lower Gate]]\n> ```\n\n- item\n  ````box\n  ```\n  [[The Lower Gate]]\n  ````\n\n~~~nimble-note\n[[The Lower Gate]]\n~~~');
	});

	it('a block that\'s never closed runs to the end of the note', () => {
		expect(rewriteLinks('```nimble-map\npins:\n- 1, 1 | A | [[Lower Gate]] | place', lowerGate)).toBe('```nimble-map\npins:\n- 1, 1 | A | [[The Lower Gate]] | place');
		expect(rewriteLinks('```js\n[[Lower Gate]]', lowerGate)).toBe('```js\n[[Lower Gate]]');
	});

	it('properties: a link among other words, in a list or alone', () => {
		const text = [
			'---',
			'nimble: session',
			'quests:',
			'  - "[[The Missing Lantern]] advanced"',
			'  - \'[[The Missing Lantern]] done\'',
			'  - "[[Other Quest]] advanced"',
			'loot: 40 gp from [[The Missing Lantern]]',
			'giver: "[[The Missing Lantern]]"',
			'tags: [a, "[[The Missing Lantern]] x"]',
			'---',
			'Body: [[The Missing Lantern]]',
		].join('\n');
		expect(rewriteLinks(text, opts({ 'Quests/The Missing Lantern.md': 'The Stolen Lantern' }))).toBe([
			'---',
			'nimble: session',
			'quests:',
			'  - "[[The Stolen Lantern]] advanced"',
			'  - \'[[The Stolen Lantern]] done\'',
			'  - "[[Other Quest]] advanced"',
			'loot: 40 gp from [[The Stolen Lantern]]',
			'giver: "[[The Stolen Lantern]]"',
			'tags: [a, "[[The Stolen Lantern]] x"]',
			'---',
			'Body: [[The Missing Lantern]]',
		].join('\n'));
	});

	it('an apostrophe in a single-quoted property is written twice, read once', () => {
		const text = '---\nquests:\n  - \'[[Bram\'\'s Rest]] found\'\n  - "[[Bram\'s Rest]] left"\nrecap: Bram\'s men met at [[Bram\'s Rest]]\n---\n';
		const o = opts({ "Bram's Rest.md": "Bram's Old Rest" });
		expect(rewriteLinks(text, o)).toBe('---\nquests:\n  - \'[[Bram\'\'s Old Rest]] found\'\n  - "[[Bram\'s Old Rest]] left"\nrecap: Bram\'s men met at [[Bram\'s Old Rest]]\n---\n');
	});

	it('keeps line endings, embeds, escaped pipes and same-note headings as they were', () => {
		const text = '---\r\nwhere: at [[Lower Gate]]\r\n---\r\n```box\r\n![[Lower Gate]] | [[Lower Gate\\|gate]] | [[#Lower Gate]]\r\n```\r\n';
		expect(rewriteLinks(text, lowerGate)).toBe('---\r\nwhere: at [[The Lower Gate]]\r\n---\r\n```box\r\n![[The Lower Gate]] | [[The Lower Gate\\|gate]] | [[#Lower Gate]]\r\n```\r\n');
	});

	it('returns the very same text when nothing names a renamed note', () => {
		const text = '---\nquests:\n  - "[[Other]] advanced"\n---\n```nimble-map\npins:\n- 1, 1 | A | [[Elsewhere]] | place\n```\n';
		expect(rewriteLinks(text, lowerGate)).toBe(text);
		expect(rewriteLinks('no links at all', lowerGate)).toBe('no links at all');
	});

	it('several renames at once (a folder renamed)', () => {
		const o = opts({ 'Old/A.md': 'New/A', 'Old/B.md': 'New/B' });
		const text = '```nimble-map\npins:\n- 1, 1 | A | [[Old/A]] | place\n- 2, 2 | B | [[Old/B#x|b]] | place\n- 3, 3 | C | [[Old/C]] | place\n```';
		expect(rewriteLinks(text, o)).toBe('```nimble-map\npins:\n- 1, 1 | A | [[New/A]] | place\n- 2, 2 | B | [[New/B#x|b]] | place\n- 3, 3 | C | [[Old/C]] | place\n```');
	});

	it('asks about each link once, with its path as written', () => {
		const asked: string[] = [];
		rewriteLinks('---\nq: "[[ Lower Gate ]] x"\n---\n```box\n[[Locations/Lower Gate#h|x]]\n```', {
			fence: (l) => l === 'box',
			target: (lp) => { asked.push(lp); return undefined; },
		});
		expect(asked).toEqual(['Lower Gate', 'Locations/Lower Gate']);
	});
});
