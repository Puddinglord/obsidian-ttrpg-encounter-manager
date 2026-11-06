import { describe, expect, it } from 'vitest';
import { parseCountQuery } from '../src/tracker-text';

describe('parseCountQuery', () => {
	it.each([
		['goblin', 1, 'goblin'],
		['3 goblin', 3, 'goblin'],
		['3x goblin minion', 3, 'goblin minion'],
		['3× goblin', 3, 'goblin'],
		['  12   wolf ', 12, 'wolf'],
		['500 rats', 50, 'rats'],
		['0 rats', 1, 'rats'],
		['42', 1, '42'],
	])('%s → %i × %s', (input, count, query) => expect(parseCountQuery(input)).toEqual({ count, query }));
});
