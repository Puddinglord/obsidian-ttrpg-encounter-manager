// Obsidian adds DOM helpers (createEl, createSpan, el.doc, activeDocument, ...)
// as globals and on Node.prototype. happy-dom doesn't have them, so tests get
// small stand-ins that behave the same for what the plugin uses.

interface ElInfo {
	cls?: string | string[];
	text?: string;
	attr?: Record<string, string | number | boolean | null>;
}

function build<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, o?: ElInfo | string): HTMLElementTagNameMap[K] {
	const el = doc.createElement(tag);
	const info: ElInfo = typeof o === 'string' ? { cls: o } : o ?? {};
	if (info.cls) el.className = Array.isArray(info.cls) ? info.cls.join(' ') : info.cls;
	if (info.text !== undefined) el.textContent = info.text;
	for (const [k, v] of Object.entries(info.attr ?? {})) {
		if (v !== null && v !== false) el.setAttribute(k, String(v));
	}
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

const g = globalThis as unknown as Record<string, unknown>;
g.activeDocument ??= document;
g.activeWindow ??= window;

const el = HTMLElement.prototype as unknown as Record<string, unknown>;
proto.appendText ??= function (this: Node, t: string) { this.appendChild(ownerDoc(this).createTextNode(t)); };
proto.empty ??= function (this: Node) { while (this.firstChild) this.removeChild(this.firstChild); };
el.addClass ??= function (this: HTMLElement, ...c: string[]) { this.classList.add(...c); };
el.removeClass ??= function (this: HTMLElement, ...c: string[]) { this.classList.remove(...c); };
el.toggleClass ??= function (this: HTMLElement, c: string, on: boolean) { this.classList.toggle(c, on); };
el.setAttr ??= function (this: HTMLElement, k: string, v: string | number | boolean | null) { if (v === null || v === false) this.removeAttribute(k); else this.setAttribute(k, String(v)); };
el.setText ??= function (this: HTMLElement, t: string) { this.textContent = t; };
