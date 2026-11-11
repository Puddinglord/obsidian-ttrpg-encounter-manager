import { describe, expect, it } from 'vitest';
import { campaignHome, npcNote, sceneNote } from '../src/campaign-templates';
import { adjacentScene, buildCampaigns, campaignOf, canMoveInto, chapterOf, defaultKindFor, homeFolderFor, isFileFolder, nextOrder, safeName } from '../src/campaign-model';

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

describe('where a new note is filed', () => {
	const vecna = buildCampaigns(VAULT, ['Campaigns/Vecna/Factions']).find(c => c.name === 'Vecna')!;
	const prelude = 'Campaigns/Vecna/Prelude';

	it('keeps scenes, plain notes and maps in the chapter they were made in', () => {
		expect(homeFolderFor(vecna, 'scene', prelude)).toBe(prelude);
		expect(homeFolderFor(vecna, 'note', prelude)).toBe(prelude);
		expect(homeFolderFor(vecna, 'map', prelude)).toBe(prelude);
	});

	it('files NPCs, locations, monsters and handouts made from a chapter in the campaign\'s folders', () => {
		expect(homeFolderFor(vecna, 'npc', prelude)).toBe('Campaigns/Vecna/NPCs');
		// No Locations, Monsters or Handouts folder yet: the usual name, made on first use.
		expect(homeFolderFor(vecna, 'location', prelude)).toBe('Campaigns/Vecna/Locations');
		expect(homeFolderFor(vecna, 'monster', prelude)).toBe('Campaigns/Vecna/Monsters');
		expect(homeFolderFor(vecna, 'handout', prelude)).toBe('Campaigns/Vecna/Handouts');
	});

	it('does the same from the top of the campaign', () => {
		expect(homeFolderFor(vecna, 'npc', vecna.folder)).toBe('Campaigns/Vecna/NPCs');
		expect(homeFolderFor(vecna, 'session', vecna.folder)).toBe('Campaigns/Vecna/Sessions');
		expect(homeFolderFor(vecna, 'note', vecna.folder)).toBe(vecna.folder);
		expect(homeFolderFor(vecna, 'map', vecna.folder)).toBe(vecna.folder); // no Maps folder here
	});

	it('leaves a folder of your own alone', () => {
		expect(homeFolderFor(vecna, 'npc', 'Campaigns/Vecna/Factions')).toBe('Campaigns/Vecna/Factions');
		expect(homeFolderFor(vecna, 'location', 'Campaigns/Vecna/NPCs')).toBe('Campaigns/Vecna/NPCs');
	});

	it('uses a renamed folder (Characters, Places, Maps) rather than making a second one', () => {
		const c = buildCampaigns([
			n('C/C.md', { nimble: 'campaign' }),
			n('C/Act 1/Act 1.md', { nimble: 'chapter' }),
			n('C/Characters/Mara.md', { nimble: 'npc' }),
		], ['C/Places', 'C/Maps'])[0];
		expect(homeFolderFor(c, 'npc', 'C/Act 1')).toBe('C/Characters');
		expect(homeFolderFor(c, 'location', 'C')).toBe('C/Places');
		expect(homeFolderFor(c, 'map', 'C')).toBe('C/Maps');
		expect(homeFolderFor(c, 'map', 'C/Act 1')).toBe('C/Act 1');
	});
});

describe('chapters wherever they sit', () => {
	const c = buildCampaigns([
		n('C/C.md', { nimble: 'campaign' }),
		n('C/Chapters/Act 1/Act 1.md', { nimble: 'chapter', order: 1 }),
		n('C/Chapters/Act 1/Gate.md', { nimble: 'scene' }),
		n('C/Chapters/Act 2/Act 2.md', { nimble: 'chapter', order: 2 }),
		n('C/Chapters/Act 2/Keep.md', { nimble: 'scene' }),
		n('C/Chapters/Act 2/keep-map.png'),
		n('C/Archive/Old idea.md'),
		n('C/Archive/Cut chapter/Cut chapter.md', { nimble: 'chapter', order: 9 }),
		n('C/Archive/Cut chapter/Lost scene.md'),
		n('C/cover.png'),
		n('C/Stray chapter note.md', { nimble: 'chapter' }),
	], ['C/Chapters', 'C/Chapters/Act 1', 'C/Chapters/Act 2', 'C/Archive', 'C/Archive/Cut chapter'])[0];

	it('makes one chapter per chapter note, in the folder that note is in', () => {
		expect(c.chapters.map(ch => [ch.name, ch.folder])).toEqual([
			['Act 1', 'C/Chapters/Act 1'], ['Act 2', 'C/Chapters/Act 2'], ['Cut chapter', 'C/Archive/Cut chapter'],
		]);
		expect(c.chapters[0].scenes.map(s => s.title)).toEqual(['Gate']);
		expect(c.chapters[1].scenes.map(s => s.title)).toEqual(['Keep']);
	});

	it('keeps the rest of a folder that also holds a chapter, and hides one that only holds chapters', () => {
		expect(c.sections.map(s => s.name)).toEqual(['Archive']);
		expect(c.sections[0].notes.map(x => x.title)).toEqual(['Old idea']);
	});

	it('lists files kept in a chapter and at the top of the campaign', () => {
		expect(c.chapters[1].files.map(f => f.name)).toEqual(['keep-map.png']);
		expect(c.looseFiles.map(f => f.name)).toEqual(['cover.png']);
	});

	it('does not turn the whole campaign into a chapter for a chapter note at the top', () => {
		expect(c.loose.map(x => x.title)).toEqual(['Stray chapter note']);
	});
});

describe('next and previous scene from notes that are not scenes', () => {
	const c = buildCampaigns([
		n('C/C.md', { nimble: 'campaign' }),
		n('C/A/A.md', { nimble: 'chapter', order: 1 }),
		n('C/A/One.md', { nimble: 'scene', order: 1 }),
		n('C/A/Two.md', { nimble: 'scene', order: 2 }),
		n('C/A/Letter.md', { nimble: 'handout' }),
		n('C/B/B.md', { nimble: 'chapter', order: 2 }),
		n('C/D/D.md', { nimble: 'chapter', order: 3 }),
		n('C/D/Three.md', { nimble: 'scene' }),
		n('C/Sessions/Session 1.md', { nimble: 'session' }),
	])[0];
	const at = (p: string, d: 1 | -1) => adjacentScene(c, p, d)?.title;

	it('starts from the campaign home', () => {
		expect(at('C/C.md', 1)).toBe('One');
		expect(at('C/C.md', -1)).toBeUndefined();
	});
	it('goes on from a chapter note, skipping empty chapters, and back to the chapter before', () => {
		expect(at('C/B/B.md', 1)).toBe('Three');
		expect(at('C/B/B.md', -1)).toBe('Two');
		expect(at('C/D/D.md', -1)).toBe('Two');
		expect(at('C/A/A.md', -1)).toBeUndefined();
	});
	it('treats a handout kept in a chapter like the chapter note', () => {
		expect(at('C/A/Letter.md', 1)).toBe('One');
	});
	it('has nowhere to go from a note outside the chapters', () => {
		expect(at('C/Sessions/Session 1.md', 1)).toBeUndefined();
	});
});

describe('names a file name cannot hold', () => {
	it('keeps the name as typed in a title property', () => {
		expect(campaignHome('Vecna: Eve of Ruin', 3, 4)).toContain('title: "Vecna: Eve of Ruin"');
		expect(sceneNote('Who goes there?', 2)).toContain('title: "Who goes there?"');
		expect(npcNote('Sister "Red" Garaele')).toContain('title: "Sister \\"Red\\" Garaele"');
	});
	it('adds nothing when the file name is the name', () => {
		expect(campaignHome('Lost Mine', 1, 4)).not.toContain('title:');
		expect(npcNote('Marta Hale')).not.toContain('title:');
	});
	it('is read back as the name shown', () => {
		const c = buildCampaigns([n('Campaigns/Vecna- Eve of Ruin/Vecna- Eve of Ruin.md', { nimble: 'campaign', title: 'Vecna: Eve of Ruin' })])[0];
		expect(c.name).toBe('Vecna: Eve of Ruin');
	});
});
