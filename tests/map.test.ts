import { describe, expect, it } from 'vitest';
import { findMapFence, mapBlockSource, parseAmount, parseDrawingLine, parseMapBlock, parsePinLine, replaceMapBlock } from '../src/map-def';

describe('nimble-map blocks', () => {
	it('parses pins in any order of extras', () => {
		expect(parsePinLine('- 40, 78 | 1. Cave Mouth | [[Part 1#1. Cave Mouth]] | area')).toEqual({ x: 40, y: 78, label: '1. Cave Mouth', link: 'Part 1#1. Cave Mouth', kind: 'area' });
		expect(parsePinLine('- 12.5%, 3% | Bridge | encounter | [[Bridge|the bridge]]')).toEqual({ x: 12.5, y: 3, label: 'Bridge', link: 'Bridge', kind: 'encounter' });
		expect(parsePinLine('- 150, -4 | Off the edge')).toEqual({ x: 100, y: 0, label: 'Off the edge', kind: 'place' });
		expect(parsePinLine('- nonsense')).toBeNull();
	});

	it('round-trips a block', () => {
		const src = 'image: [[Maps/Cragmaw Hideout.jpg]]\ngrid: 30x20\npins:\n- 40, 78 | Cave Mouth | [[Part 1#Cave Mouth]] | area\n- 10.3, 20.1 | Loose note';
		const def = parseMapBlock(src);
		expect(def.image).toBe('Maps/Cragmaw Hideout.jpg');
		expect(def.grid).toEqual({ kind: 'square', cols: 30, rows: 20 });
		expect(def.pins).toHaveLength(2);
		expect(mapBlockSource(def)).toBe(src);
	});

	it('accepts embeds and plain paths for the image', () => {
		expect(parseMapBlock('image: ![[map.png]]').image).toBe('map.png');
		expect(parseMapBlock('image: https://example.com/map.png').image).toBe('https://example.com/map.png');
	});
});

const V2 = [
	'image: [[Barlegento.jpg]]',
	'grid: hex',
	'cell: 2.15',
	'offset: 0.4, 0.9',
	'show-grid: no',
	'scale: 6 miles',
	'travel: 1 quarter',
	'party: 41.2, 37.9',
	'pins:',
	'- 52, 30 | Balbom | [[Balbom]] | place',
	'- 12, 70 | The Low Road | [[Low Road map]] | map',
	'drawings:',
	'- route | #ffffff | 3 | 61.2,38.1 62,40.3 63.4,44',
].join('\n');

describe('map block v2: every key', () => {
	it('reads every new key', () => {
		const def = parseMapBlock(V2);
		expect(def.image).toBe('Barlegento.jpg');
		expect(def.grid).toEqual({ kind: 'hex' });
		expect(def.cell).toEqual({ w: 2.15 });
		expect(def.offset).toEqual({ x: 0.4, y: 0.9 });
		expect(def.showGrid).toBe(false);
		expect(def.scale).toBe('6 miles');
		expect(def.travel).toBe('1 quarter');
		expect(def.party).toEqual({ x: 41.2, y: 37.9 });
		expect(def.pins.map(p => p.kind)).toEqual(['place', 'map']);
		expect(def.pins[1].link).toBe('Low Road map');
		expect(def.drawings).toEqual([{ kind: 'route', colour: '#ffffff', width: 3, points: [{ x: 61.2, y: 38.1 }, { x: 62, y: 40.3 }, { x: 63.4, y: 44 }] }]);
	});

	it('writes an unchanged block back exactly', () => {
		expect(mapBlockSource(parseMapBlock(V2))).toBe(V2);
	});

	it('writes each changed key in its own format, in place', () => {
		const def = parseMapBlock(V2);
		def.grid = { kind: 'hex-flat' };
		def.cell = { w: 1.666666, h: 2.5 };
		def.offset = { x: 0.12345, y: 3 };
		def.showGrid = true;
		def.scale = '1 km';
		def.travel = '4 hours';
		def.party = { x: 10.126, y: 20 };
		def.drawings.push({ kind: 'text', colour: 'accent', width: 2, points: [{ x: 5.04, y: 6 }], text: 'Here | there' });
		expect(mapBlockSource(def).split('\n')).toEqual([
			'image: [[Barlegento.jpg]]',
			'grid: hex-flat',
			'cell: 1.6667x2.5',
			'offset: 0.123, 3',
			'show-grid: yes',
			'scale: 1 km',
			'travel: 4 hours',
			'party: 10.13, 20',
			'pins:',
			'- 52, 30 | Balbom | [[Balbom]] | place',
			'- 12, 70 | The Low Road | [[Low Road map]] | map',
			'drawings:',
			'- route | #ffffff | 3 | 61.2,38.1 62,40.3 63.4,44',
			'- text | accent | 2 | 5,6 | Here / there',
		]);
	});

	it('every key survives write → read', () => {
		const def = parseMapBlock(V2);
		def.cell = { w: 1.6667, h: 2.5 };
		def.drawings.push({ kind: 'pen', colour: '#c0504d', width: 1, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] });
		def.drawings.push({ kind: 'text', colour: 'accent', width: 3, points: [{ x: 5, y: 6 }], text: 'Camp' });
		const again = parseMapBlock(mapBlockSource(def));
		expect(again).toEqual(def);
	});

	it('new keys go where a fresh block would put them, around the old lines', () => {
		const def = parseMapBlock('image: [[map.png]]\ngrid: 30x20\npins:\n- 10, 10 | Gate');
		def.party = { x: 50, y: 50 };
		def.scale = '5 ft';
		def.drawings.push({ kind: 'route', colour: 'accent', width: 2, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
		expect(mapBlockSource(def)).toBe('image: [[map.png]]\ngrid: 30x20\nscale: 5 ft\nparty: 50, 50\npins:\n- 10, 10 | Gate\ndrawings:\n- route | accent | 2 | 1,1 2,2');
	});

	it('a removed key or the last drawing goes away', () => {
		const def = parseMapBlock(V2);
		delete def.party;
		delete def.showGrid;
		def.drawings = [];
		const out = mapBlockSource(def);
		expect(out).not.toMatch(/party:|show-grid:|drawings:/);
		expect(out).toMatch(/^pins:$/m);
	});

	it('reads the grid kinds and their spellings', () => {
		const grid = (v: string) => parseMapBlock(`image: [[m.png]]\ngrid: ${v}`).grid;
		expect(grid('none')).toEqual({ kind: 'none' });
		expect(grid('square')).toEqual({ kind: 'square' });
		expect(grid('Hex')).toEqual({ kind: 'hex' });
		expect(grid('hex flat')).toEqual({ kind: 'hex-flat' });
		expect(grid('30 × 20')).toEqual({ kind: 'square', cols: 30, rows: 20 });
		expect(grid('wobbly')).toBeUndefined();
	});

	it('a URL image is written bare, not as a wiki link', () => {
		const def = parseMapBlock('image: https://example.com/map.png');
		def.pins.push({ x: 1, y: 1, label: 'A', kind: 'place' });
		expect(mapBlockSource(def)).toBe('image: https://example.com/map.png\npins:\n- 1, 1 | A');
	});

	it('reads amounts for scale and travel', () => {
		expect(parseAmount('6 miles')).toEqual({ n: 6, unit: 'miles' });
		expect(parseAmount('1.5km')).toEqual({ n: 1.5, unit: 'km' });
		expect(parseAmount('a day')).toBeNull();
		expect(parseAmount(undefined)).toBeNull();
	});

	it('reads drawings and skips nonsense', () => {
		expect(parseDrawingLine('- pen | #ABC | 9 | 1,2 3,4')).toEqual({ kind: 'pen', colour: '#abc', width: 3, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] });
		expect(parseDrawingLine('- text | red | 2 | 5,5 | Camp | here')).toEqual({ kind: 'text', colour: 'accent', width: 2, points: [{ x: 5, y: 5 }], text: 'Camp / here' });
		expect(parseDrawingLine('- cone | #fff | 2 | 1,1')).toBeNull();
		expect(parseDrawingLine('- route | #fff | 2 | nowhere')).toBeNull();
	});
});

describe('map block v2: nothing is lost on save', () => {
	it('an old block is saved unchanged, spacing and all', () => {
		const old = 'image: ![[Maps/Cave.png|600]]\ngrid: 30x20\npins:\n- 12.5%, 3% | Bridge | encounter | [[Bridge|the bridge]]\n- 40,78|Mouth';
		expect(mapBlockSource(parseMapBlock(old))).toBe(old);
	});

	it('an edited pin is rewritten, its neighbours are not', () => {
		const old = 'image: [[m.png]]\npins:\n- 12.5%, 3% | Bridge | encounter | [[Bridge|the bridge]]\n- 40,78|Mouth';
		const def = parseMapBlock(old);
		def.pins[1].x = 41;
		expect(mapBlockSource(def)).toBe('image: [[m.png]]\npins:\n- 12.5%, 3% | Bridge | encounter | [[Bridge|the bridge]]\n- 41, 78 | Mouth');
	});

	it('keeps unknown keys and sections in their places', () => {
		const src = [
			'image: [[m.png]]',
			'tint: sepia',
			'layers:',
			'- fog | 10,10 20,20',
			'  - nested: yes',
			'grid: square',
			'',
			'pins:',
			'- 10, 10 | Gate',
			'- not a pin',
			'weather: rain',
		].join('\n');
		const def = parseMapBlock(src);
		expect(def.grid).toEqual({ kind: 'square' });
		expect(def.pins).toHaveLength(1);
		def.pins.push({ x: 20, y: 20, label: 'Well', kind: 'place' });
		def.party = { x: 5, y: 5 };
		expect(mapBlockSource(def).split('\n')).toEqual([
			'image: [[m.png]]',
			'tint: sepia',
			'layers:',
			'- fog | 10,10 20,20',
			'  - nested: yes',
			'grid: square',
			'',
			'party: 5, 5',
			'pins:',
			'- 10, 10 | Gate',
			'- 20, 20 | Well',
			'- not a pin',
			'weather: rain',
		]);
	});

	it('an older copy of the plugin (that only knew image, grid and pins) keeps a newer block\'s drawings', () => {
		// Simulate an older parser by hiding the newer keys from it: they are unknown lines to it.
		const newer = V2.replace('drawings:', 'sketches:');
		const def = parseMapBlock(newer);
		def.pins[0].x = 53;
		const out = mapBlockSource(def);
		expect(out).toContain('sketches:\n- route | #ffffff | 3 | 61.2,38.1 62,40.3 63.4,44');
		expect(out).toContain('- 53, 30 | Balbom | [[Balbom]]');
	});

	it('the same key twice: the last one counts and both lines stay', () => {
		const def = parseMapBlock('image: [[a.png]]\nscale: 5 ft\nscale: 6 miles\npins:');
		expect(def.scale).toBe('6 miles');
		def.scale = '1 km';
		expect(mapBlockSource(def)).toBe('image: [[a.png]]\nscale: 5 ft\nscale: 1 km\npins:');
	});

	it('a second pins: list carries on the first', () => {
		const def = parseMapBlock('image: [[a.png]]\npins:\n- 1, 1 | A\nscale: 1 km\npins:\n- 2, 2 | B');
		expect(def.pins.map(p => p.label)).toEqual(['A', 'B']);
		const again = parseMapBlock(mapBlockSource(def));
		expect(again.pins.map(p => p.label)).toEqual(['A', 'B']);
	});

	it('a map pin kind round-trips', () => {
		const pin = parsePinLine('- 12, 70 | The Low Road | [[Low Road map]] | map');
		expect(pin).toEqual({ x: 12, y: 70, label: 'The Low Road', link: 'Low Road map', kind: 'map' });
		const def = parseMapBlock('image: [[a.png]]\npins:');
		def.pins.push({ ...pin! });
		expect(mapBlockSource(def)).toBe('image: [[a.png]]\npins:\n- 12, 70 | The Low Road | [[Low Road map]] | map');
	});

	it('a fresh block is written in the usual order', () => {
		const def = parseMapBlock('');
		def.image = 'm.png';
		def.grid = { kind: 'hex' };
		def.cell = { w: 3 };
		expect(mapBlockSource(def)).toBe('image: [[m.png]]\ngrid: hex\ncell: 3\npins:');
	});
});

describe('writing a map block back into the note', () => {
	const OLD = 'image: [[map.png]]\npins:\n- 10, 10 | Gate';
	const NEW = 'image: [[map.png]]\npins:\n- 10, 10 | Gate\n- 50, 50 | Well';

	it('replaces a plain block and nothing else', () => {
		const note = `# Title\n\n\`\`\`nimble-map\n${OLD}\n\`\`\`\n\nAfter`;
		expect(findMapFence(note.split('\n'), 2, 6, OLD)).toEqual({ open: 2, close: 6, prefix: '' });
		expect(replaceMapBlock(note, 2, 6, OLD, NEW)).toBe(`# Title\n\n\`\`\`nimble-map\n${NEW}\n\`\`\`\n\nAfter`);
	});

	it('keeps the callout around a map: its other lines survive and every written line is quoted', () => {
		const q = (s: string) => s.split('\n').map(l => `> ${l}`).join('\n');
		const note = `> [!note]- The hideout\n> Read this first.\n> \`\`\`nimble-map\n${q(OLD)}\n> \`\`\`\n> Read this last.\n\nAfter`;
		// Obsidian reports the whole callout (lines 0-7) as the section.
		expect(findMapFence(note.split('\n'), 0, 7, OLD)).toEqual({ open: 2, close: 6, prefix: '> ' });
		expect(replaceMapBlock(note, 0, 7, OLD, NEW)).toBe(`> [!note]- The hideout\n> Read this first.\n> \`\`\`nimble-map\n${q(NEW)}\n> \`\`\`\n> Read this last.\n\nAfter`);
	});

	it('keeps the indentation of a map under a list item', () => {
		const ind = (s: string) => s.split('\n').map(l => `  ${l}`).join('\n');
		const note = `- First\n- The map:\n  \`\`\`nimble-map\n${ind(OLD)}\n  \`\`\`\n- Last`;
		expect(replaceMapBlock(note, 0, 7, OLD, NEW)).toBe(`- First\n- The map:\n  \`\`\`nimble-map\n${ind(NEW)}\n  \`\`\`\n- Last`);
		// The fence on the item's own line continues at the item's text.
		const own = `- \`\`\`nimble-map\n${ind(OLD)}\n  \`\`\`\n- Last`;
		expect(replaceMapBlock(own, 0, 5, OLD, NEW)).toBe(`- \`\`\`nimble-map\n${ind(NEW)}\n  \`\`\`\n- Last`);
	});

	it('picks the right one of two maps in a callout', () => {
		const other = 'image: [[other.png]]\npins:';
		const q = (s: string) => s.split('\n').map(l => `> ${l}`).join('\n');
		const note = `> [!note]\n> \`\`\`nimble-map\n${q(other)}\n> \`\`\`\n> between\n> ~~~~nimble-map\n${q(OLD)}\n> ~~~~`;
		const lines = note.split('\n');
		expect(findMapFence(lines, 0, lines.length - 1, OLD)).toEqual({ open: 6, close: 10, prefix: '> ' });
		expect(findMapFence(lines, 0, lines.length - 1, other)).toEqual({ open: 1, close: 4, prefix: '> ' });
		const out = replaceMapBlock(note, 0, lines.length - 1, OLD, NEW)!;
		expect(out).toBe(`> [!note]\n> \`\`\`nimble-map\n${q(other)}\n> \`\`\`\n> between\n> ~~~~nimble-map\n${q(NEW)}\n> ~~~~`);
		// Neither body matches (the note changed under us): don't guess.
		expect(replaceMapBlock(note, 0, lines.length - 1, 'image: [[gone.png]]', NEW)).toBeNull();
	});

	it('changes nothing when the fence is not there', () => {
		const note = `> [!note]\n> Just text\n> more text\n\n\`\`\`nimble\nname: Goblin\n\`\`\``;
		expect(replaceMapBlock(note, 0, 2, OLD, NEW)).toBeNull();
		expect(replaceMapBlock(note, 4, 6, OLD, NEW)).toBeNull(); // another kind of block
		expect(replaceMapBlock('```nimble-map\nimage: [[map.png]]', 0, 1, OLD, NEW)).toBeNull(); // never closed
		// A map outside the reported lines is not ours to touch.
		expect(replaceMapBlock(`text\n\n\`\`\`nimble-map\n${OLD}\n\`\`\``, 0, 0, OLD, NEW)).toBeNull();
	});

	it('does not mistake a longer fence\'s inner line for the end', () => {
		const note = `\`\`\`\`nimble-map\n${OLD}\n\`\`\`\n\`\`\`\``;
		expect(findMapFence(note.split('\n'), 0, 5, `${OLD}\n\`\`\``)).toEqual({ open: 0, close: 5, prefix: '' });
	});
});
