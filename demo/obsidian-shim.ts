// A tiny stand-in for the parts of Obsidian's API the landing page demo touches.
// esbuild aliases `obsidian` to this file for the demo build only.

type ElOpts = { cls?: string | string[]; text?: string; attr?: Record<string, string | number | boolean | null>; title?: string; type?: string; href?: string; placeholder?: string; value?: string } | string;

function applyOpts(el: HTMLElement, o?: ElOpts): void {
	if (!o) return;
	if (typeof o === 'string') { el.className = o; return; }
	if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(' ') : o.cls;
	if (o.text != null) el.textContent = o.text;
	if (o.title) el.title = o.title;
	if (o.type) el.setAttribute('type', o.type);
	if (o.href) el.setAttribute('href', o.href);
	if (o.placeholder) el.setAttribute('placeholder', o.placeholder);
	if (o.value != null) (el as HTMLInputElement).value = o.value;
	if (o.attr) for (const [k, v] of Object.entries(o.attr)) { if (v != null && v !== false) el.setAttribute(k, String(v)); }
}

// This file is what supplies createEl, so it has to build elements with the
// browser's own createElement underneath.
function make<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, o?: ElOpts, cb?: (el: HTMLElementTagNameMap[K]) => void): HTMLElementTagNameMap[K] {
	const el = doc.createElement(tag, {});
	applyOpts(el, o);
	cb?.(el);
	return el;
}

// Obsidian's DOM helpers, added to the prototypes like the app does.
const N = Node.prototype as unknown as Record<string, unknown>;
const E = HTMLElement.prototype as unknown as Record<string, unknown>;
const ownerDoc = (n: Node): Document => (n.nodeType === 9 ? (n as Document) : n.ownerDocument ?? activeDocument);
const appendNew = (parent: Node, tag: keyof HTMLElementTagNameMap, o?: ElOpts, cb?: (el: HTMLElement) => void): HTMLElement => {
	const el = make(ownerDoc(parent), tag, o, cb);
	parent.appendChild(el);
	return el;
};
if (!N.createEl) {
	N.createEl = function (this: Node, tag: keyof HTMLElementTagNameMap, o?: ElOpts, cb?: (el: HTMLElement) => void) { return appendNew(this, tag, o, cb); };
	N.createDiv = function (this: Node, o?: ElOpts, cb?: (el: HTMLElement) => void) { return appendNew(this, 'div', o, cb); };
	N.createSpan = function (this: Node, o?: ElOpts, cb?: (el: HTMLElement) => void) { return appendNew(this, 'span', o, cb); };
	N.appendText = function (this: Node, t: string) { this.appendChild(ownerDoc(this).createTextNode(t)); };
	N.empty = function (this: Node) { while (this.firstChild) this.removeChild(this.firstChild); };
	N.detach = function (this: Node) { this.parentNode?.removeChild(this); };
	N.instanceOf = function (this: Node, type: { new (): unknown; prototype: object }) { return Object.prototype.isPrototypeOf.call(type.prototype, this) as boolean; };
	Object.defineProperty(N, 'doc', { get(this: Node) { return ownerDoc(this); }, configurable: true });
	Object.defineProperty(N, 'win', { get(this: Node) { return ownerDoc(this).defaultView ?? window; }, configurable: true });
	E.addClass = function (this: HTMLElement, ...c: string[]) { this.classList.add(...c.flatMap(s => s.split(' ').filter(Boolean))); };
	E.removeClass = function (this: HTMLElement, ...c: string[]) { this.classList.remove(...c); };
	E.toggleClass = function (this: HTMLElement, c: string, on: boolean) { this.classList.toggle(c, on); };
	E.hasClass = function (this: HTMLElement, c: string) { return this.classList.contains(c); };
	E.setAttr = function (this: HTMLElement, k: string, v: string | number | boolean | null) { if (v == null || v === false) this.removeAttribute(k); else this.setAttribute(k, String(v)); };
	E.setText = function (this: HTMLElement, t: string) { this.textContent = t; };
	E.toggle = function (this: HTMLElement, on: boolean) { this.style.display = on ? '' : 'none'; };
	E.show = function (this: HTMLElement & { toggle: (on: boolean) => void }) { this.toggle(true); };
	E.hide = function (this: HTMLElement & { toggle: (on: boolean) => void }) { this.toggle(false); };
	E.setCssProps = function (this: HTMLElement, props: Record<string, string>) { for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v); };
	E.setCssStyles = function (this: HTMLElement, s: Partial<CSSStyleDeclaration>) { Object.assign(this.style, s); };
	E.onClickEvent = function (this: HTMLElement, cb: (e: MouseEvent) => void) { this.addEventListener('click', cb); };
	const g = window as unknown as Record<string, unknown>;
	g.activeDocument = window.document;
	g.activeWindow = window;
	g.createEl = (tag: keyof HTMLElementTagNameMap, o?: ElOpts, cb?: (el: HTMLElement) => void) => make(activeDocument, tag, o, cb);
	g.createDiv = (o?: ElOpts, cb?: (el: HTMLElement) => void) => make(activeDocument, 'div', o, cb);
	g.createSpan = (o?: ElOpts, cb?: (el: HTMLElement) => void) => make(activeDocument, 'span', o, cb);
	g.createFragment = (cb?: (f: DocumentFragment) => void) => { const f = new DocumentFragment(); cb?.(f); return f; };
}

// Lucide icons (ISC licence) for the handful the demo shows.
const ICONS: Record<string, string> = {
	x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
	minus: '<path d="M5 12h14"/>',
	'chevron-down': '<path d="m6 9 6 6 6-6"/>',
	'chevron-right': '<path d="m9 18 6-6-6-6"/>',
	play: '<polygon points="6 3 20 12 6 21 6 3"/>',
	'file-symlink': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
	'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
	'book-open-text': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/><path d="M6 8h2"/><path d="M6 12h2"/><path d="M16 8h2"/><path d="M16 12h2"/>',
	swords: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
	'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
	gem: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
	users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
	'sliders-horizontal': '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
	check: '<path d="M20 6 9 17l-5-5"/>',
	'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
	'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
	'chevron-left': '<path d="m15 18-6-6 6-6"/>',
	'copy': '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
	'copy-plus': '<line x1="15" x2="15" y1="12" y2="18"/><line x1="12" x2="18" y1="15" y2="15"/><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
	'delete': '<path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/>',
	'dices': '<rect width="12" height="12" x="2" y="10" rx="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/>',
	'file-plus': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
	'heart-crack': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="m12 13-1-1 2-2-3-3 2-2"/>',
	'more-horizontal': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
	'more-vertical': '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
	'pencil': '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
	'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
	'save': '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
	'scroll': '<path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
	'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
	'shield-plus': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M9 12h6"/><path d="M12 9v6"/>',
	'skip-forward': '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
	'square': '<rect width="18" height="18" x="3" y="3" rx="2"/>',
	'sticky-note': '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
	'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
	'trending-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
	'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
	'user-cog': '<circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m21.7 16.4-.9-.3"/><path d="m15.2 13.9-.9-.3"/><path d="m16.6 18.7.3-.9"/><path d="m19.1 12.2.3-.9"/><path d="m19.6 18.7-.4-1"/><path d="m16.8 12.3-.4-1"/><path d="m14.3 16.6 1-.4"/><path d="m20.7 13.8 1-.4"/>',
	'user-round': '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
	'zap': '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
	'circle': '<circle cx="12" cy="12" r="10"/>',
	'check-circle-2': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
	'dice-5': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/>',
	'shield-alert': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
	'scroll-text': '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
	'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
	'eye-off': '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
};

const svgParser = new DOMParser();
export function setIcon(parent: HTMLElement, name: string): void {
	parent.empty();
	const body = ICONS[name];
	if (!body) return;
	// The markup is the fixed table above, parsed as XML; the name only ever becomes a class.
	const svg = svgParser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`, 'image/svg+xml').documentElement;
	svg.classList.add('svg-icon', `lucide-${name}`);
	parent.appendChild(parent.doc.importNode(svg, true));
}

export const Platform = {
	get isMobile(): boolean { return window.matchMedia('(hover: none)').matches; },
	get isPhone(): boolean { return window.matchMedia('(hover: none) and (max-width: 600px)').matches; },
	get isTablet(): boolean { return false; },
	isDesktop: true,
	isDesktopApp: false,
	isMobileApp: false,
	isIosApp: false,
	isAndroidApp: false,
	isMacOS: false, // nothing the demo shows depends on it
};

/** Toasts land in the demo's notice stack (see demo.ts). */
export class Notice {
	noticeEl: HTMLElement;
	messageEl: HTMLElement;
	constructor(message: string | DocumentFragment, duration = 4000) {
		const host = activeDocument.querySelector('.demo-notices') ?? activeDocument.body;
		this.noticeEl = this.messageEl = host.createDiv({ cls: 'notice' });
		if (typeof message === 'string') this.messageEl.setText(message); else this.messageEl.appendChild(message);
		window.setTimeout(() => this.hide(), duration);
	}
	setMessage(m: string): this { this.messageEl.setText(m); return this; }
	hide(): void {
		this.noticeEl.addClass('is-leaving');
		window.setTimeout(() => this.noticeEl.remove(), 300);
	}
}

export class Component {
	private cleanups: (() => void)[] = [];
	load(): void { /* nothing to load */ }
	onload(): void { /* nothing to load */ }
	unload(): void { this.cleanups.splice(0).forEach(f => f()); }
	onunload(): void { /* nothing to unload */ }
	register(cb: () => void): void { this.cleanups.push(cb); }
	registerEvent(): void { /* events never unload in the demo */ }
	registerDomEvent(el: EventTarget, type: string, cb: EventListener, opts?: AddEventListenerOptions): void {
		el.addEventListener(type, cb, opts);
		this.register(() => el.removeEventListener(type, cb, opts));
	}
	registerInterval(id: number): number { return id; }
	addChild<T>(c: T): T { return c; }
}
export class MarkdownRenderChild extends Component { constructor(public containerEl: HTMLElement) { super(); } }
export class Plugin extends Component {}
export class Events {
	private handlers = new Map<string, ((...a: unknown[]) => void)[]>();
	on(name: string, cb: (...a: unknown[]) => void): { name: string } { (this.handlers.get(name) ?? this.handlers.set(name, []).get(name)!).push(cb); return { name }; }
	off(name: string, cb: (...a: unknown[]) => void): void { this.handlers.set(name, (this.handlers.get(name) ?? []).filter(h => h !== cb)); }
	offref(): void { /* not needed */ }
	trigger(name: string, ...a: unknown[]): void { (this.handlers.get(name) ?? []).forEach(h => h(...a)); }
}

/** Anything the demo never opens. Present so the shared modules import cleanly. */
class Unused {
	constructor(..._a: unknown[]) { /* the demo doesn't open these */ }
	open(): void { /* never shown */ }
	close(): void { /* never shown */ }
}
export class PluginSettingTab extends Unused {}
export class FuzzySuggestModal extends Unused {}
export class SuggestModal extends Unused {}
export class EditorSuggest extends Unused {}
export class AbstractInputSuggest extends Unused {}
export class TFile {}
export class TFolder {}
export class TAbstractFile {}
export class MarkdownView {}
export class WorkspaceLeaf {}
export class App {}
export const MarkdownRenderer = { render: async (_app: unknown, md: string, el: HTMLElement): Promise<void> => { el.createEl('p', { text: md }); } };
export const Keymap = { isModEvent: () => false };
export const requestUrl = () => Promise.reject(new Error('No network in the demo'));
export function normalizePath(p: string): string { return p; }
export function setTooltip(el: HTMLElement, text: string): void { el.setAttribute('aria-label', text); }
export function debounce<T extends (...a: never[]) => unknown>(fn: T, ms = 0): T & { cancel: () => void } {
	let t: number | undefined;
	const d = ((...a: never[]) => { window.clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); }) as T & { cancel: () => void };
	d.cancel = () => window.clearTimeout(t);
	return d;
}
export function parseYaml(): unknown { return {}; }
export function stringifyYaml(): string { return ''; }
export function getIcon(): null { return null; }
export function addIcon(): void { /* not needed */ }
export const moment = () => ({ format: () => '' });
export function prepareFuzzySearch(q: string) { const s = q.toLowerCase(); return (t: string) => (t.toLowerCase().includes(s) ? { score: 0, matches: [] } : null); }
export function renderResults(): void { /* not needed */ }
export const editorInfoField = {};
export const editorLivePreviewField = {};
export class Scope { register(): void { /* not needed */ } }
export class HoverPopover {}
export class FileView extends Unused {}
export class ToggleComponent extends Unused {}
export class DropdownComponent extends Unused {}
export class ExtraButtonComponent extends Unused {}
export class Vault {}
export class Workspace {}
export const apiVersion = '1.7.2';
export function requireApiVersion(v: string): boolean {
	const [a, b] = [apiVersion, v].map(x => x.split('.').map(Number));
	for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
	return true;
}

// ---------------------------------------------------------------------------
// Views, modals, menus and settings rows: small working versions, for the tracker.

export class ItemView extends Component {
	app: unknown;
	containerEl: HTMLElement;
	constructor(public leaf: { app?: unknown }) {
		super();
		this.app = leaf?.app;
		this.containerEl = createDiv({ cls: 'workspace-leaf-content' });
		this.containerEl.createDiv({ cls: 'view-header' });
		this.containerEl.createDiv({ cls: 'view-content' });
	}
}

export class Modal extends Component {
	modalEl: HTMLElement;
	titleEl: HTMLElement;
	contentEl: HTMLElement;
	private bg: HTMLElement;
	constructor(public app: unknown) {
		super();
		this.bg = createDiv({ cls: 'modal-container mod-dim' });
		this.bg.createDiv({ cls: 'modal-bg' }).addEventListener('click', () => this.close());
		this.modalEl = this.bg.createDiv({ cls: 'modal' });
		const x = this.modalEl.createEl('button', { cls: 'modal-close-button clickable-icon', attr: { 'aria-label': 'Close' } });
		setIcon(x, 'x');
		x.addEventListener('click', () => this.close());
		this.titleEl = this.modalEl.createDiv({ cls: 'modal-title' });
		this.contentEl = this.modalEl.createDiv({ cls: 'modal-content' });
	}
	open(): void {
		activeDocument.body.appendChild(this.bg);
		this.onOpen();
		this.bg.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
	}
	close(): void {
		if (!this.bg.isConnected) return;
		this.onClose();
		this.bg.remove();
		this.unload();
	}
	onOpen(): void { /* subclasses fill it */ }
	onClose(): void { /* subclasses tidy up */ }
	setTitle(t: string): this { this.titleEl.setText(t); return this; }
}

export class ButtonComponent {
	buttonEl: HTMLButtonElement;
	constructor(parent: HTMLElement) { this.buttonEl = parent.createEl('button'); }
	setButtonText(t: string): this { this.buttonEl.setText(t); return this; }
	setIcon(i: string): this { setIcon(this.buttonEl, i); return this; }
	setTooltip(t: string): this { this.buttonEl.setAttr('aria-label', t); return this; }
	setCta(): this { this.buttonEl.addClass('mod-cta'); return this; }
	setWarning(): this { this.buttonEl.addClass('mod-warning'); return this; }
	setClass(c: string): this { this.buttonEl.addClass(c); return this; }
	setDisabled(d: boolean): this { this.buttonEl.disabled = d; return this; }
	onClick(cb: (e: MouseEvent) => void): this { this.buttonEl.addEventListener('click', cb); return this; }
}

export class TextComponent {
	inputEl: HTMLInputElement | HTMLTextAreaElement;
	constructor(parent: HTMLElement, area = false) { this.inputEl = area ? parent.createEl('textarea') : parent.createEl('input', { type: 'text' }); }
	setValue(v: string): this { this.inputEl.value = v; return this; }
	getValue(): string { return this.inputEl.value; }
	setPlaceholder(p: string): this { this.inputEl.placeholder = p; return this; }
	onChange(cb: (v: string) => void): this { this.inputEl.addEventListener('input', () => cb(this.inputEl.value)); return this; }
}

export class Setting {
	settingEl: HTMLElement;
	infoEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		this.settingEl = containerEl.createDiv({ cls: 'setting-item' });
		this.infoEl = this.settingEl.createDiv({ cls: 'setting-item-info' });
		this.nameEl = this.infoEl.createDiv({ cls: 'setting-item-name' });
		this.descEl = this.infoEl.createDiv({ cls: 'setting-item-description' });
		this.controlEl = this.settingEl.createDiv({ cls: 'setting-item-control' });
	}
	setName(n: string): this { this.nameEl.setText(n); return this; }
	setDesc(d: string): this { this.descEl.setText(d); return this; }
	setHeading(): this { this.settingEl.addClass('setting-item-heading'); return this; }
	setClass(c: string): this { this.settingEl.addClass(c); return this; }
	addButton(cb: (b: ButtonComponent) => void): this { cb(new ButtonComponent(this.controlEl)); return this; }
	addExtraButton(cb: (b: ButtonComponent) => void): this { cb(new ButtonComponent(this.controlEl)); return this; }
	addText(cb: (t: TextComponent) => void): this { cb(new TextComponent(this.controlEl)); return this; }
	addTextArea(cb: (t: TextComponent) => void): this { cb(new TextComponent(this.controlEl, true)); return this; }
}

interface MenuItemSpec { title: string; icon?: string; cb?: (e: MouseEvent | KeyboardEvent) => void; disabled?: boolean; checked?: boolean; warning?: boolean }
class MenuItem {
	constructor(private spec: MenuItemSpec) {}
	setTitle(t: string): this { this.spec.title = t; return this; }
	setIcon(i: string | null): this { this.spec.icon = i ?? undefined; return this; }
	onClick(cb: (e: MouseEvent | KeyboardEvent) => void): this { this.spec.cb = cb; return this; }
	setDisabled(d: boolean): this { this.spec.disabled = d; return this; }
	setChecked(c: boolean | null): this { this.spec.checked = !!c; return this; }
	setWarning(w: boolean): this { this.spec.warning = w; return this; }
	setSection(): this { return this; }
	setIsLabel(): this { return this; }
}
let openMenu: HTMLElement | null = null;
export class Menu {
	private items: (MenuItemSpec | 'sep')[] = [];
	addItem(cb: (item: MenuItem) => void): this { const spec: MenuItemSpec = { title: '' }; cb(new MenuItem(spec)); this.items.push(spec); return this; }
	addSeparator(): this { this.items.push('sep'); return this; }
	setNoIcon(): this { return this; }
	onHide(): this { return this; }
	hide(): void { openMenu?.remove(); openMenu = null; }
	showAtMouseEvent(e: MouseEvent): void { this.showAtPosition({ x: e.clientX, y: e.clientY }); }
	showAtPosition(p: { x: number; y: number }): void {
		this.hide();
		const el = activeDocument.body.createDiv({ cls: 'menu demo-menu' });
		for (const it of this.items) {
			if (it === 'sep') { el.createDiv({ cls: 'menu-separator' }); continue; }
			const row = el.createDiv({ cls: `menu-item${it.disabled ? ' is-disabled' : ''}${it.warning ? ' is-warning' : ''}` });
			const icon = row.createDiv({ cls: 'menu-item-icon' });
			if (it.icon) setIcon(icon, it.icon);
			row.createDiv({ cls: 'menu-item-title', text: it.title });
			if (it.checked) setIcon(row.createDiv({ cls: 'menu-item-icon mod-checked' }), 'check');
			row.addEventListener('click', (e) => { if (it.disabled) return; this.hide(); it.cb?.(e); });
		}
		el.style.left = `${Math.min(p.x, window.innerWidth - 240)}px`;
		el.style.top = `${Math.min(p.y, window.innerHeight - el.offsetHeight - 8)}px`;
		openMenu = el;
		window.setTimeout(() => activeDocument.addEventListener('pointerdown', (e) => { if (!el.contains(e.target as Node)) this.hide(); }, { once: true, capture: true }), 0);
	}
}
