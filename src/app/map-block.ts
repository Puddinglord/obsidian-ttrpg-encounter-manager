// ```nimble-map blocks: a GM's map with pins that link to notes (LegendKeeper
// style) and, optionally, the current encounter's combatants as tokens.
// It's a GM companion, not a virtual tabletop: nothing here is shown to players.

import type { CombatToken } from '../core/tracker/tokens';
import { App, FuzzySuggestModal, MarkdownPostProcessorContext, MarkdownRenderChild, Menu, Modal, Notice, Setting, setIcon, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../main';
import { MapDef, mapBlockSource, MapPin, parseMapBlock, PIN_KINDS, PinKind, replaceMapBlock } from '../core/map-def';
import { confirmAction, isTouch, onLongPress } from '../core/touch';
import { setWarningButton } from '../core/compat';
import { closePopover, isPopoverOpenFor, openPopover } from '../core/popover';
import { evIcon, gameIcon } from '../core/icons';
import { applyLook } from '../core/look';
import { pill } from '../core/pill';
import { openLink } from '../core/wiki-links';

const PIN_ICON: Record<PinKind, string> = {
	place: evIcon('map-pin'), area: evIcon('flag'), encounter: evIcon('swords'), npc: evIcon('user'), treasure: evIcon('treasure'), danger: evIcon('skull'), note: evIcon('note'), secret: evIcon('eye-off'),
};

type Mode = 'view' | 'add' | 'move';

export function registerMapBlock(plugin: EmberVaultPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('nimble-map', (source, el, ctx) => {
		ctx.addChild(new MapBlock(plugin, el, source, ctx));
	});
}

class MapBlock extends MarkdownRenderChild {
	private scale = 1;
	private tx = 0;
	private ty = 0;
	private mode: Mode = 'view';
	private showTokens = false;
	private showLabels = true;
	private stage!: HTMLElement;
	private viewport!: HTMLElement;
	private img!: HTMLImageElement;
	private pinLayer!: HTMLElement;
	private tokenLayer!: HTMLElement;
	private tray!: HTMLElement;
	private fitted = false;
	private sized = false;
	/** After a double-tap zoom, the synthesized click can land on a pin that moved under the finger. */
	private quietUntil = 0;

	private def: MapDef;
	/** Add/Move controls were drawn (the block can be written back). */
	private editable = false;

	/** `source` is the block as it is in the note: what a save looks for, and what a failed save goes back to. */
	constructor(private plugin: EmberVaultPlugin, el: HTMLElement, private source: string, private ctx: MarkdownPostProcessorContext) {
		super(el);
		this.def = parseMapBlock(source);
	}

	/** Embeds and hover previews don't get section info, so pins can't be saved from there. */
	private canSave(): boolean { return !!this.ctx.getSectionInfo(this.containerEl); }

	private get app(): App { return this.plugin.app; }
	private get mapKey(): string { return `${this.ctx.sourcePath}::${this.def.image}`; }

	onload(): void {
		this.build();
		// Section info can arrive just after the first render.
		if (!this.editable) {
			const t = window.setTimeout(() => { if (!this.editable && this.canSave()) this.build(); }, 400);
			this.register(() => window.clearTimeout(t));
		}
		// Any game's fight: tokens follow it.
		this.registerEvent(this.plugin.events.on('combat-changed', () => { if (this.showTokens) this.renderTokens(); }));
	}

	// ------------------------------------------------------------------------

	private build(): void {
		const root = this.containerEl;
		root.empty();
		root.addClass('nimble-map');
		// In the look of the campaign's game: its paper, its colour on pins and tokens, its type in the tray.
		applyLook(root, this.plugin.system(this.ctx.sourcePath).id);

		const src = this.resolveImage();
		if (!src) {
			const err = root.createDiv({ cls: 'nimble-error' });
			err.createEl('strong', { text: 'Map image not found. ' });
			err.appendText(this.def.image ? `Couldn't find "${this.def.image}". Put the image in your vault and use image: [[file name]].` : 'Add a line like image: [[My map.png]] to this block.');
			return;
		}

		const bar = root.createDiv({ cls: 'nimble-map-toolbar' });
		const modeBtn = (mode: Mode, icon: string, label: string) => {
			const b = pill(bar, { tag: 'button', icon: gameIcon(icon), text: label, cls: `nimble-map-btn${this.mode === mode ? ' is-active' : ''}`, attr: { 'aria-label': label, 'aria-pressed': String(this.mode === mode) } });
			b.onclick = () => { this.mode = this.mode === mode ? 'view' : mode; this.build(); };
		};
		this.editable = this.canSave();
		if (!this.editable) this.mode = 'view';
		if (this.editable) {
			modeBtn('add', 'map-pin', 'Add pin');
			modeBtn('move', 'move', 'Move pins');
		}
		// Tokens come from the GM's tracker, so a map in a campaign you play in doesn't offer them.
		if (this.plugin.playerView(this.ctx.sourcePath)) this.showTokens = false;
		else {
			const tokens = pill(bar, { tag: 'button', icon: evIcon('swords'), text: 'Encounter tokens', cls: `nimble-map-btn${this.showTokens ? ' is-active' : ''}`, attr: { 'aria-label': 'Show the current encounter as tokens', 'aria-pressed': String(this.showTokens) } });
			tokens.onclick = () => { this.showTokens = !this.showTokens; this.build(); };
		}
		const labels = pill(bar, { tag: 'button', icon: evIcon('tag'), cls: `nimble-map-btn${this.showLabels ? ' is-active' : ''}`, attr: { 'aria-label': 'Show pin labels', 'aria-pressed': String(this.showLabels) } });
		labels.onclick = () => { this.showLabels = !this.showLabels; this.root?.toggleClass('hide-labels', !this.showLabels); labels.toggleClass('is-active', this.showLabels); labels.setAttr('aria-pressed', String(this.showLabels)); };
		// Zoom out, in and Fit at the right, wrapping together so none is left alone on a line.
		const zooms = bar.createDiv({ cls: 'nimble-map-zooms' });
		const zoom = (icon: string, label: string, fn: () => void) => {
			const b = zooms.createEl('button', { cls: 'clickable-icon nimble-map-zoom', attr: { 'aria-label': label } });
			setIcon(b, gameIcon(icon));
			b.onclick = fn;
		};
		zoom('zoom-out', 'Zoom out', () => this.zoomAt(1 / 1.3));
		zoom('zoom-in', 'Zoom in', () => this.zoomAt(1.3));
		zoom('maximize', 'Fit map', () => this.fit());

		if (this.mode !== 'view') {
			root.createDiv({ cls: 'nimble-map-hint', text: this.mode === 'add' ? 'Click to drop a pin' : 'Drag pins to move them' });
		}

		const body = root.createDiv({ cls: 'nimble-map-body' });
		this.viewport = body.createDiv({ cls: `nimble-map-viewport mode-${this.mode}` });
		this.viewport.tabIndex = 0;
		this.stage = this.viewport.createDiv({ cls: 'nimble-map-stage' });
		this.img = this.stage.createEl('img', { attr: { src, alt: this.def.image, draggable: 'false' } });
		if (this.def.grid) {
			const grid = this.stage.createDiv({ cls: 'nimble-map-grid' });
			grid.style.backgroundSize = `${100 / this.def.grid.cols}% ${100 / this.def.grid.rows}%`;
		}
		this.pinLayer = this.stage.createDiv({ cls: 'nimble-map-layer' });
		this.tokenLayer = this.stage.createDiv({ cls: 'nimble-map-layer nimble-map-tokens' });
		this.tray = body.createDiv({ cls: 'nimble-map-tray' });
		this.root?.toggleClass('hide-labels', !this.showLabels);

		this.img.onload = () => { if (!this.fitted) this.fit(); else this.apply(); };
		if (this.img.complete && this.img.naturalWidth) this.fit();
		// Maps in collapsed callouts, hidden tabs or a rotating phone get their size late.
		const ro = new ResizeObserver(() => { if (!this.fitted) this.fit(); else this.placeLabels(); });
		ro.observe(this.viewport);
		this.register(() => ro.disconnect());
		// Labels are measured in the game's display type, which may still be loading.
		void this.viewport.doc.fonts?.ready.then(() => this.placeLabels());
		this.wirePanZoom();
		this.renderPins();
		this.renderTokens();
	}

	private get root(): HTMLElement | null { return this.containerEl; }

	private resolveImage(): string | null {
		const img = this.def.image;
		if (!img) return null;
		if (/^https?:\/\//i.test(img)) return img;
		const file = this.app.metadataCache.getFirstLinkpathDest(img, this.ctx.sourcePath);
		return file ? this.app.vault.getResourcePath(file) : null;
	}

	// ------------------------------------------------------------------------
	// Pan & zoom

	private apply(): void {
		this.stage.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
		this.root?.toggleClass('is-zoomed-out', this.scale * (this.img?.naturalWidth || 0) < 1600);
		// Pins and tokens keep a constant on-screen size.
		this.stage.style.setProperty('--nimble-map-inv', String(1 / this.scale));
		this.placeLabels();
	}

	/**
	 * Keep every pin's label on the map: moved in from a side it would run past, under its pin when
	 * the top edge would cut it, and hidden while its pin is out of view.
	 */
	private placeLabels(): void {
		const vw = this.viewport?.clientWidth, vh = this.viewport?.clientHeight;
		const iw = this.img?.naturalWidth, ih = this.img?.naturalHeight;
		if (!vw || !vh || !iw || !ih || !this.pinLayer) return;
		const M = 4;
		const pins = Array.from(this.pinLayer.children).filter((n): n is HTMLElement => n.instanceOf(HTMLElement));
		// Every size first, then every change, so a pan lays the map out once rather than once per pin.
		const sizes = pins.map(el => {
			const lab = el.querySelector<HTMLElement>('.nimble-map-pin-label');
			const inner = el.querySelector<HTMLElement>('.nimble-map-pin-inner');
			return { lab, w: lab?.offsetWidth ?? 0, h: lab?.offsetHeight ?? 0, pinH: inner?.offsetHeight ?? 0 };
		});
		pins.forEach((el, i) => {
			const pin = this.def.pins[i], s = sizes[i];
			if (!pin || !s?.lab || !s.w) return;
			const x = this.tx + (pin.x / 100) * iw * this.scale;
			const y = this.ty + (pin.y / 100) * ih * this.scale;
			const left = x - s.w / 2;
			const dx = left < M ? M - left : left + s.w > vw - M ? vw - M - (left + s.w) : 0;
			s.lab.toggleClass('is-off', x < 0 || x > vw || y < 0 || y - s.pinH > vh);
			s.lab.toggleClass('is-below', y - s.pinH - 3 - s.h < M);
			s.lab.style.setProperty('--label-dx', `${Math.round(dx)}px`);
		});
	}

	private fit(): void {
		const vw = this.viewport.clientWidth;
		const vh = this.viewport.clientHeight;
		const iw = this.img.naturalWidth;
		const ih = this.img.naturalHeight;
		if (!vw || !vh || !iw) return;
		// Tall maps get a taller viewport (once, on desktop) instead of a thumbnail in a letterbox.
		if (!this.sized && !this.viewport.doc.body.hasClass('is-phone') && ih > 0) {
			this.sized = true;
			const want = Math.round(Math.max(360, Math.min(window.innerHeight * 0.8, vw * (ih / iw))));
			if (Math.abs(want - vh) > 40) { this.viewport.style.height = `${want}px`; this.fit(); return; }
		}
		this.stage.style.width = `${iw}px`;
		this.stage.style.height = `${ih}px`;
		this.scale = Math.min(vw / iw, vh / ih);
		this.tx = (vw - iw * this.scale) / 2;
		this.ty = (vh - ih * this.scale) / 2;
		this.fitted = true;
		this.apply();
	}

	private zoomAt(f: number, cx = this.viewport.clientWidth / 2, cy = this.viewport.clientHeight / 2): void {
		const next = Math.max(0.05, Math.min(8, this.scale * f));
		const k = next / this.scale;
		this.tx = cx - (cx - this.tx) * k;
		this.ty = cy - (cy - this.ty) * k;
		this.scale = next;
		this.apply();
	}

	/** Viewport pixel → percent of the image. */
	private toPercent(clientX: number, clientY: number): { x: number; y: number } {
		const r = this.viewport.getBoundingClientRect();
		const ix = (clientX - r.left - this.tx) / this.scale;
		const iy = (clientY - r.top - this.ty) / this.scale;
		return { x: Math.max(0, Math.min(100, (ix / this.img.naturalWidth) * 100)), y: Math.max(0, Math.min(100, (iy / this.img.naturalHeight) * 100)) };
	}

	private wirePanZoom(): void {
		const vp = this.viewport;
		this.registerDomEvent(vp, 'wheel', (e: WheelEvent) => {
			e.preventDefault();
			const r = vp.getBoundingClientRect();
			this.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
		}, { passive: false });

		// One finger (or a mouse) pans; two fingers pinch-zoom and pan together.
		const pts = new Map<number, { x: number; y: number }>();
		let pan: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;
		let pinch: { dist: number; ix: number; iy: number; scale: number } | null = null;
		let lastTap = { t: 0, x: 0, y: 0 };
		const local = (e: { clientX: number; clientY: number }) => { const r = vp.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
		const two = () => [...pts.values()].slice(0, 2);

		this.registerDomEvent(vp, 'pointerdown', (e: PointerEvent) => {
			// Pins in view mode don't stop this, so a pan or pinch can start on a pin (they're
			// dense on a phone). Capture waits for real movement so a still tap still clicks the pin.
			if (e.button !== 0) return;
			pts.set(e.pointerId, local(e));
			if (pts.size === 1) {
				pan = { ...local(e), tx: this.tx, ty: this.ty, moved: false };
			} else if (pts.size === 2) {
				const [a, b] = two();
				const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, ix: (mid.x - this.tx) / this.scale, iy: (mid.y - this.ty) / this.scale, scale: this.scale };
				pan = null;
				for (const id of pts.keys()) { try { vp.setPointerCapture(id); } catch { /* already lifted */ } }
			}
		});
		this.registerDomEvent(vp, 'pointermove', (e: PointerEvent) => {
			if (!pts.has(e.pointerId)) return;
			pts.set(e.pointerId, local(e));
			if (pinch && pts.size >= 2) {
				const [a, b] = two();
				const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				this.scale = Math.max(0.05, Math.min(8, pinch.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist)));
				this.tx = mid.x - pinch.ix * this.scale;
				this.ty = mid.y - pinch.iy * this.scale;
				this.apply();
			} else if (pan) {
				const p = local(e);
				const dx = p.x - pan.x;
				const dy = p.y - pan.y;
				if (!pan.moved && Math.abs(dx) + Math.abs(dy) > 4) {
					pan.moved = true;
					try { vp.setPointerCapture(e.pointerId); } catch { /* already lifted */ }
				}
				if (pan.moved) { this.tx = pan.tx + dx; this.ty = pan.ty + dy; this.apply(); }
			}
		});
		const end = (e: PointerEvent) => {
			if (!pts.has(e.pointerId)) return;
			pts.delete(e.pointerId);
			if (pinch) {
				if (pts.size < 2) pinch = null;
				pan = null; // don't jump when one finger lifts
				return;
			}
			if (!pan) return;
			const wasTap = !pan.moved;
			pan = null;
			if (!wasTap || e.type === 'pointercancel') return;
			if ((e.target as HTMLElement).closest('.nimble-map-pin, .nimble-map-token')) return;
			if (this.mode === 'add') {
				const pos = this.toPercent(e.clientX, e.clientY);
				new PinModal(this.app, { ...pos, label: '', kind: 'place' }, (pin) => { this.def.pins.push(pin); void this.save(); }).open();
				return;
			}
			// Double-tap to zoom in (touch doesn't always fire dblclick).
			if (e.pointerType !== 'mouse') {
				const now = Date.now();
				if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
					const p = local(e);
					this.zoomAt(1.8, p.x, p.y);
					this.quietUntil = Date.now() + 450;
					lastTap = { t: 0, x: 0, y: 0 };
				} else lastTap = { t: now, x: e.clientX, y: e.clientY };
			}
		};
		this.registerDomEvent(vp, 'pointerup', end);
		this.registerDomEvent(vp, 'pointercancel', end);
		this.registerDomEvent(vp, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape' && this.mode !== 'view') { this.mode = 'view'; this.build(); }
			else if (e.key === '+' || e.key === '=') this.zoomAt(1.3);
			else if (e.key === '-') this.zoomAt(1 / 1.3);
			else if (e.key === '0') this.fit();
		});
		this.registerDomEvent(vp, 'dblclick', (e: MouseEvent) => {
			if ((e.target as HTMLElement).closest('.nimble-map-pin, .nimble-map-token')) return;
			const p = local(e);
			this.zoomAt(1.6, p.x, p.y);
		});
	}

	// ------------------------------------------------------------------------
	// Pins

	private renderPins(): void {
		this.pinLayer.empty();
		this.def.pins.forEach((pin, i) => {
			const el = this.pinLayer.createDiv({ cls: `nimble-map-pin kind-${pin.kind}`, attr: { role: 'button', tabindex: '0', 'aria-label': pin.label } });
			el.style.left = `${pin.x}%`;
			el.style.top = `${pin.y}%`;
			const inner = el.createDiv({ cls: 'nimble-map-pin-inner' });
			setIcon(inner.createDiv({ cls: 'nimble-map-pin-icon' }), PIN_ICON[pin.kind]);
			// Zoomed out, labels shrink to their key ("N5") so a busy map stays readable.
			const lab = inner.createDiv({ cls: 'nimble-map-pin-label' });
			const key = /^([A-Za-z]{0,2}\d+[a-z]?)(?=[\s.:)\-–]|$)/.exec(pin.label.trim())?.[1];
			lab.createSpan({ cls: 'pin-label-full', text: pin.label });
			if (key) { lab.createSpan({ cls: 'pin-label-short', text: key }); el.addClass('has-key'); }
			if (!pin.link) el.addClass('is-unlinked');
			// A zoomed-out label grows from its key to its name under the pointer: keep it on the map.
			if (key) for (const ev of ['mouseenter', 'mouseleave', 'focus', 'blur']) el.addEventListener(ev, () => window.requestAnimationFrame(() => this.placeLabels()));

			el.addEventListener('mouseover', (event) => {
				if (!pin.link || this.mode === 'move') return;
				this.app.workspace.trigger('hover-link', { event, source: 'nimble-gm', hoverParent: this, targetEl: el, linktext: pin.link, sourcePath: this.ctx.sourcePath });
			});
			el.addEventListener('click', (e) => {
				if (this.mode === 'move' || el.dataset.dragged || Date.now() < this.quietUntil) { delete el.dataset.dragged; return; }
				e.preventDefault();
				e.stopPropagation();
				// Touch has no hover preview, so a tap shows the pin's card first.
				if (isTouch()) this.pinCard(el, i);
				else if (pin.link) this.openPin(pin.link, e.metaKey || e.ctrlKey);
				else this.editPin(i);
			});
			el.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' && pin.link) this.openPin(pin.link, e.metaKey || e.ctrlKey);
				else if (e.key === 'Enter' || e.key === 'F2') this.editPin(i);
			});
			onLongPress(el, (e) => {
				if (this.mode === 'move') return;
				const menu = new Menu();
				if (pin.link) {
					menu.addItem(it => it.setTitle('Quick look').setIcon('eye').onClick(() => this.openPin(pin.link!)));
					menu.addItem(it => it.setTitle('Open note').setIcon('file-symlink').onClick(() => openLink(this.app, pin.link!, this.ctx.sourcePath, false)));
				}
				if (this.canSave()) {
					menu.addItem(it => it.setTitle('Edit pin…').setIcon('pencil').onClick(() => this.editPin(i)));
					menu.addItem(it => it.setTitle('Delete pin').setIcon('trash-2').onClick(() => { this.def.pins.splice(i, 1); void this.save(); }));
				} else if (!pin.link) return;
				menu.showAtMouseEvent(e);
			});
			this.draggable(el, (x, y) => { pin.x = x; pin.y = y; void this.save(); }, () => this.mode === 'move');
		});
		if (this.fitted) this.placeLabels();
	}

	/**
	 * A pin's note, without leaving the map: a quick look over it (the campaign's game
	 * draws NPCs, monsters and places its own way). Only what a quick look can't show
	 * (an image, a PDF, a link to nothing) opens as a page, and so does Cmd/Ctrl-click.
	 */
	private openPin(link: string, newTab = false): void {
		const file = this.app.metadataCache.getFirstLinkpathDest(link.split('#')[0].split('|')[0].trim(), this.ctx.sourcePath);
		if (!newTab && file && file.extension === 'md') {
			this.plugin.system(file.path).quickLook(this.plugin, { kind: 'note', file, sourcePath: this.ctx.sourcePath });
			return;
		}
		// A link to nothing (a renamed note the pin wasn't told about) says so; it never makes an empty note.
		openLink(this.app, link, this.ctx.sourcePath, newTab);
	}

	/** Touch: a small card for a pin (quick look, open, edit, delete) instead of a hover preview. */
	private pinCard(el: HTMLElement, i: number): void {
		const pin = this.def.pins[i];
		if (isPopoverOpenFor(el)) { closePopover(); return; }
		openPopover(el, (pop, close) => {
			pop.addClass('nimble-pin-card');
			pop.createDiv({ cls: 'popover-title', text: pin.label });
			if (pin.link) pop.createDiv({ cls: 'popover-body', text: pin.link.replace('#', ' › ') });
			const row = pop.createDiv({ cls: 'pin-card-actions' });
			if (pin.link) {
				const look = row.createEl('button', { cls: 'mod-cta', text: 'Quick look' });
				look.onclick = () => { close(); this.openPin(pin.link!); };
				const open = row.createEl('button', { text: 'Open note' });
				open.onclick = () => { close(); openLink(this.app, pin.link!, this.ctx.sourcePath, false); };
			}
			if (!this.canSave()) return;
			const edit = row.createEl('button', { text: 'Edit' });
			edit.onclick = () => { close(); this.editPin(i); };
			const del = row.createEl('button', { cls: 'mod-warning', text: 'Delete' });
			del.onclick = async () => {
				close();
				if (await confirmAction(this.app, `Delete "${pin.label}"?`, 'The pin is removed from this map block.', 'Delete', true)) { this.def.pins.splice(i, 1); void this.save(); }
			};
		}, { width: 260 });
	}

	private editPin(i: number): void {
		const pin = this.def.pins[i];
		if (!pin || !this.canSave()) return;
		new PinModal(this.app, { ...pin }, (next) => { this.def.pins[i] = next; void this.save(); }, () => { this.def.pins.splice(i, 1); void this.save(); }).open();
	}

	/** Drag an element across the stage; `onDrop` gets percent coordinates. */
	private draggable(el: HTMLElement, onDrop: (x: number, y: number) => void, enabled: () => boolean): void {
		let start: { x: number; y: number } | null = null;
		let moved = false;
		el.addEventListener('pointerdown', (e) => {
			if (!enabled() || e.button !== 0) return;
			e.stopPropagation();
			start = { x: e.clientX, y: e.clientY };
			moved = false;
			el.setPointerCapture(e.pointerId);
			el.addClass('is-dragging');
		});
		el.addEventListener('pointermove', (e) => {
			if (!start) return;
			if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 3) moved = true;
			if (!moved) return;
			const p = this.toPercent(e.clientX, e.clientY);
			el.style.left = `${p.x}%`;
			el.style.top = `${p.y}%`;
		});
		el.addEventListener('pointerup', (e) => {
			if (!start) return;
			start = null;
			el.removeClass('is-dragging');
			if (moved) {
				el.dataset.dragged = '1';
				const p = this.toPercent(e.clientX, e.clientY);
				onDrop(p.x, p.y);
			}
		});
	}

	/** Write the pins back into the note's code block. */
	private async save(): Promise<void> {
		this.renderPins();
		const info = this.ctx.getSectionInfo(this.containerEl);
		const file = this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
		const next = mapBlockSource(this.def);
		let ok = false;
		if (info && file instanceof TFile) {
			try {
				await this.app.vault.process(file, (text) => {
					// In a callout or a list the section is the whole callout or list: only
					// this block's own lines are replaced, and only if its fence is still there.
					const out = replaceMapBlock(text, info.lineStart, info.lineEnd, this.source, next);
					if (out === null) return text;
					ok = true;
					this.source = next;
					return out;
				});
			} catch (e) {
				console.error('Ember Vault: map save failed', e);
			}
		}
		if (ok) return;
		new Notice('Could not save the map: block not found in the note.');
		// Back to what the note says, so no pin is left on screen that was never saved.
		this.def = parseMapBlock(this.source);
		this.renderPins();
	}

	// ------------------------------------------------------------------------
	// Encounter tokens (positions live in plugin data, not the note)

	private tokenPositions(): Record<string, { x: number; y: number }> {
		const all = (this.plugin.settings.mapTokens ||= {});
		return (all[this.mapKey] ||= {});
	}

	private renderTokens(): void {
		if (!this.tokenLayer) return;
		this.tokenLayer.empty();
		this.tray.empty();
		this.tray.toggle(this.showTokens);
		if (!this.showTokens) return;
		const fight = this.plugin.system(this.ctx.sourcePath).combatTokens?.(this.plugin);
		if (!fight || !fight.tokens.length) {
			this.tray.createDiv({ cls: 'nimble-map-tray-empty', text: 'No encounter running' });
			return;
		}
		const positions = this.tokenPositions();
		const head = this.tray.createDiv({ cls: 'nimble-map-tray-head' });
		head.createDiv({ cls: 'nimble-map-tray-title', text: fight.name, attr: { title: fight.name } });
		head.createDiv({ cls: 'nimble-map-tray-hint', text: 'Drag onto the map' });
		for (const c of fight.tokens) {
			const pos = positions[c.id];
			if (pos) this.placeToken(c, pos);
			else this.trayToken(c);
		}
	}

	private tokenEl(parent: HTMLElement, c: CombatToken): HTMLElement {
		const el = parent.createDiv({ cls: `nimble-map-token role-${c.role}`, attr: { title: c.title } });
		if (c.done) el.addClass('is-done');
		if (c.down) el.addClass('is-down');
		// Three letters ("YRD", "GW2") take a size down to stay inside the disc.
		el.createSpan({ cls: `nimble-map-token-text${c.text.length > 2 ? ' is-long' : ''}`, text: c.text });
		c.hover?.(el);
		return el;
	}

	private placeToken(c: CombatToken, pos: { x: number; y: number }): void {
		const el = this.tokenEl(this.tokenLayer, c);
		el.style.left = `${pos.x}%`;
		el.style.top = `${pos.y}%`;
		this.draggable(el, (x, y) => this.setTokenPos(c.id, { x, y }), () => true);
		onLongPress(el, (e) => {
			const menu = new Menu();
			menu.addItem(it => it.setTitle('Back to tray').setIcon('undo-2').onClick(() => this.setTokenPos(c.id, null)));
			menu.showAtMouseEvent(e);
		});
		el.addEventListener('click', (e) => {
			if (el.dataset.dragged) { delete el.dataset.dragged; return; }
			if (!isTouch()) return;
			e.stopPropagation();
			openPopover(el, (pop) => {
				pop.createDiv({ cls: 'popover-title', text: c.label });
				pop.createDiv({ cls: 'popover-body', text: c.title });
				const open = pop.createEl('button', { cls: 'mod-cta', text: 'Show tracker' });
				open.onclick = () => { closePopover(); void this.plugin.openTracker(); };
			}, { width: 240 });
		});
	}

	private trayToken(c: CombatToken): void {
		const el = this.tokenEl(this.tray, c);
		el.addClass('in-tray');
		el.createSpan({ cls: 'nimble-map-token-name', text: c.label });
		// Drag from the tray onto the map.
		el.addEventListener('pointerdown', (e) => {
			if (e.button !== 0) return;
			e.preventDefault();
			const doc = el.doc;
			const win = doc.defaultView ?? window;
			const ghost = doc.body.createDiv({ cls: 'nimble-map-token-ghost', text: c.label });
			// Keep the drag ours on touch, where the browser would otherwise scroll and cancel it.
			try { el.setPointerCapture(e.pointerId); } catch { /* already lifted */ }
			const move = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; } };
			const stop = () => {
				doc.removeEventListener('pointermove', move);
				doc.removeEventListener('pointerup', up);
				doc.removeEventListener('pointercancel', cancel);
				win.removeEventListener('blur', stop);
				ghost.remove();
			};
			const cancel = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) stop(); };
			const up = (ev: PointerEvent) => {
				if (ev.pointerId !== e.pointerId) return;
				stop();
				const r = this.viewport.getBoundingClientRect();
				if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
					this.setTokenPos(c.id, this.toPercent(ev.clientX, ev.clientY));
				}
			};
			move(e);
			doc.addEventListener('pointermove', move);
			doc.addEventListener('pointerup', up);
			doc.addEventListener('pointercancel', cancel);
			win.addEventListener('blur', stop);
		});
	}

	private setTokenPos(id: string, pos: { x: number; y: number } | null): void {
		const positions = this.tokenPositions();
		if (pos) positions[id] = pos;
		else delete positions[id];
		void this.plugin.saveSettings();
		this.renderTokens();
	}
}

// ----------------------------------------------------------------------------

class PinModal extends Modal {
	constructor(app: App, private pin: MapPin, private onSave: (pin: MapPin) => void, private onDelete?: () => void) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.onDelete ? 'Edit pin' : 'New pin');
		const c = this.contentEl;
		let labelInput: HTMLInputElement | null = null;
		new Setting(c).setName('Label').addText(t => {
			labelInput = t.inputEl;
			t.setValue(this.pin.label).setPlaceholder('e.g. 3. Kennel').onChange(v => { this.pin.label = v; });
			t.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submit(); });
		});
		let linkInput: HTMLInputElement | null = null;
		new Setting(c).setName('Links to').setDesc('A note, or a heading in one: Part 1#3. Kennel')
			.addText(t => {
				linkInput = t.inputEl;
				t.setValue(this.pin.link ?? '').setPlaceholder('Note name#Heading').onChange(v => { this.pin.link = v.replace(/^\[\[|\]\]$/g, '').trim() || undefined; });
			})
			.addButton(b => b.setButtonText('Pick…').onClick(() => {
				new NoteSuggest(this.app, (path) => {
					this.pin.link = path;
					if (linkInput) linkInput.value = path;
					if (!this.pin.label && labelInput) { this.pin.label = path.split('#').pop()!.split('/').pop()!; labelInput.value = this.pin.label; }
				}).open();
			}));
		new Setting(c).setName('Kind').addDropdown(d => {
			for (const k of PIN_KINDS) d.addOption(k, k[0].toUpperCase() + k.slice(1));
			d.setValue(this.pin.kind).onChange(v => { this.pin.kind = v as PinKind; });
		});
		const s = new Setting(c);
		if (this.onDelete) s.addButton(b => setWarningButton(b.setButtonText('Delete')).onClick(() => { this.onDelete!(); this.close(); }));
		s.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()));
		s.addButton(b => b.setButtonText('Save').setCta().onClick(() => this.submit()));
		window.setTimeout(() => labelInput?.focus(), 0);
	}

	private submit(): void {
		if (!this.pin.label.trim()) this.pin.label = this.pin.link?.split('#').pop() || 'Pin';
		this.onSave(this.pin);
		this.close();
	}

	onClose(): void { this.contentEl.empty(); }
}

/** Notes and their headings, to link a pin to. */
class NoteSuggest extends FuzzySuggestModal<string> {
	constructor(app: App, private choose: (link: string) => void) {
		super(app);
		this.setPlaceholder('Link the pin to a note or heading…');
	}

	getItems(): string[] {
		const items: string[] = [];
		for (const f of this.app.vault.getMarkdownFiles()) {
			items.push(f.basename);
			for (const h of this.app.metadataCache.getFileCache(f)?.headings ?? []) items.push(`${f.basename}#${h.heading}`);
		}
		return items;
	}

	getItemText(item: string): string { return item; }
	onChooseItem(item: string): void { this.choose(item); }
}
