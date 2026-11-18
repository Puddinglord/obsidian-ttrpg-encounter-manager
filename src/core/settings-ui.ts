// The settings page's building blocks, for core and each game system's own
// sections (the contract's `settingsSections`). app/settings-tab.ts draws them
// into Obsidian's settings search (1.13+) or the classic page.

import { Modal, Setting } from 'obsidian';
import type EmberVaultPlugin from '../../main';

/** One settings row. `block` rows draw their own content instead of a name and controls. */
export interface SettingsRow {
	name: string;
	desc?: string;
	visible?: () => boolean;
	searchable?: boolean;
	cls?: string;
	render?: (setting: Setting) => void;
	block?: (el: HTMLElement) => void;
}

export interface SettingsSection {
	heading?: string;
	cls?: string;
	/** What it's about, so a game's tracker can show just its encounter settings ("encounter"). */
	topic?: 'encounter';
	rows: SettingsRow[];
}

/** A toggle that saves, then runs `after` (redraw notes, reload something). */
export function settingToggle(plugin: EmberVaultPlugin, get: () => boolean, set: (v: boolean) => void, after?: () => void): (setting: Setting) => void {
	return (setting) => {
		setting.addToggle(t => t.setValue(get()).onChange(async (v) => { set(v); await plugin.saveSettings(); after?.(); }));
	};
}

/** A game's licence line and where to buy it; the store's name in the notice becomes the link. */
export function renderAttribution(el: HTMLElement, a: { text: string; supportNotice: string; storeUrl: string; storeLabel: string }): void {
	const notice = el.createDiv({ cls: 'nimble-notice' });
	notice.createDiv({ text: a.text });
	const support = notice.createDiv();
	const link = () => support.createEl('a', { text: a.storeLabel, href: a.storeUrl, cls: 'external-link', attr: { target: '_blank', rel: 'noopener' } });
	const at = a.supportNotice.indexOf(a.storeLabel);
	if (at >= 0) {
		support.appendText(a.supportNotice.slice(0, at));
		link();
		support.appendText(a.supportNotice.slice(at + a.storeLabel.length));
	} else {
		support.appendText(`${a.supportNotice} `);
		link();
	}
}

/** Sections drawn the classic way, into any element (the settings page before Obsidian 1.13, and dialogs). */
export function drawSections(el: HTMLElement, sections: SettingsSection[]): void {
	for (const section of sections) {
		if (section.heading) new Setting(el).setName(section.heading).setHeading();
		const parent = section.cls ? el.createDiv({ cls: section.cls }) : el;
		for (const row of section.rows) {
			if (row.visible && !row.visible()) continue;
			if (row.block) { row.block(parent); continue; }
			const setting = new Setting(parent);
			if (row.name) setting.setName(row.name);
			if (row.desc) setting.setDesc(row.desc);
			if (row.cls) setting.setClass(row.cls);
			row.render?.(setting);
		}
	}
}

/**
 * The note's game's own settings (its `settingsSections`) in a dialog, where you're using
 * them: the tracker's Encounter settings… shows its "encounter" sections. Every game gets
 * this the same way; the base plugin's settings stay on the settings page.
 */
export function openGameSettings(plugin: EmberVaultPlugin, path: string | undefined, topic?: SettingsSection['topic']): Modal {
	const system = plugin.system(path);
	const sections = (system.settingsSections?.(plugin) ?? []).filter(sec => !topic || sec.topic === topic);
	const title = topic === 'encounter' ? `${system.name} encounter settings` : `${system.name} settings`;
	const m = new SettingsModal(plugin, title, sections);
	m.open();
	return m;
}

class SettingsModal extends Modal {
	constructor(plugin: EmberVaultPlugin, private heading: string, private sections: SettingsSection[]) {
		super(plugin.app);
	}

	onOpen(): void {
		this.titleEl.setText(this.heading);
		this.modalEl.addClass('ev-settings-modal');
		if (!this.sections.length) this.contentEl.createDiv({ cls: 'setting-item-description', text: 'This game has no settings here.' });
		drawSections(this.contentEl, this.sections);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
