// Starter notes for campaigns. Light on structure: headings a GM can fill or
// delete, frontmatter the campaign panel reads, nothing that breaks if removed.

import { safeName } from './campaign-model';
import { NPC_CARD_BLOCK } from './npc-card-def';

/** What "New note" can start from. `note` is a blank page. */
export type StarterKind = 'note' | 'scene' | 'npc' | 'location' | 'quest' | 'session' | 'map' | 'monster' | 'handout' | 'character';

/** Notes are written for whoever keeps them: the GM's prep, or a player's notes from the table. */
export type NoteSide = 'gm' | 'player';

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
	{ kind: 'quest', label: 'Quest', icon: 'flag', placeholder: 'Quest, e.g. The Missing Caravan' },
	{ kind: 'session', label: 'Session log', icon: 'calendar-days', placeholder: 'Session name' },
	{ kind: 'map', label: 'Map', icon: 'map', placeholder: 'Map name, e.g. Cragmaw Hideout' },
	{ kind: 'monster', label: 'Monster', icon: 'skull', placeholder: 'Monster name, e.g. Goblin Boss' },
	{ kind: 'handout', label: 'Handout', icon: 'scroll-text', placeholder: 'Handout name, e.g. Letter from Iarno' },
	{ kind: 'character', label: 'Character', icon: 'shield', placeholder: 'Hero name, e.g. Thorga Ironbrow' },
];

/** Starters a player is offered: no monsters, and the handout is something you were given. */
export const PLAYER_STARTERS: StarterKind[] = ['note', 'scene', 'npc', 'location', 'quest', 'session', 'map', 'character', 'handout'];

/**
 * File names can't hold : ? " / and a few others, so "Vecna: Eve of Ruin" is
 * saved as "Vecna- Eve of Ruin". When that happens the name as typed goes in a
 * `title:` property, which the Campaign panel and NPC cards show instead.
 */
const titleOf = (name: string): string | undefined => {
	const t = name.replace(/\s+/g, ' ').trim();
	return t && safeName(t) !== t ? JSON.stringify(t) : undefined;
};

const fm = (fields: Record<string, string | number | undefined>) =>
	'---\n' + Object.entries(fields).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n';

export function campaignHome(name: string, level: number, heroes: number, system = 'Nimble', edition?: string): string {
	return fm({ nimble: 'campaign', title: titleOf(name), system, edition, level, heroes, status: 'active' }) + `

*One or two sentences on what this campaign is about.*

\`\`\`nimble-campaign
\`\`\`

## Notes
- Themes, tone, safety tools, house rules.
`;
}

/** The home note of a campaign you play in: what it's about, the party's goals, the table. */
export function playerCampaignHome(name: string, opts: { gm?: string; level?: number; character?: string } = {}, system = 'Nimble', edition?: string): string {
	return fm({ nimble: 'campaign', role: 'player', title: titleOf(name), system, edition, gm: opts.gm ? JSON.stringify(opts.gm) : undefined, level: opts.level, status: 'active' }) + `

*What this campaign is about, as the GM pitched it.*

\`\`\`nimble-campaign
\`\`\`

## Goals
*Quests get their own notes in the Quests folder. Bigger hopes and plans go here.*
- [ ] ${opts.character ? `Get ${opts.character} through the first session alive` : 'The first thing the party agreed to do'}

## Table
- Schedule, house rules, safety tools.
`;
}

export function chapterHome(name: string, order: number, label?: string, level?: number): string {
	return fm({ nimble: 'chapter', title: titleOf(name), order, label: label ? JSON.stringify(label) : undefined, level }) + `

## Overview
*What happens in this chapter, and how the heroes get pulled in.*

## Scenes
Scenes are the notes in this folder. Use **New scene** in the Campaign panel or the command palette.
`;
}

export function sceneNote(name: string, order: number): string {
	return fm({ nimble: 'scene', title: titleOf(name), order }) + `

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

/**
 * An NPC. The properties are the quick facts the card and Spotlight show; the
 * headings below are prompts, all optional. A player's version is written
 * from the outside: what we've seen and suspect, not their secrets.
 */
export function npcNote(name: string, side: NoteSide = 'gm'): string {
	const props = fm({
		nimble: 'npc', title: titleOf(name), role: '""', portrait: '""', aliases: '[]',
		ancestry: '""', pronouns: '""', age: '""', faction: '""', location: '""',
		status: 'alive', attitude: side === 'player' ? 'unknown' : 'neutral',
		first_met: side === 'player' ? '""' : undefined,
	});
	if (side === 'player') {
		return props + `
${NPC_CARD_BLOCK.replace('secret: ', 'suspicions: ')}

## First impressions
*How we met, what they looked and sounded like.*

## What we learned
-

## What they want from us
-

## Promises & debts
- [ ]

## Quotes
> 

## Notes
`;
	}
	return props + `
${NPC_CARD_BLOCK}

## Personality
- **Mannerism:** 
- **Ideal:** 
- **Flaw:** 

## What they know
-

## Relationships
-

## Quotes
> 

## Appears in
-

## Notes
`;
}

/** A place. `region:` links to the place it sits in, so locations nest (a tavern in a town in a region). */
export function locationNote(name: string, side: NoteSide = 'gm'): string {
	const props = fm({ nimble: 'location', title: titleOf(name), type: '""', region: '""', status: '""', image: '""' });
	const player = side === 'player';
	return props + `
*${player ? 'What it looks, sounds and smells like when we arrive.' : 'Sights, sounds, smells. What the heroes notice first.'}*

## Overview
-

## People here
-

## Points of interest
-

## Factions
-

## ${player ? 'Rumors' : 'Rumors & secrets'}
-

## Connections
-

## History
-

## ${player ? 'Our visits' : 'Visits'}
-
`;
}

/**
 * A quest. The properties are the quick facts: where it stands, who gave it,
 * where it leads and what it pays. `status:` moves it down the Quests folder
 * once it's completed or failed. The GM's version holds the truth behind it;
 * a player's is what the party was told and has pieced together since.
 */
export function questNote(name: string, side: NoteSide = 'gm'): string {
	const player = side === 'player';
	const props = fm({
		nimble: 'quest', title: titleOf(name), status: player ? 'active' : 'available', type: 'side',
		giver: '""', location: '""', reward: '""', level: player ? undefined : '""',
	});
	if (player) {
		return props + `
\`\`\`box quest title="The job"
Who asked, what they want done, and what they offered.
\`\`\`

## Objectives
- [ ] 

## What we know
-

## Leads
- [ ] 

## People & places
-

## Questions
-

## Progress
-
`;
	}
	return props + `
\`\`\`box quest title="The hook"
How the heroes hear about it, who asks, and what they're offered.
\`\`\`

## Objectives
- [ ] 

## Stakes
- **If they succeed:** 
- **If they fail or walk away:** 

## The truth
*What's really going on, that the heroes don't know yet.*

## Clues & leads
-

## People & places
-

## Complications
-

## Rewards
-

## Progress
-
`;
}

export function sessionNote(name: string, date: string, lastScene?: string, side: NoteSide = 'gm'): string {
	if (side === 'player') {
		return fm({ nimble: 'session', title: titleOf(name), date }) + `

## Recap
*What happened, in a few lines.*

## Battles
*Type \`/fought\` to note who you fought.*

## People we met
-

## Loot
-

## Leads & questions
- [ ]
`;
	}
	return fm({ nimble: 'session', title: titleOf(name), date }) + `

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

/**
 * A character note: the properties are the sheet's data and the
 * ```nimble-sheet block draws the sheet from them. Everything else is yours.
 */
export function characterNote(name: string, opts: { mine?: boolean; player?: string; level?: number } = {}): string {
	return fm({
		nimble: 'character', title: titleOf(name), mine: opts.mine ? 'true' : undefined, player: opts.player ? JSON.stringify(opts.player) : undefined,
		ancestry: '""', class: '""', level: opts.level ?? 1, portrait: '""', cssclasses: '[nimble-sheet-note]',
	}) + `
\`\`\`nimble-sheet
\`\`\`

## Backstory

## Notes
`;
}

/**
 * A player's notes on a creature from the bestiary: what the party has seen
 * of it. `creature:` names the bestiary entry, which shows these notes under
 * the book's lore.
 */
export function creatureNote(creature: string): string {
	return fm({ nimble: 'creature', creature: JSON.stringify(creature), first_seen: '""' }) + `
## What we've seen
-

## Strengths & weaknesses
-

## Fights
-
`;
}

/** A blank note: no properties, nothing to delete. */
export function blankNote(): string {
	return '';
}

/** A map note. `image` is link text for the map picture, or empty to fill in later. */
export function mapNote(name: string, image?: string): string {
	return fm({ nimble: 'map', title: titleOf(name) }) + `
*What this map shows. Click a pin to open its note.*

\`\`\`nimble-map
image: ${image ? `[[${image}]]` : ''}
pins:
\`\`\`
`;
}

export function monsterNote(name: string): string {
	const title = name.replace(/[\r\n]+/g, ' ').trim() || 'Monster';
	return fm({ nimble: 'monster', title: titleOf(name) }) + `
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

export function handoutNote(name: string, side: NoteSide = 'gm'): string {
	if (side === 'player') {
		return fm({ nimble: 'handout', title: titleOf(name) }) + `
> [!quote] What it says
> The text, letter or clue exactly as we got it.

## Where we got it
-

## What we think it means
-
`;
	}
	return fm({ nimble: 'handout', title: titleOf(name) }) + `
> [!quote] For the players
> The text, letter or clue exactly as the heroes see it.

## GM notes
- When and how they get it
`;
}
