// Writing a 5e character note (a party member typed in by hand becomes one).
// New characters are made in the wizard (character-wizard.ts).

import { normalizePath, stringifyYaml, TFile } from 'obsidian';
import type { Dnd5eRuntime } from './runtime';
import { SHEET_LANG } from './sheet';

/** Write a 5e character note. */
export async function createCharacterNote5e(rt: Dnd5eRuntime, fm: Record<string, unknown>, name: string, folder?: string): Promise<TFile> {
	const app = rt.plugin.app;
	const dir = folder ? normalizePath(folder) : '';
	if (dir && !app.vault.getFolderByPath(dir)) await app.vault.createFolder(dir);
	const safe = name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'New hero';
	const path = rt.plugin.campaigns.available(normalizePath(`${dir ? `${dir}/` : ''}${safe}.md`));
	return app.vault.create(path, `---\n${stringifyYaml(fm)}---\n\n\`\`\`${SHEET_LANG}\n\`\`\`\n\n## Notes\n`);
}
