// Nimble's kinds for core's builder (core/builder/frame.ts): the frame and its
// fields are core's; these wrappers register and open Nimble's own kinds.

import type EmberVaultPlugin from '../../../main';
import {
	BuilderOptions, EntityBuilder, kindAvailable as coreAvailable, KindFactory, openBuilder as coreOpen, registerKind as coreRegister,
} from '../../core/builder/frame';

export * from '../../core/builder/frame';

/** What Nimble's builder makes. */
export type EntityKind = 'monster' | 'spell' | 'item';

const LABEL: Record<EntityKind, { label: string; icon: string }> = {
	monster: { label: 'Monster', icon: 'skull' },
	spell: { label: 'Spell', icon: 'wand-2' },
	item: { label: 'Item', icon: 'backpack' },
};

export function registerKind(kind: EntityKind, f: KindFactory): void {
	coreRegister('nimble', kind, LABEL[kind], f);
}

export function kindAvailable(kind: EntityKind): boolean {
	return coreAvailable('nimble', kind);
}

/** Nimble's builder, wherever it's opened from. */
export function openBuilder(plugin: EmberVaultPlugin, o: BuilderOptions): EntityBuilder | null {
	return coreOpen(plugin, { system: 'nimble', ...o });
}
