import { describe, expect, it } from 'vitest';
import { findMapFence, mapBlockSource, parseMapBlock, parsePinLine, replaceMapBlock } from '../src/map-def';

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
		expect(def.grid).toEqual({ cols: 30, rows: 20 });
		expect(def.pins).toHaveLength(2);
		expect(mapBlockSource(def)).toBe(src);
	});

	it('accepts embeds and plain paths for the image', () => {
		expect(parseMapBlock('image: ![[map.png]]').image).toBe('map.png');
		expect(parseMapBlock('image: https://example.com/map.png').image).toBe('https://example.com/map.png');
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
