import { describe, expect, it } from 'vitest';
import { originalBody, readOriginal, replaceConverted } from '../src/core/import/original';

describe('a converted note keeps its original', () => {
	const o = { game: 'dnd5e', lang: '5e', converted: '2026-11-24', body: 'name: Goblin Warrior\nac: 15\nhp: 10' };
	it('writes and reads back the same', () => {
		expect(originalBody(o)).toBe('game: dnd5e\nlang: 5e\nconverted: 2026-11-24\n---\nname: Goblin Warrior\nac: 15\nhp: 10');
		expect(readOriginal(originalBody(o))).toEqual(o);
	});
	it('says when it isn\'t one', () => {
		expect(readOriginal('name: X')).toBeNull();
		expect(readOriginal('game: dnd5e\n---\nname: X')).toBeNull();
	});
	it('converting again replaces the converted block and leaves the rest, the original included', () => {
		const note = '---\nnimble: monster\n---\n\n```nimble\nname: Goblin Warrior\nhp: 99\n```\n\nMy notes.\n\n```ev-original\ngame: dnd5e\nlang: 5e\n---\nname: Goblin Warrior\n```\n';
		const next = replaceConverted(note, 'nimble', '```nimble\nname: Goblin Warrior\nhp: 10\n```')!;
		expect(next).toBe(note.replace('hp: 99', 'hp: 10'));
		expect(replaceConverted('no blocks', 'nimble', 'x')).toBeNull();
	});
});
