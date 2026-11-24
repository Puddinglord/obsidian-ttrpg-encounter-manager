// 5e's import commands: Import a D&D Beyond character… and Import a Fantasy
// Statblocks creature… open Import… (core/import/dialog.ts) for that format.
// The importers themselves are in importers.ts.

import { openImport } from '../../core/import/dialog';
import type { Dnd5eRuntime } from './runtime';

export function registerImports5e(rt: Dnd5eRuntime): void {
	const plugin = rt.plugin;
	plugin.addCommand({ id: 'import-ddb-character', name: 'Import a D&D Beyond character…', icon: 'user-plus', callback: () => openImport(plugin, { prefer: 'ddb-character' }) });
	plugin.addCommand({ id: 'import-fantasy-statblocks', name: 'Import a Fantasy Statblocks creature…', icon: 'skull', callback: () => openImport(plugin, { prefer: 'fantasy-statblocks' }) });
}
