// The cards on quest, location and session notes: what they read from the notes (core/campaign-card-def.ts).
import { describe, expect, it } from 'vitest';
import {
	fmList, inTaken, linksIn, linkTarget, noteSections, questCard, questKind, questMoves, questStamp, sectionItems, sessionCard, sessionDate,
	sessionHead, setTask,
} from '../src/core/campaign-card-def';
import { questNote, sessionNote } from '../src/core/campaign-templates';

const QUEST = `---
nimble: quest
status: active
---

\`\`\`box quest title="The hook"
## Not a heading
\`\`\`

## Objectives
- [x] Get past the Lower Gate
- [ ] Find Assayer Dunn
- [ ]

## The truth
*What's really going on, that the heroes don't know yet.*
Dunn isn't missing. She's hiding from Krenn.

## Notes
Krenn wants the ledger.
`;

describe('quest cards', () => {
	it('reads the objectives and the truth, and says which sections it took', () => {
		const q = questCard({}, QUEST, false);
		expect(q.objectives.map(o => [o.text, o.done])).toEqual([['Get past the Lower Gate', true], ['Find Assayer Dunn', false]]);
		expect(q.secret).toBe("Dunn isn't missing. She's hiding from Krenn.");
		const lines = QUEST.split('\n');
		const at = (s: string) => lines.indexOf(s);
		expect(inTaken(q.taken, at('## Objectives'))).toBe(true);
		expect(inTaken(q.taken, at('- [ ] Find Assayer Dunn'))).toBe(true);
		expect(inTaken(q.taken, at('## The truth'))).toBe(true);
		expect(inTaken(q.taken, at('## Notes'))).toBe(false);
		expect(inTaken(q.taken, at('Krenn wants the ledger.'))).toBe(false);
	});

	it('never takes a heading inside a code block, and keeps secrets from players', () => {
		expect(noteSections(QUEST).map(s => s.title)).toEqual(['Objectives', 'The truth', 'Notes']);
		const p = questCard({}, QUEST, true);
		expect(p.secret).toBe('');
		expect(p.taken.length).toBe(1);
	});

	it('prefers the secret property, and leaves the truth section in the note then', () => {
		const q = questCard({ secret: 'She did it.' }, QUEST, false);
		expect(q.secret).toBe('She did it.');
		expect(inTaken(q.taken, QUEST.split('\n').indexOf('## The truth'))).toBe(false);
	});

	it('takes nothing from a fresh note: its sections are only prompts', () => {
		expect(questCard({}, questNote('The Missing Caravan'), false)).toEqual({ objectives: [], secret: '', taken: [] });
	});

	it('ticks an objective in the note', () => {
		const q = questCard({}, QUEST, false);
		const t = setTask(QUEST, q.objectives[1].line, true);
		expect(t).toContain('- [x] Find Assayer Dunn');
		expect(setTask(t, q.objectives[0].line, false)).toContain('- [ ] Get past the Lower Gate');
		expect(setTask(QUEST, 0, true)).toBe(QUEST);
	});

	it('stamps the status and names the kind', () => {
		expect(questStamp('active')).toEqual({ kind: 'active', text: 'Active' });
		expect(questStamp('available')).toEqual({ kind: 'open', text: 'Available' });
		expect(questStamp('completed')).toEqual({ kind: 'done', text: 'Completed' });
		expect(questStamp('failed')).toEqual({ kind: 'failed', text: 'Failed' });
		expect(questStamp(undefined)).toEqual({ kind: 'open', text: 'Open' });
		expect(questKind('main')).toBe('Main quest');
		expect(questKind('side')).toBe('Side quest');
		expect(questKind('')).toBe('Quest');
		expect(questKind('Side quest')).toBe('Side quest');
	});
});

describe('session cards', () => {
	it('repeats nothing: the session number goes to the kicker, or the date alone', () => {
		expect(sessionHead('Session 7 - Through the Lower Gate', '2026-11-12')).toEqual({ kicker: 'Session 7 · 12 November 2026', title: 'Through the Lower Gate' });
		expect(sessionHead('Session 9', '2026-11-12')).toEqual({ kicker: '12 November 2026', title: 'Session 9' });
		expect(sessionHead('The keeper’s last log', '')).toEqual({ kicker: 'Session', title: 'The keeper’s last log' });
		expect(sessionDate('next Tuesday')).toBe('next Tuesday');
	});

	it('reads the quests it moved, with the word for each', () => {
		expect(questMoves(['[[The missing assayer]] advanced', '[[Krenn\'s whistle]]: failed', '[[Rats]] new', '[[Mine]] completed', '[[Plain]]'])).toEqual([
			{ quest: '[[The missing assayer]]', move: 'advanced', word: 'Advanced' },
			{ quest: '[[Krenn\'s whistle]]', move: 'failed', word: 'Failed' },
			{ quest: '[[Rats]]', move: 'new', word: 'New' },
			{ quest: '[[Mine]]', move: 'done', word: 'Done' },
			{ quest: '[[Plain]]', move: 'advanced', word: 'Advanced' },
		]);
	});

	it('takes the recap, loot and next time from the note, the properties first', () => {
		const text = '---\nnimble: session\n---\n\n## Recap\n*What happened, in a few lines.*\n- Talked Ollo round.\n- Found the ink.\n\n## Loot\n- 40 gp\n\n## Next time\nDown to the pits.\n\n## Battles\n- Rats\n';
		const s = sessionCard({}, text);
		expect(s).toMatchObject({ recap: ['Talked Ollo round.', 'Found the ink.'], loot: ['40 gp'], next: 'Down to the pits.' });
		expect(s.taken.length).toBe(3);
		const p = sessionCard({ loot: ['A key'], next: 'Home.' }, text);
		expect(p).toMatchObject({ loot: ['A key'], next: 'Home.' });
		expect(p.taken.length).toBe(1);
	});

	it('gives a new session its party and room for quests, loot and next time', () => {
		const s = sessionNote('Session 2', '2026-11-20', undefined, 'gm', { party: ['[[Brakka]]', 'Wren'], card: true });
		expect(s).toMatch(/party: \n {2}- "\[\[Brakka\]\]"\n {2}- "Wren"\nquests: \[\]\nloot: \[\]\nnext: ""\n---\n\n```nimble-note\n```\n/);
		expect(sessionNote('Session 2', '2026-11-20')).not.toContain('party');
	});
});

describe('card helpers', () => {
	it('reads lists, links and items', () => {
		expect(fmList(['a', ' ', 'b'])).toEqual(['a', 'b']);
		expect(fmList('one, two')).toEqual(['one, two']);
		expect(linkTarget('[[Gullhaven Chapel|the chapel]]')).toEqual({ target: 'Gullhaven Chapel', shown: 'the chapel', link: true });
		expect(linkTarget('The vaults')).toEqual({ target: 'The vaults', shown: 'The vaults', link: false });
		expect(linksIn('- [[A]] and [[B|b]]\n- [[A#x]]')).toEqual(['A', 'B']);
		const [s] = noteSections('## Recap\nOne line\nstill one.\n\nTwo.\n');
		expect(sectionItems(s)).toEqual(['One line still one.', 'Two.']);
	});
});
