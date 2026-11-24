// The importers every game shares: an Ember Vault bundle as it is, and a
// content pack (saved as a pack file in the content folder, as Import content…
// always did). Format importers for maps and the like join this list.

import type EmberVaultPlugin from '../../../main';
import { packSummary } from '../content/packs';
import { renderPackReport } from '../content/import-modal';
import { BUNDLE_FORMAT, ImportBundle } from './bundle';
import { Importer, inputJson, inputText } from './importer';

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
				render: (el) => renderPackReport(el, pack),
				chosen: () => (pack.error || !pack.entries.length ? 0 : 1),
				async add() {
					const path = await plugin.content.save(text, pack);
					return `Added ${pack.name}: ${packSummary(pack)}. Saved as ${path}.`;
				},
			},
		};
	},
};

export const coreImporters = (): Importer[] => [bundleImporter, packImporter];
