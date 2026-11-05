import { describe, expect, it } from 'vitest';
import { applyHpInput, crossedThreshold, EncounterStore, nextLabel } from '../src/encounters';
import { DEFAULT_SETTINGS, NimbleStatblocksSettings } from '../src/types';

const goblin = { name: 'Goblin', hp: 12, armor: 'none' as const, movement: '6' };

function store() {
	const settings: NimbleStatblocksSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
	return { settings, store: new EncounterStore(() => settings, async () => {}) };
}

describe('nextLabel', () => {
	it('numbers from the highest existing label', () => {
		expect(nextLabel([], 'Goblin')).toBe('Goblin-1');
		expect(nextLabel(['Goblin-2', 'Goblin-3'], 'Goblin')).toBe('Goblin-4');
		expect(nextLabel(['Goblin Boss-1', 'Goblin-1'], 'Goblin')).toBe('Goblin-2');
		expect(nextLabel(['Goblin-x', 'Fred'], 'Goblin')).toBe('Goblin-1');
	});
});

describe('applyHpInput', () => {
	it.each([
		['7', 20, 13], ['-7', 20, 13], ['+5', 10, 15], ['+50', 10, 20], ['=3', 10, 3], ['99', 10, 0], [' 4 ', 10, 6], ['abc', 10, null], ['', 10, null],
	])('%s from %d -> %s', (input, current, out) => expect(applyHpInput(input as string, current as number, 20)).toBe(out));
});

describe('crossedThreshold', () => {
	it('detects phases', () => {
		expect(crossedThreshold(100, 50, 100)).toBe('bloodied');
		expect(crossedThreshold(60, 51, 100)).toBeNull();
		expect(crossedThreshold(40, 0, 100)).toBe('last-stand');
		expect(crossedThreshold(40, 60, 100)).toBe('recovered');
	});
});

describe('EncounterStore', () => {
	it('creates a single encounter on demand and adds creatures', () => {
		const { store: s, settings } = store();
		const added = s.add(goblin, 'Goblin.md', 3);
		expect(added.map(c => c.label)).toEqual(['Goblin-1', 'Goblin-2', 'Goblin-3']);
		expect(new Set(added.map(c => c.id)).size).toBe(3);
		expect(settings.encounters).toHaveLength(1);
	});

	it('never duplicates labels after a removal', () => {
		const { store: s } = store();
		const [g1] = s.add(goblin, undefined, 3);
		s.remove(s.active!.id, g1.id);
		const [next] = s.add(goblin);
		expect(next.label).toBe('Goblin-4');
	});

	it('copies the monster so edits do not leak between creatures', () => {
		const { store: s } = store();
		const [a, b] = s.add(goblin, undefined, 2);
		expect(a.monster).not.toBe(b.monster);
	});

	it('clamps hp and reports thresholds', () => {
		const { store: s } = store();
		const [g] = s.add(goblin);
		const enc = s.active!.id;
		expect(s.adjustHp(enc, g.id, -6)).toBe('bloodied');
		expect(s.adjustHp(enc, g.id, -100)).toBe('last-stand');
		expect(s.creature(enc, g.id)!.currentHp).toBe(0);
		s.adjustHp(enc, g.id, 100);
		expect(s.creature(enc, g.id)!.currentHp).toBe(12);
	});

	it('emits changed on every mutation', () => {
		const { store: s } = store();
		let n = 0;
		s.on('changed', () => { n++; });
		const [g] = s.add(goblin);
		s.toggleCondition(s.active!.id, g.id, 'Prone', true);
		s.toggleCondition(s.active!.id, g.id, 'Prone', true); // no-op
		s.setRound(s.active!.id, 2);
		expect(n).toBe(3);
	});

	it('migrates nothing it does not need to: plain monsters default to the monster side', () => {
		const { store: s } = store();
		const [g] = s.add(goblin);
		expect(g.side).toBe('monster');
		expect(g.conditions).toEqual([]);
	});
});
