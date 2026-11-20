// Making a character's note, and the custom ability dialog. New character and
// Level up are the character wizard (character-wizard.ts).

import { App, Modal, normalizePath, Notice, Setting, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { heroCompendium } from './compendium-data';
import type { Compendium } from './compendium';
import { joinPath, safeName } from '../../core/campaign-model';
import type { Frontmatter } from './character-def';
import { newCharacterFrontmatter, NewHero } from './new-character';

const SHEET_BODY = '```nimble-sheet\n```\n\n## Backstory\n\n\n## Notes\n\n';

/** Where new characters go: the active campaign's Party folder, else the vault root. */
export function defaultCharacterFolder(plugin: EmberVaultPlugin): string {
	const c = plugin.campaigns?.active;
	return c ? normalizePath(`${c.folder}/Party`) : '';
}

/** Write a character note (frontmatter + sheet block + Backstory and Notes headings) and return it. */
export async function createCharacterNote(plugin: EmberVaultPlugin, o: NewHero, folder = defaultCharacterFolder(plugin), comp: Compendium = heroCompendium({ path: folder, className: o.className })): Promise<TFile> {
	const app = plugin.app;
	const dir = folder ? normalizePath(folder) : '';
	if (dir && !app.vault.getFolderByPath(dir)) await app.vault.createFolder(dir);
	// Named the way every campaign note is (safeName), and never clashing with a note there, even by case.
	const path = plugin.campaigns.available(`${joinPath(dir, safeName(o.name.trim() || 'New hero'))}.md`);
	const file = await app.vault.create(path, SHEET_BODY);
	const data = newCharacterFrontmatter(o, comp);
	// The file name is the name; only write a title when they differ.
	if (data.title === file.basename) delete data.title;
	await app.fileManager.processFrontMatter(file, (fm: Frontmatter) => { Object.assign(fm, data); });
	return file;
}

// ----------------------------------------------------------------------------

export class CustomFeatureModal extends Modal {
	private name = '';
	private text = '';

	constructor(app: App, private done: (f: { name: string; text?: string }) => void) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText('Custom ability');
		new Setting(this.contentEl).setName('Name').addText(t => {
			t.setPlaceholder('Bear hug').onChange(v => { this.name = v; });
			window.setTimeout(() => t.inputEl.focus(), 0);
		});
		new Setting(this.contentEl).setName('What it does').addTextArea(t => {
			t.setPlaceholder('Rules text').onChange(v => { this.text = v; });
			t.inputEl.rows = 4;
		});
		new Setting(this.contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Add').setCta().onClick(() => {
				if (!this.name.trim()) { new Notice('Give it a name.'); return; }
				this.done({ name: this.name.trim(), text: this.text.trim() || undefined });
				this.close();
			}));
	}

	onClose(): void { this.contentEl.empty(); }
}
