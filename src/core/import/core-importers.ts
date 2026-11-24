// The importers every game shares: an Ember Vault bundle as it is, a content
// pack (saved as a pack file in the content folder, as Import content… always
// did), and maps from other tools (maps.ts).

import { setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { evIcon, EvIconName } from '../icons';
import { packSummary } from '../content/packs';
import { renderPackReport } from '../content/import-modal';
import { BUNDLE_FORMAT, ImportBundle } from './bundle';
import { Importer, inputJson, inputText } from './importer';
import { mapImporters } from './maps';

const ICON: Record<string, EvIconName> = { monster: 'skull', spell: 'spell', item: 'gem', equipment: 'gem', class: 'book', subclass: 'book', feat: 'medal', background: 'scroll', species: 'user', ancestry: 'user', boon: 'sparkle', rule: 'books', condition: 'condition' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const bundleImporter: Importer = {
	id: 'bundle',
	label: 'Ember Vault bundle',
	detect: (input) => { const j = inputJson(input); return isObj(j) && j.format === BUNDLE_FORMAT ? 1 : 0; },
	read: (input) => {
		const j = inputJson(input);
		return isObj(j) ? { bundle: j as unknown as ImportBundle } : { error: 'This isn\'t JSON.' };
	},
};

export const packImporter: Importer = {
	id: 'content-pack',
	label: 'Content pack',
	detect: (input) => {
		const j = inputJson(input);
		if (!isObj(j) || !Array.isArray(j.entries)) return 0;
		return typeof j.pack === 'string' ? 0.95 : typeof j.system === 'string' ? 0.6 : 0;
	},
	read: (input, ctx) => {
		const plugin = ctx.plugin as EmberVaultPlugin;
		const text = inputText(input) ?? '';
		const fileName = input.files.find(f => f.text !== undefined)?.name ?? 'content.json';
		const pack = plugin.content.check(text, fileName);
		return {
			custom: {
				action: 'Add to vault',
				render: (el) => {
					renderPackReport(el, pack);
					// What it adds, an entry a row, in the frame's list look.
					if (!pack.entries.length) return;
					const kinds = plugin.systems.get(pack.system)?.content?.kinds ?? [];
					const list = el.createDiv({ cls: 'ev-import-written ev-import-pack-list' });
					for (const e of pack.entries) {
						const row = list.createDiv({ cls: 'ev-import-written-row' });
						setIcon(row.createSpan({ cls: 'ev-import-written-icon' }), evIcon(ICON[e.kind] ?? 'note'));
						const t = row.createDiv({ cls: 'ev-import-written-text' });
						t.createDiv({ cls: 'ev-import-written-name', text: e.name });
						t.createDiv({ cls: 'ev-import-written-path', text: kinds.find(k => k.kind === e.kind)?.label ?? e.kind });
					}
				},
				chosen: () => (pack.error || !pack.entries.length ? 0 : 1),
				async add() {
					const path = await plugin.content.save(text, pack);
					return `Added ${pack.name}: ${packSummary(pack)}. Saved as ${path}.`;
				},
			},
		};
	},
};

export const coreImporters = (): Importer[] => [bundleImporter, packImporter, ...mapImporters()];
