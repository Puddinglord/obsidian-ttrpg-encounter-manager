// Your own art for compendium entries: a picture or GIF for "Fireball" shows
// on its page (like a character portrait) and as its icon in the lists.
// Images live in an ordinary vault folder (settings: compendiumArtFolder) so
// they sync like any note and survive plugin updates; which image belongs to
// which entry is kept in settings (compendiumArt), and follows renames.
// Always shown cropped to fill a rounded square.

import { FuzzySuggestModal, Menu, normalizePath, Notice, setIcon, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { safeName } from '../../core/campaign-model';

const IMAGE = /^(png|jpe?g|gif|webp|avif|svg|bmp)$/i;

/** The image file set for an entry key, if it still exists. */
export function artFile(plugin: EmberVaultPlugin, key: string): TFile | null {
	const path = plugin.settings.compendiumArt[key];
	if (!path) return null;
	const f = plugin.app.vault.getAbstractFileByPath(path);
	return f instanceof TFile ? f : null;
}

/** A URL the img tag can load, or null. */
export function artSrc(plugin: EmberVaultPlugin, key: string): string | null {
	const f = artFile(plugin, key);
	return f ? plugin.app.vault.getResourcePath(f) : null;
}

async function setArt(plugin: EmberVaultPlugin, key: string, path: string | null): Promise<void> {
	if (path) plugin.settings.compendiumArt[key] = path;
	else delete plugin.settings.compendiumArt[key];
	await plugin.saveSettings();
	plugin.events.trigger('compendium-art-changed', key);
}

/** Save picked or dropped bytes into the art folder (a free name), then use them. */
async function saveUpload(plugin: EmberVaultPlugin, key: string, title: string, file: File): Promise<void> {
	const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? file.type.split('/')[1] ?? 'png').toLowerCase();
	if (!IMAGE.test(ext)) { new Notice('That isn\'t an image Obsidian can show.'); return; }
	const folder = normalizePath(plugin.settings.compendiumArtFolder || 'Ember Vault/Compendium Art');
	const vault = plugin.app.vault;
	// Make each missing folder on the way down.
	let at = '';
	for (const part of folder.split('/')) {
		at = at ? `${at}/${part}` : part;
		if (!vault.getAbstractFileByPath(at)) await vault.createFolder(at).catch(() => undefined);
	}
	const base = safeName(title) || 'Art';
	let path = normalizePath(`${folder}/${base}.${ext}`);
	for (let n = 2; vault.getAbstractFileByPath(path); n++) path = normalizePath(`${folder}/${base} ${n}.${ext}`);
	await vault.createBinary(path, await file.arrayBuffer());
	await setArt(plugin, key, path);
	new Notice(`Saved art for ${title}`);
}

function upload(plugin: EmberVaultPlugin, key: string, title: string): void {
	const input = activeDocument.body.createEl('input', { type: 'file', attr: { accept: 'image/*' } });
	input.hide();
	input.addEventListener('change', () => {
		const f = input.files?.[0];
		input.remove();
		if (f) void saveUpload(plugin, key, title, f);
	});
	input.click();
}

class ImagePicker extends FuzzySuggestModal<TFile> {
	constructor(private plugin: EmberVaultPlugin, private onPick: (f: TFile) => void) {
		super(plugin.app);
		this.setPlaceholder('Pick an image from your vault');
	}
	getItems(): TFile[] { return this.app.vault.getFiles().filter(f => IMAGE.test(f.extension)); }
	getItemText(f: TFile): string { return f.path; }
	onChooseItem(f: TFile): void { this.onPick(f); }
}

/** The menu behind the portrait: upload, pick from the vault, remove. */
export function artMenu(plugin: EmberVaultPlugin, key: string, title: string, ev: MouseEvent): void {
	const m = new Menu();
	m.addItem(i => i.setTitle('Upload from this device…').setIcon('upload').onClick(() => upload(plugin, key, title)));
	m.addItem(i => i.setTitle('Choose from vault…').setIcon('image').onClick(() => new ImagePicker(plugin, (f) => void setArt(plugin, key, f.path)).open()));
	if (plugin.settings.compendiumArt[key]) {
		m.addSeparator();
		m.addItem(i => i.setTitle('Remove art').setIcon('image-off').onClick(() => void setArt(plugin, key, null)));
	}
	m.showAtMouseEvent(ev);
}

/**
 * The portrait slot in an entry's header: its art, or a faint "add art" tile.
 * Click for the menu; drop an image on it to use that.
 */
export function renderArtSlot(plugin: EmberVaultPlugin, header: HTMLElement, key: string, title: string): void {
	header.addClass('has-art-slot');
	// The title lines go in one column, centred beside the square.
	let titles = header.querySelector<HTMLElement>(':scope > .nimble-art-titles');
	if (!titles) {
		titles = createDiv({ cls: 'nimble-art-titles' });
		while (header.firstChild) titles.appendChild(header.firstChild);
		header.appendChild(titles);
	}
	const src = artSrc(plugin, key);
	const slot = header.createDiv({ cls: `nimble-art-slot${src ? ' has-art' : ''}`, attr: { role: 'button', tabindex: '0', 'aria-label': src ? `Change the art for ${title}` : `Add art for ${title}` } });
	if (src) slot.createEl('img', { attr: { src, alt: '' } });
	else setIcon(slot.createSpan({ cls: 'nimble-art-add' }), 'image-plus');
	const edit = slot.createSpan({ cls: 'nimble-art-edit' });
	setIcon(edit, 'pencil');
	slot.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); artMenu(plugin, key, title, ev); });
	slot.addEventListener('keydown', (ev) => {
		if (ev.key !== 'Enter' && ev.key !== ' ') return;
		ev.preventDefault();
		const r = slot.getBoundingClientRect();
		artMenu(plugin, key, title, new MouseEvent('click', { clientX: r.left, clientY: r.bottom }));
	});
	slot.addEventListener('dragover', (ev) => { if (ev.dataTransfer?.types.includes('Files')) { ev.preventDefault(); slot.addClass('is-drop'); } });
	slot.addEventListener('dragleave', () => slot.removeClass('is-drop'));
	slot.addEventListener('drop', (ev) => {
		slot.removeClass('is-drop');
		const f = ev.dataTransfer?.files?.[0];
		if (!f) return;
		ev.preventDefault();
		void saveUpload(plugin, key, title, f);
	});
}

/** Put the art (if any) in a list badge, cropped to its rounded square. True when it did. */
export function renderBadgeArt(plugin: EmberVaultPlugin, badge: HTMLElement, key: string): boolean {
	const src = artSrc(plugin, key);
	if (!src) return false;
	badge.addClass('has-art');
	badge.createEl('img', { cls: 'nimble-art-img', attr: { src, alt: '', loading: 'lazy' } });
	return true;
}

/** Keep the paths right when images are renamed, moved or deleted. */
export function watchArt(plugin: EmberVaultPlugin): void {
	plugin.registerEvent(plugin.app.vault.on('rename', (f, oldPath) => {
		const art = plugin.settings.compendiumArt;
		let changed = false;
		for (const [k, p] of Object.entries(art)) if (p === oldPath) { art[k] = f.path; changed = true; }
		if (changed) void plugin.saveSettings();
	}));
	plugin.registerEvent(plugin.app.vault.on('delete', (f) => {
		const art = plugin.settings.compendiumArt;
		let changed = false;
		for (const [k, p] of Object.entries(art)) if (p === f.path) { delete art[k]; changed = true; }
		if (changed) { void plugin.saveSettings(); plugin.events.trigger('compendium-art-changed'); }
	}));
}
