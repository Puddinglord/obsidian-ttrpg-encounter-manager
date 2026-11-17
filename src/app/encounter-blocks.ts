// ```nimble-encounter blocks: one fence for every game system. The note's
// campaign picks the system, which draws the block by its own rules (Nimble's
// budget and tracker, 5e's XP and initiative tracker).

import type NimbleStatblocksPlugin from '../../main';
import { parseEncounterBlock } from '../core/encounter-def';

export function registerEncounterBlocks(plugin: NimbleStatblocksPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('nimble-encounter', (source, el, ctx) => {
		const system = plugin.system(ctx.sourcePath);
		const def = parseEncounterBlock(source);
		if (system.encounterBlock) system.encounterBlock(plugin, def, el, ctx, source);
		else el.createDiv({ cls: 'nimble-encounter-block', text: `${system.name} campaigns don't have encounter blocks yet.` });
	});
}
