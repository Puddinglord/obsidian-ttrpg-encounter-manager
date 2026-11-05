import { describe, expect, it } from 'vitest';
import { mapBlockSource, parseMapBlock, parsePinLine } from '../src/map-def';

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
