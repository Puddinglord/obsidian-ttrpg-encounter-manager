import { describe, expect, it } from 'vitest';
import { adjacentScene, buildCampaigns, campaignOf, canMoveInto, chapterOf, defaultKindFor, isFileFolder, nextOrder, safeName } from '../src/campaign-model';

const n = (path: string, fm: Record<string, unknown> = {}) => ({ path, fm });

const VAULT = [
	n('Home.md'),
	n('Campaigns/Vecna/Vecna.md', { nimble: 'campaign', level: 3, heroes: 4 }),
	n('Campaigns/Vecna/Prelude/Prelude.md', { nimble: 'chapter', order: 0, label: 'Prelude' }),
	n('Campaigns/Vecna/Prelude/N10 Crypt.md', { nimble: 'scene', order: 13, area: 'N10' }),
	n('Campaigns/Vecna/Prelude/N2 Chamber.md', { nimble: 'scene', order: 5, area: 'N2' }),
	n('Campaigns/Vecna/Prelude/Hook.md', { nimble: 'scene', order: 1 }),
	n('Campaigns/Vecna/Prelude/Map.md', { nimble: 'map', order: 0 }),
	n('Campaigns/Vecna/Prelude/Extras/Loose idea.md'),
	n('Campaigns/Vecna/Act 1/Act 1.md', { nimble: 'chapter', order: 1 }),
	n('Campaigns/Vecna/Act 1/Opening.md', { nimble: 'scene' }),
	n('Campaigns/Vecna/NPCs/Kevori.md', { nimble: 'npc' }),
	n('Campaigns/Vecna/Sessions/Session 1.md', { nimble: 'session' }),
	n('Campaigns/Vecna/Ideas.md'),
	n('Campaigns/Vecna/Assets/map.jpg'),
	n('Campaigns/Kingmaker/Kingmaker.md', { nimble: 'campaign' }),
	n('Campaigns/Kingmaker/Stolen Lands/Stolen Lands.md', { nimble: 'chapter' }),
	n('Campaigns/Kingmaker/Stolen Lands/Oleg\'s.md'),
];

describe('buildCampaigns', () => {
	const all = buildCampaigns(VAULT);
	const vecna = all.find(c => c.name === 'Vecna')!;

	it('finds every campaign by its home note', () => {
		expect(all.map(c => c.name)).toEqual(['Kingmaker', 'Vecna']);
		expect(vecna.level).toBe(3);
		expect(vecna.heroes).toBe(4);
	});

	it('orders chapters and scenes by order, then naturally', () => {
		expect(vecna.chapters.map(c => c.name)).toEqual(['Prelude', 'Act 1']);
		const prelude = vecna.chapters[0];
		expect(prelude.label).toBe('Prelude');
		// Notes without an order go last; nested folders still belong to the chapter.
		expect(prelude.scenes.map(s => s.title)).toEqual(['Hook', 'N2 Chamber', 'N10 Crypt', 'Loose idea']);
		expect(prelude.maps.map(m => m.title)).toEqual(['Map']);
	});

	it('treats other folders as sections and keeps loose notes', () => {
		expect(vecna.sections.map(s => s.name)).toEqual(['Assets', 'NPCs', 'Sessions']);
		expect(vecna.loose.map(l => l.title)).toEqual(['Ideas']);
	});

	it('works without any frontmatter on scenes', () => {
		const km = all.find(c => c.name === 'Kingmaker')!;
		expect(km.chapters[0].scenes.map(s => s.title)).toEqual(['Oleg\'s']);
		expect(km.chapters[0].scenes[0].kind).toBe('note');
	});

	it('finds the campaign and chapter for a note', () => {
		expect(campaignOf(all, 'Campaigns/Vecna/Prelude/N2 Chamber.md')?.name).toBe('Vecna');
		expect(campaignOf(all, 'Home.md')).toBeUndefined();
		expect(chapterOf(vecna, 'Campaigns/Vecna/Act 1/Opening.md')?.name).toBe('Act 1');
	});

	it('steps through scenes across chapters', () => {
		expect(adjacentScene(vecna, 'Campaigns/Vecna/Prelude/Hook.md', 1)?.title).toBe('N2 Chamber');
		expect(adjacentScene(vecna, 'Campaigns/Vecna/Prelude/Extras/Loose idea.md', 1)?.title).toBe('Opening');
		expect(adjacentScene(vecna, 'Campaigns/Vecna/Prelude/Hook.md', -1)).toBeUndefined();
		// From a chapter home, next is its first scene.
		expect(adjacentScene(vecna, 'Campaigns/Vecna/Act 1/Act 1.md', 1)?.title).toBe('Opening');
	});

	it('keeps a campaign nested inside another separate', () => {
		const nested = buildCampaigns([
			n('A/A.md', { nimble: 'campaign' }),
			n('A/B/B.md', { nimble: 'campaign' }),
			n('A/B/Ch/Ch.md', { nimble: 'chapter' }),
			n('A/B/Ch/Scene.md'),
		]);
		const a = nested.find(c => c.name === 'A')!;
		expect(a.chapters).toEqual([]);
		expect(a.sections).toEqual([]);
		expect(campaignOf(nested, 'A/B/Ch/Scene.md')?.name).toBe('B');
	});
});

describe('folders and files', () => {
	// A campaign straight out of "New campaign": the starter folders are empty.
	const fresh = () => buildCampaigns([
		n('Campaigns/New/New.md', { nimble: 'campaign' }),
		n('Campaigns/New/Chapter 1/Chapter 1.md', { nimble: 'chapter' }),
		n('Campaigns/New/Chapter 1/Opening Scene.md', { nimble: 'scene' }),
		n('Campaigns/New/Assets/map.png'),
		n('Campaigns/New/Assets/Handout.PDF'),
		n('Campaigns/New/Assets/maps/cave.jpg'),
		n('Campaigns/New/cover.png'),
		n('Campaigns/New/.hidden/secret.md'),
		n('Campaigns/New/Fights/Ambush.md', { nimble: 'combat' }),
	], [
		'Campaigns', 'Campaigns/New', 'Campaigns/New/Chapter 1', 'Campaigns/New/NPCs', 'Campaigns/New/Locations',
		'Campaigns/New/Sessions', 'Campaigns/New/Monsters', 'Campaigns/New/Assets', 'Campaigns/New/Assets/maps',
		'Campaigns/New/Factions', 'Campaigns/New/Factions/Guilds', 'Campaigns/New/.hidden', 'Campaigns/New/Fights', 'Elsewhere',
	])[0];

	it('lists empty folders as sections', () => {
		const c = fresh();
		expect(c.sections.map(s => s.name)).toEqual(['Assets', 'Factions', 'Locations', 'Monsters', 'NPCs', 'Sessions']);
		expect(c.sections.find(s => s.name === 'NPCs')).toEqual({ folder: 'Campaigns/New/NPCs', name: 'NPCs', notes: [], files: [] });
		expect(c.chapters.map(ch => ch.name)).toEqual(['Chapter 1']);
	});

	it('lists files that are not notes, including ones in subfolders', () => {
		const assets = fresh().sections.find(s => s.name === 'Assets')!;
		expect(assets.notes).toEqual([]);
		expect(assets.files.map(f => [f.name, f.ext])).toEqual([['cave.jpg', 'jpg'], ['Handout.PDF', 'pdf'], ['map.png', 'png']]);
	});

	it('leaves out hidden folders, loose files and folders of saved fights', () => {
		const c = fresh();
		expect(c.sections.some(s => s.name.startsWith('.') || s.name === 'Fights')).toBe(false);
		expect(c.loose).toEqual([]);
	});

	it('still works when no folder list is given', () => {
		const c = buildCampaigns([n('C/C.md', { nimble: 'campaign' }), n('C/NPCs/Bo.md', { nimble: 'npc' })])[0];
		expect(c.sections.map(s => [s.name, s.notes.length, s.files.length])).toEqual([['NPCs', 1, 0]]);
	});

	it('does not give a nested campaign\'s folder to its parent', () => {
		const [a] = buildCampaigns([n('A/A.md', { nimble: 'campaign' }), n('A/B/B.md', { nimble: 'campaign' })], ['A', 'A/B', 'A/B/NPCs']);
		expect(a.sections).toEqual([]);
	});

	it('suggests a starter from the folder name', () => {
		expect(defaultKindFor('NPCs')).toBe('npc');
		expect(defaultKindFor('locations')).toBe('location');
		expect(defaultKindFor('Sessions')).toBe('session');
		expect(defaultKindFor('Monsters')).toBe('monster');
		expect(defaultKindFor('Handouts')).toBe('handout');
		expect(defaultKindFor('Maps')).toBe('map');
		expect(defaultKindFor('Factions')).toBe('note');
		expect(defaultKindFor('Anything', true)).toBe('scene');
	});

	it('knows which folders hold files rather than notes', () => {
		expect(isFileFolder({ name: 'Assets', notes: [], files: [] })).toBe(true);
		expect(isFileFolder({ name: 'Factions', notes: [], files: [] })).toBe(false);
		expect(isFileFolder({ name: 'Art dump', notes: [], files: [{ path: 'x.png', name: 'x.png', ext: 'png' }] })).toBe(true);
		// Notes win: an Assets folder someone keeps notes in gets the New note picker.
		expect(isFileFolder({ name: 'Assets', notes: [{ path: 'a.md', title: 'a', kind: 'note' }], files: [] })).toBe(false);
	});

	it('only allows moves that change something and stay sane', () => {
		expect(canMoveInto('C/NPCs/Bo.md', 'C/Factions')).toBe(true);
		expect(canMoveInto('C/NPCs/Bo.md', 'C/NPCs')).toBe(false);
		expect(canMoveInto('C/Factions', 'C/Factions/Guilds')).toBe(false);
		expect(canMoveInto('C/Factions', 'C/Factions')).toBe(false);
		expect(canMoveInto('Old/Notes', 'C/Factions')).toBe(true);
	});
});

describe('helpers', () => {
	it('nextOrder continues after the highest order', () => {
		expect(nextOrder([{ order: 1 }, { order: 7 }, {}])).toBe(8);
		expect(nextOrder([{}, {}])).toBe(3);
	});
	it('safeName strips characters file systems reject', () => {
		expect(safeName('Vecna: Eve of Ruin')).toBe('Vecna- Eve of Ruin');
		expect(safeName('  ')).toBe('Untitled');
	});
});

describe('saved fights', () => {
	it('are not listed as scenes or section notes', () => {
		const [c] = buildCampaigns([
			n('Campaigns/A/A.md', { nimble: 'campaign' }),
			n('Campaigns/A/Ch/Ch.md', { nimble: 'chapter' }),
			n('Campaigns/A/Ch/Room.md', { nimble: 'scene' }),
			n('Campaigns/A/Ch/Fights/Room - Goblins.md', { nimble: 'combat' }),
			n('Campaigns/A/Fights/Ambush.md', { nimble: 'combat' }),
		]);
		expect(c.chapters[0].scenes.map(s => s.title)).toEqual(['Room']);
		expect(c.sections.map(s => s.name)).toEqual([]);
	});
});
