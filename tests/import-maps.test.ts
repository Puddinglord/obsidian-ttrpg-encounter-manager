import { describe, expect, it } from 'vitest';
import { checkBundle } from '../src/core/import/bundle';
import { detectImporters } from '../src/core/import/importer';
import { donjonImporter, imageImporter, mapImporters, uvttImporter, watabouImporter } from '../src/core/import/maps';
import type { BundleMap } from '../src/core/import/bundle';

const games = { resolve: () => undefined };
const ctx = { plugin: null, sourcePath: '' };
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PNG64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Made up, in each tool's shape.
const watabou = {
	version: '1.2.1', title: 'The Sunken Crypt', story: 'Under the marsh, a crypt fills with water every spring.',
	rects: [{ x: -2, y: 0, w: 4, h: 4 }, { x: 0, y: 4, w: 1, h: 4 }, { x: -3, y: 8, w: 6, h: 6 }],
	doors: [{ x: 0, y: 4, dir: { x: 0, y: 1 }, type: 1 }],
	notes: [{ text: 'A cracked altar, still warm.', ref: '1', pos: { x: 0, y: 2 } }, { text: 'Water to the knees.', ref: '2', pos: { x: 0, y: 11 } }],
	columns: [], water: [],
};
const donjon = {
	cell_bit: { nothing: 0, block: 1, room: 2, corridor: 4, perimeter: 16 },
	settings: { name: 'The Mire Halls', n_rows: 5, n_cols: 10 },
	details: { history: 'Built by a forgotten bog king.' },
	cells: [
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 2, 2, 2, 4, 4, 2, 2, 2, 0],
		[0, 2, 2, 2, 0, 0, 2, 2, 2, 0],
		[0, 2, 2, 2, 0, 0, 2, 2, 2, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	],
	rooms: [null, { id: 1, row: 1, col: 1, north: 1, south: 3, west: 1, east: 3, height: 3, width: 3, contents: { summary: 'Mire Hag', detail: { monster: ['Mire Hag'], hidden_treasure: ['A silver comb'] } } },
		{ id: 2, row: 1, col: 6, north: 1, south: 3, west: 6, east: 8, height: 3, width: 3, contents: { summary: 'Empty' } }],
};

const mapOf = async (imp: typeof watabouImporter, input: Parameters<typeof imp.detect>[0]) => {
	const read = await imp.read(input, ctx);
	if (!('bundle' in read)) throw new Error('error' in read ? read.error : 'custom');
	return { read, map: read.bundle.maps![0] as BundleMap };
};

describe('maps from other tools', () => {
	it('each format is known by its own importer, surest first', () => {
		const pick = (input: Parameters<typeof watabouImporter.detect>[0]) => detectImporters(input, mapImporters())[0]?.importer.id;
		expect(pick({ files: [{ name: 'crypt.json', text: JSON.stringify(watabou) }] })).toBe('watabou-dungeon');
		expect(pick({ files: [{ name: 'halls.json', text: JSON.stringify(donjon) }, { name: 'halls.png', data: PNG }] })).toBe('donjon-dungeon');
		expect(pick({ files: [{ name: 'tavern.dd2vtt', text: JSON.stringify({ format: 0.3, resolution: { map_size: { x: 20, y: 15 }, pixels_per_grid: 128 }, image: PNG64 }) }] })).toBe('uvtt');
		expect(pick({ files: [{ name: 'region.webp', data: PNG }] })).toBe('image');
		expect(pick({ files: [], text: '{"hello":1}' })).toBeUndefined();
	});

	it('Watabou with no picture: a plain map drawn from its rooms, a pin on each note, its story on the note', async () => {
		const { read, map } = await mapOf(watabouImporter, { files: [{ name: 'crypt.json', text: JSON.stringify(watabou) }] });
		expect(map.name).toBe('The Sunken Crypt');
		expect(map.body).toBe('Under the marsh, a crypt fills with water every spring.');
		// Rooms span x -3..3 and y 0..14: framed by a cell, 8 × 16.
		expect(map.grid).toBe('8x16');
		expect(map.pins).toEqual([
			{ x: 50, y: 18.8, label: '1', text: 'A cracked altar, still warm.', kind: 'area' },
			{ x: 50, y: 75, label: '2', text: 'Water to the knees.', kind: 'area' },
		]);
		expect(map.image).toEqual({ file: 'The Sunken Crypt.svg' });
		const svg = new TextDecoder().decode(read.bundle.files![0].bytes);
		expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 192 384"/);
		expect(checkBundle(read.bundle, games).records[0].errors).toEqual([]);
	});

	it('Watabou with its picture uses the picture, and says pins may need a nudge', async () => {
		const { read, map } = await mapOf(watabouImporter, { files: [{ name: 'crypt.json', text: JSON.stringify(watabou) }, { name: 'crypt.png', data: PNG }] });
		expect(map.image).toEqual({ file: 'crypt.png' });
		expect(map.grid).toBeUndefined();
		expect('notes' in read && read.notes?.[0]).toMatch(/Move pins/);
	});

	it('donjon: a pin in the middle of each room, with what it holds', async () => {
		const { map } = await mapOf(donjonImporter, { files: [{ name: 'halls.json', text: JSON.stringify(donjon) }] });
		expect(map.name).toBe('The Mire Halls');
		expect(map.grid).toBe('10x5');
		expect(map.pins).toEqual([
			{ x: 25, y: 50, label: '1', text: 'Mire Hag\n\n**Monsters:** Mire Hag\n\n**Hidden treasure:** A silver comb', kind: 'area' },
			{ x: 75, y: 50, label: '2', text: 'Empty', kind: 'area' },
		]);
		expect(map.body).toBe('Built by a forgotten bog king.');
	});

	it('Universal VTT: its picture and grid, no pins', async () => {
		const { read, map } = await mapOf(uvttImporter, { files: [{ name: 'the_old_tavern.dd2vtt', text: JSON.stringify({ format: 0.3, resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 20, y: 15 }, pixels_per_grid: 128 }, line_of_sight: [], image: PNG64 }) }] });
		expect(map).toEqual({ name: 'The old tavern', image: { file: 'the_old_tavern.png' }, grid: '20x15', pins: [] });
		const bytes = read.bundle.files![0].bytes!;
		expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
	});

	it('pictures: a map each, named after the file', async () => {
		const read = await imageImporter.read({ files: [{ name: 'Sword Coast.webp', data: PNG }, { name: 'dungeon_level_2.png', data: PNG }] }, ctx);
		if (!('bundle' in read)) throw new Error('no bundle');
		expect(read.bundle.maps!.map(m => [m.name, m.image?.file])).toEqual([['Sword Coast', 'Sword Coast.webp'], ['Dungeon level 2', 'dungeon_level_2.png']]);
	});
});
