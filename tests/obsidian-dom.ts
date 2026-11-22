// Obsidian adds DOM helpers (createEl, createSpan, el.doc, activeDocument, ...)
// as globals and on Node.prototype. happy-dom doesn't have them, so tests get
// small stand-ins that behave the same for what the plugin uses.

interface ElInfo {
	cls?: string | string[];
	text?: string;
	attr?: Record<string, string | number | boolean | null>;
	/** Obsidian sets these as properties (an option's value, an input's type). */
	value?: string;
	type?: string;
}

function build<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, o?: ElInfo | string): HTMLElementTagNameMap[K] {
	const el = doc.createElement(tag);
	const info: ElInfo = typeof o === 'string' ? { cls: o } : o ?? {};
	if (info.cls) el.className = Array.isArray(info.cls) ? info.cls.join(' ') : info.cls;
	if (info.text !== undefined) el.textContent = info.text;
	for (const [k, v] of Object.entries(info.attr ?? {})) {
		if (v !== null && v !== false) el.setAttribute(k, String(v));
	}
	if (info.value !== undefined) (el as HTMLInputElement).value = info.value;
	if (info.type !== undefined) el.setAttribute('type', info.type);
	return el;
}

function ownerDoc(node: Node): Document {
	return node.ownerDocument ?? (node as Document);
}

const proto = Node.prototype as unknown as Record<string, unknown>;

if (!('doc' in Node.prototype)) {
	Object.defineProperty(Node.prototype, 'doc', { configurable: true, get(this: Node) { return ownerDoc(this); } });
	Object.defineProperty(Node.prototype, 'win', { configurable: true, get(this: Node) { return ownerDoc(this).defaultView ?? window; } });
}

type Cb = (el: HTMLElement) => void;
function createEl(this: Node, tag: keyof HTMLElementTagNameMap, o?: ElInfo | string, cb?: Cb): HTMLElement {
	const el = build(ownerDoc(this), tag, o);
	this.appendChild(el);
	cb?.(el);
	return el;
}
proto.createEl ??= createEl;
proto.createDiv ??= function (this: Node, o?: ElInfo | string, cb?: Cb) { return createEl.call(this, 'div', o, cb); };
proto.createSpan ??= function (this: Node, o?: ElInfo | string, cb?: Cb) { return createEl.call(this, 'span', o, cb); };
proto.createSvg ??= function (this: Node, tag: string, o?: ElInfo | string, cb?: (el: SVGElement) => void) {
	const el = ownerDoc(this).createElementNS('http://www.w3.org/2000/svg', tag);
	const info: ElInfo = typeof o === 'string' ? { cls: o } : o ?? {};
	if (info.cls) el.setAttribute('class', Array.isArray(info.cls) ? info.cls.join(' ') : info.cls);
	for (const [k, v] of Object.entries(info.attr ?? {})) if (v !== null && v !== false) el.setAttribute(k, String(v));
	this.appendChild(el);
	cb?.(el);
	return el;
};

const g = globalThis as unknown as Record<string, unknown>;
g.activeDocument ??= document;
g.activeWindow ??= window;
// The global forms make a detached element.
g.createEl ??= <K extends keyof HTMLElementTagNameMap>(tag: K, o?: ElInfo | string) => build(document, tag, o);
g.createDiv ??= (o?: ElInfo | string) => build(document, 'div', o);
g.createSpan ??= (o?: ElInfo | string) => build(document, 'span', o);

const el = HTMLElement.prototype as unknown as Record<string, unknown>;
proto.appendText ??= function (this: Node, t: string) { this.appendChild(ownerDoc(this).createTextNode(t)); };
proto.empty ??= function (this: Node) { while (this.firstChild) this.removeChild(this.firstChild); };
el.addClass ??= function (this: HTMLElement, ...c: string[]) { this.classList.add(...c); };
el.removeClass ??= function (this: HTMLElement, ...c: string[]) { this.classList.remove(...c); };
el.toggleClass ??= function (this: HTMLElement, c: string, on: boolean) { this.classList.toggle(c, on); };
el.hasClass ??= function (this: HTMLElement, c: string) { return this.classList.contains(c); };
el.setCssStyles ??= function (this: HTMLElement, s: Record<string, string>) { Object.assign(this.style, s); };
el.setCssProps ??= function (this: HTMLElement, s: Record<string, string>) { for (const [k, v] of Object.entries(s)) this.style.setProperty(k, v); };
el.setAttr ??= function (this: HTMLElement, k: string, v: string | number | boolean | null) { if (v === null || v === false) this.removeAttribute(k); else this.setAttribute(k, String(v)); };
el.setText ??= function (this: HTMLElement, t: string) { this.textContent = t; };
el.addClasses ??= function (this: HTMLElement, c: string[]) { this.classList.add(...c); };
// Drawings (createSvg) take the same helpers.
const svg = SVGElement.prototype as unknown as Record<string, unknown>;
for (const k of ['addClass', 'removeClass', 'toggleClass', 'setCssStyles', 'setCssProps', 'setAttr', 'setText']) svg[k] ??= el[k];
el.hide ??= function (this: HTMLElement) { this.style.display = 'none'; };
el.show ??= function (this: HTMLElement) { this.style.display = ''; };
