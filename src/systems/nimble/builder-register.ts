// Nimble's builder kinds, and the Edit button on Nimble's blocks.

import type { MarkdownPostProcessorContext } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { addEditButton as coreEditButton } from '../../core/builder/commands';
import type { EntityKind } from './entity-builder';
import { registerMonsterBuilder } from './entity-monster-ui';
import { registerHomebrewBuilders } from './entity-homebrew-ui';

export function registerBuilders(_plugin: EmberVaultPlugin): void {
	registerMonsterBuilder();
	registerHomebrewBuilders();
}

/** Edit a Nimble block in Nimble's builder. */
export function addEditButton(plugin: EmberVaultPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext, o: { kind: EntityKind; lang: string; source: string; seed: unknown; unread?: number }): void {
	coreEditButton(plugin, el, ctx, { system: 'nimble', ...o });
}
