// ```nimble-encounter blocks: one fence for every game system. The note's
// campaign picks the system, which draws the block by its own rules (Nimble's
// budget and tracker, 5e's XP and initiative tracker). Campaigns are indexed
// after Obsidian's layout is ready, so a block drawn earlier redraws itself
// once its campaign (and with it its system) is known.

import { Component, MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import type NimbleStatblocksPlugin from '../../main';
import { parseEncounterBlock } from '../core/encounter-def';

class EncounterBlockHost extends MarkdownRenderChild {
	private inner: Component | null = null;
	private drawnFor = '';

	constructor(private plugin: NimbleStatblocksPlugin, el: HTMLElement, private source: string, private ctx: MarkdownPostProcessorContext) {
		super(el);
	}

	onload(): void {
		this.draw();
		this.registerEvent(this.plugin.campaigns.on('changed', () => {
			if (this.plugin.system(this.ctx.sourcePath).id !== this.drawnFor) this.draw();
		}));
	}

	private draw(): void {
		if (this.inner) this.removeChild(this.inner);
		this.containerEl.empty();
		const inner = new Component();
		this.inner = this.addChild(inner);
		const system = this.plugin.system(this.ctx.sourcePath);
		this.drawnFor = system.id;
		// The system's block lives in `inner`, so a redraw unloads it (and its listeners) first.
		const ctx: MarkdownPostProcessorContext = Object.assign(Object.create(this.ctx) as MarkdownPostProcessorContext, { addChild: (c: Component) => { inner.addChild(c); } });
		if (system.encounterBlock) system.encounterBlock(this.plugin, parseEncounterBlock(this.source), this.containerEl, ctx, this.source);
		else this.containerEl.createDiv({ cls: 'nimble-encounter-block', text: `${system.name} campaigns don't have encounter blocks yet.` });
	}
}

export function registerEncounterBlocks(plugin: NimbleStatblocksPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('nimble-encounter', (source, el, ctx) => {
		ctx.addChild(new EncounterBlockHost(plugin, el, source, ctx));
	});
}
