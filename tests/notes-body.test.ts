import { describe, expect, it } from 'vitest';
import { notesBody } from '../src/creature-notes';

describe('notesBody', () => {
	it('drops properties, empty bullets and empty headings', () => {
		const t = `---\nnimble: creature\ncreature: "Krogg"\n---\n## What we've seen\n- Hates garlic.\n\n## Strengths & weaknesses\n-\n\n## Fights\n-\n`;
		expect(notesBody(t)).toBe("## What we've seen\n- Hates garlic.");
	});
	it('is empty for the untouched template', () => {
		expect(notesBody(`---\nnimble: creature\n---\n## A\n-\n\n## B\n-\n`)).toBe('');
	});
	it('keeps a heading whose content is a subheading', () => {
		expect(notesBody('## Fights\n### Session 2\nRan away.')).toBe('## Fights\n### Session 2\nRan away.');
	});
});
