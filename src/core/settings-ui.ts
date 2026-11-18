// The settings page's building blocks, for core and each game system's own
// sections (the contract's `settingsSections`). app/settings-tab.ts draws them
// into Obsidian's settings search (1.13+) or the classic page.

import type { Setting } from 'obsidian';
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

export interface SettingsSection { heading?: string; cls?: string; rows: SettingsRow[] }

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
