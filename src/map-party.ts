// The party marker on a travel map: the campaign's heroes (up to three
// portraits stacked) or a shield, and on hover or tap, the roster as the same
// hero cards the Campaign panel shows. One marker per map, saved in the block.

import { setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import type { Campaign } from './campaign-model';
import { heroCard } from './campaign-ui';
import { portraitOf, renderAvatar } from './npc-card';

/** The marker's face: up to three portraits, overlapping, or a shield. */
export function renderPartyFace(el: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign | undefined): void {
	el.empty();
	const heroes = c ? plugin.campaigns.characters(c) : [];
	const faces = heroes.map(h => portraitOf(plugin.app, h.path)).filter((p): p is NonNullable<typeof p> => !!p).slice(0, 3);
	const face = el.createDiv({ cls: `nimble-map-party-face${faces.length ? ' has-portraits' : ''}` });
	if (faces.length) faces.forEach((p, i) => renderAvatar(face, p, `nimble-map-party-avatar n${i}`));
	else setIcon(face.createSpan({ cls: 'nimble-map-party-shield' }), 'shield');
	el.setAttr('aria-label', heroes.length ? `The party: ${heroes.map(h => h.name).join(', ')}` : 'The party');
}

/** The roster card shown on hover or tap: a hero card per party member. */
export function renderPartyRoster(el: HTMLElement, plugin: NimbleStatblocksPlugin, c: Campaign | undefined): void {
	el.addClass('nimble-map-party-roster');
	el.createDiv({ cls: 'popover-title', text: c ? `${c.name}: the party` : 'The party' });
	const heroes = c ? plugin.campaigns.characters(c) : [];
	if (!heroes.length) {
		el.createDiv({ cls: 'popover-body', text: c ? 'No heroes yet. Add them in the Campaign panel\'s Party section.' : 'This map isn\'t in a campaign, so it has no party to show.' });
		return;
	}
	const list = el.createDiv({ cls: 'campaign-roster-list' });
	for (const h of heroes) heroCard(list, plugin, { ...h, showHp: h.mine || c?.role !== 'player' });
}
