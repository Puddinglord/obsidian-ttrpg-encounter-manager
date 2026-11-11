import { describe, expect, it } from 'vitest';
import { appendRichText, blockPrefix, DICE_RE, execWithLead, insideCodeFence, keywordPattern, placeBlock, slashQuery } from '../src/markdown';

function html(text: string, dice = false): string {
	const el = document.createElement('div');
	appendRichText(el, text, dice ? { onDice: () => {} } : {});
	return el.innerHTML;
}

describe('appendRichText', () => {
	it('never turns text into markup', () => {
		const el = document.createElement('div');
		appendRichText(el, '<img src=x onerror="alert(1)"> <b>hi</b>');
		expect(el.querySelector('img')).toBeNull();
		expect(el.querySelector('b')).toBeNull();
		expect(el.textContent).toBe('<img src=x onerror="alert(1)"> <b>hi</b>');
	});

	it('renders emphasis', () => {
		expect(html('a **b** *c* ***d***')).toBe('a <strong>b</strong> <em>c</em> <strong><em>d</em></strong>');
		expect(html('__b__ _c_')).toBe('<strong>b</strong> <em>c</em>');
	});

	it('leaves snake_case words alone', () => {
		expect(html('use snake_case_name here')).toBe('use snake_case_name here');
	});

	it('keeps underscores inside wikilinks', () => {
		const el = document.createElement('div');
		appendRichText(el, 'See [[snake_case_note]] and [[Goblin|the goblin]]');
		const links = el.querySelectorAll('a.nimble-wikilink');
		expect(links.length).toBe(2);
		expect(links[0].getAttribute('data-link')).toBe('snake_case_note');
		expect(links[0].textContent).toBe('snake_case_note');
		expect(links[1].getAttribute('data-link')).toBe('Goblin');
		expect(links[1].textContent).toBe('the goblin');
	});

	it('escapes markup inside link text', () => {
		const el = document.createElement('div');
		appendRichText(el, '[[x|<script>1</script>]]');
		expect(el.querySelector('script')).toBeNull();
	});

	it('marks dice only when asked', () => {
		expect(html('Bite 2d6+3 piercing')).toBe('Bite 2d6+3 piercing');
		const el = document.createElement('div');
		const seen: string[] = [];
		appendRichText(el, 'Bite 2d6 + 3 piercing, then d4, **1d8 fire**, not 2d6x or v1d6', { onDice: (_e, x) => seen.push(x) });
		expect(seen).toEqual(['2d6+3', 'd4', '1d8']);
		expect(el.querySelector('strong .nimble-dice')?.textContent).toBe('1d8');
	});

	it('does not swallow a second dice term as a modifier', () => {
		const seen: string[] = [];
		appendRichText(document.createElement('div'), '1d6+12d4', { onDice: (_e, x) => seen.push(x) });
		expect(seen[0]).toBe('1d6');
	});

	// These patterns capture the preceding character instead of using a
	// lookbehind (iOS < 16.4); the match must still start after it.
	it('matches underscore emphasis only at word boundaries', () => {
		expect(html('_a_ x__b__ (__c__) y_d_ -___e___')).toBe('<em>a</em> x__b__ (<strong>c</strong>) y_d_ -<strong><em>e</em></strong>');
		expect(html('**x**_y_')).toBe('<strong>x</strong><em>y</em>');
	});

	it('skips dice glued to a word or a decimal point', () => {
		const seen: string[] = [];
		appendRichText(document.createElement('div'), '2d6 x1d4 1.5d8 (d10) -3d6', { onDice: (_e, x) => seen.push(x) });
		expect(seen).toEqual(['2d6', 'd10', '3d6']);
	});

	it('marks whole-word keywords', () => {
		const words: string[] = [];
		const el = document.createElement('div');
		appendRichText(el, 'Prone, unProne, Prone-ish, (Prone) Dazed', {
			keywords: keywordPattern(['Prone', 'Dazed']), onKeyword: (_e, w) => words.push(w),
		});
		expect(words).toEqual(['Prone', 'Prone', 'Dazed']);
		expect(el.innerHTML).toContain('(<span class="nimble-keyword">Prone</span>)');
	});

	it('execWithLead drops the leading context', () => {
		const m = execWithLead(DICE_RE, 'Hit: 2d6+1 slashing')!;
		expect(m[0]).toBe('2d6+1');
		expect(m.index).toBe(5);
		expect([m[1], m[2], m[3]]).toEqual(['2', '6', '+1']);
		expect(execWithLead(DICE_RE, 'd8')!.index).toBe(0);
	});
});

describe('insideCodeFence', () => {
	const inside = (note: string, line: number) => { const lines = note.split('\n'); return insideCodeFence(i => lines[i], line); };

	it('is right far down a long note, whatever the line 400 above is', () => {
		// A 500-line code block, then prose: the old scan started inside the block and flipped.
		const note = ['intro', '```js', ...Array.from({ length: 500 }, (_, i) => `line ${i}`), '```', ...Array.from({ length: 300 }, () => 'prose')];
		const at = (line: number) => insideCodeFence(i => note[i], line);
		expect(at(1)).toBe(false);
		expect(at(2)).toBe(true);
		expect(at(450)).toBe(true);
		expect(at(502)).toBe(true); // the closing fence line itself
		expect(at(503)).toBe(false);
		expect(at(802)).toBe(false);
	});

	it('lets four backticks wrap three', () => {
		const note = '````markdown\n```nimble\nname: Goblin\n```\nstill inside\n````\noutside';
		expect(inside(note, 2)).toBe(true);
		expect(inside(note, 4)).toBe(true);
		expect(inside(note, 6)).toBe(false);
	});

	it('handles tilde fences and does not mix the two kinds', () => {
		const note = '~~~\n```\ninside\n~~~\noutside\n```js```\nstill outside';
		expect(inside(note, 2)).toBe(true);
		expect(inside(note, 4)).toBe(false);
		expect(inside(note, 6)).toBe(false); // ```js``` is inline code, not a fence
	});

	it('treats an unclosed fence as running to the end', () => {
		const note = 'text\n  ```nimble\nname: Goblin\n\nmore';
		expect(inside(note, 1)).toBe(false);
		expect(inside(note, 4)).toBe(true);
	});
});

describe('blocks inserted by slash commands', () => {
	const BOX = '```box\nText\n```';

	it('finds the prefix of a callout, a list item and an indented line', () => {
		expect(blockPrefix('')).toEqual({ prefix: '', fresh: true });
		expect(blockPrefix('> ')).toEqual({ prefix: '> ', fresh: true });
		expect(blockPrefix('> > ')).toEqual({ prefix: '> > ', fresh: true });
		expect(blockPrefix('- ')).toEqual({ prefix: '  ', fresh: true });
		expect(blockPrefix('  12. ')).toEqual({ prefix: '      ', fresh: true });
		expect(blockPrefix('\t')).toEqual({ prefix: '\t', fresh: true });
		expect(blockPrefix('> - some text ')).toEqual({ prefix: '>   ', fresh: false });
		expect(blockPrefix('Some text ')).toEqual({ prefix: '', fresh: false });
	});

	it('leaves a plain line as it was', () => {
		expect(placeBlock('', BOX)).toBe('```box\nText\n```\n');
		expect(placeBlock('Some text ', BOX)).toBe('\n```box\nText\n```\n');
	});

	it('keeps a block inside its callout', () => {
		expect(`> ${placeBlock('> ', BOX)}`).toBe('> ```box\n> Text\n> ```\n> ');
		expect(`> Intro ${placeBlock('> Intro ', BOX)}`).toBe('> Intro \n> ```box\n> Text\n> ```\n> ');
	});

	it('keeps a block inside its list item', () => {
		expect(`- ${placeBlock('- ', BOX)}`).toBe('- ```box\n  Text\n  ```\n  ');
		expect(`  - Step ${placeBlock('  - Step ', BOX)}`).toBe('  - Step \n    ```box\n    Text\n    ```\n    ');
	});
});

describe('slashQuery', () => {
	const NAMES = ['map', 'monster', 'roll', 'bestiary'];
	const known = (cmd: string, hasArg: boolean) => hasArg ? NAMES.includes(cmd) : NAMES.some(n => n.startsWith(cmd));
	const q = (before: string) => slashQuery(before, known);

	it('finds a command at the start of a line or after a space', () => {
		expect(q('/')).toBe('');
		expect(q('/ma')).toBe('ma');
		expect(q('Then /monster gob')).toBe('monster gob');
		expect(q('/zzz')).toBeNull();
		expect(q('/zzz goblin')).toBeNull();
	});

	it('allows "/" in the argument', () => {
		expect(q('/map Assets/hideout')).toBe('map Assets/hideout');
		expect(q('/map Assets/Maps/hide out')).toBe('map Assets/Maps/hide out');
		expect(q('/map foo /zzz')).toBe('map foo /zzz');
	});

	it('takes the last command on the line', () => {
		expect(q('/map foo /roll 2d6')).toBe('roll 2d6');
	});

	it('is not started by paths, URLs or and/or in prose', () => {
		expect(q('see http://example.com')).toBeNull();
		expect(q('see http://example.com/map now')).toBeNull();
		expect(q('Assets/map')).toBeNull();
		expect(q('fire and/or cold')).toBeNull();
		expect(q('either / or')).toBeNull();
		expect(q('/map2')).toBeNull();
	});
});
