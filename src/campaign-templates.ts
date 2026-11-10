// Starter notes for campaigns. Light on structure: headings a GM can fill or
// delete, frontmatter the campaign panel reads, nothing that breaks if removed.

import { NPC_CARD_BLOCK } from './npc-card-def';

/** What "New note" can start from. `note` is a blank page. */
export type StarterKind = 'note' | 'scene' | 'npc' | 'location' | 'session' | 'map' | 'monster' | 'handout';

export interface Starter {
	kind: StarterKind;
	label: string;
	icon: string;
	/** Example name for the name box. */
	placeholder: string;
}

/** Starters in the order the New note picker shows them. */
export const STARTERS: Starter[] = [
	{ kind: 'note', label: 'Note', icon: 'file-text', placeholder: 'Name, e.g. The Zhentarim' },
	{ kind: 'scene', label: 'Scene', icon: 'clapperboard', placeholder: 'Scene name, e.g. The Collapsed Bridge' },
	{ kind: 'npc', label: 'NPC', icon: 'user-round', placeholder: 'Name, e.g. Sister Garaele' },
	{ kind: 'location', label: 'Location', icon: 'map-pin', placeholder: 'Place, e.g. Phandalin' },
	{ kind: 'session', label: 'Session log', icon: 'calendar-days', placeholder: 'Session name' },
	{ kind: 'map', label: 'Map', icon: 'map', placeholder: 'Map name, e.g. Cragmaw Hideout' },
	{ kind: 'monster', label: 'Monster', icon: 'skull', placeholder: 'Monster name, e.g. Goblin Boss' },
	{ kind: 'handout', label: 'Handout', icon: 'scroll-text', placeholder: 'Handout name, e.g. Letter from Iarno' },
];

const fm = (fields: Record<string, string | number | undefined>) =>
	'---\n' + Object.entries(fields).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n';

export function campaignHome(name: string, level: number, heroes: number, system = 'Nimble'): string {
	return fm({ nimble: 'campaign', system, level, heroes, status: 'active' }) + `

*One or two sentences on what this campaign is about.*

\`\`\`nimble-campaign
\`\`\`

## Notes
- Themes, tone, safety tools, house rules.
`;
}

export function chapterHome(name: string, order: number, label?: string, level?: number): string {
	return fm({ nimble: 'chapter', order, label: label ? JSON.stringify(label) : undefined, level }) + `

## Overview
*What happens in this chapter, and how the heroes get pulled in.*

## Scenes
Scenes are the notes in this folder. Use **New scene** in the Campaign panel or the command palette.
`;
}

export function sceneNote(name: string, order: number): string {
	return fm({ nimble: 'scene', order }) + `

> [!nimble-read]- Read aloud
> What the heroes see, hear and smell when they arrive.

## What's here
-

## Encounter
*Type \`/encounter\` to add one.*

## Exits
-
`;
}

export function npcNote(_name: string): string {
	return fm({ nimble: 'npc', role: '""', portrait: '""' }) + `
${NPC_CARD_BLOCK}

## What they know
-

## Appears in
-
`;
}

export function locationNote(name: string): string {
	return fm({ nimble: 'location' }) + `

*Sights, sounds, who's here.*

## Connections
-
`;
}

export function sessionNote(name: string, date: string, lastScene?: string): string {
	return fm({ nimble: 'session', date }) + `

## Prep
- [ ] Start at ${lastScene ? `[[${lastScene}]]` : 'the next scene'}
- [ ] Encounters ready
- [ ] Handouts and maps

## Recap
*What happened, for next time.*

## Loose threads
-
`;
}

/** A blank note: no properties, nothing to delete. */
export function blankNote(): string {
	return '';
}

/** A map note. `image` is link text for the map picture, or empty to fill in later. */
export function mapNote(_name: string, image?: string): string {
	return fm({ nimble: 'map' }) + `
*What this map shows. Click a pin to open its note.*

\`\`\`nimble-map
image: ${image ? `[[${image}]]` : ''}
pins:
\`\`\`
`;
}

export function monsterNote(name: string): string {
	const title = name.replace(/[\r\n]+/g, ' ').trim() || 'Monster';
	return fm({ nimble: 'monster' }) + `
\`\`\`nimble
name: ${title}
level: 1
size: Medium
type: Humanoid
hp: 21
armor: none
movement: 6
saves: STR+
abilities:
- Trait: What makes it dangerous.
attacks:
- **Strike.** 1d8+2.
\`\`\`

## Tactics
-
`;
}

export function handoutNote(_name: string): string {
	return fm({ nimble: 'handout' }) + `
> [!quote] For the players
> The text, letter or clue exactly as the heroes see it.

## GM notes
- When and how they get it
`;
}
