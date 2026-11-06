// Starter notes for campaigns. Light on structure: headings a GM can fill or
// delete, frontmatter the campaign panel reads, nothing that breaks if removed.

import { NPC_CARD_BLOCK } from './npc-card-def';

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
