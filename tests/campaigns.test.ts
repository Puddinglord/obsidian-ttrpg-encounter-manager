import { describe, expect, it } from 'vitest';
import { adjacentScene, buildCampaigns, campaignOf, chapterOf, nextOrder, safeName } from '../src/campaign-model';

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
		expect(vecna.sections.map(s => s.name)).toEqual(['NPCs', 'Sessions']);
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
