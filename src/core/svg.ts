// Our own drawings (a sheet's boxes, a class's scrollwork, a stat's save marks)
// as SVG elements. The markup is always a constant in the code, never note
// text: it's parsed with DOMParser and imported, never set as HTML.

const NS = 'http://www.w3.org/2000/svg';
const parsed = new Map<string, Element>();

/** An `<svg>` of `w` × `h` (its viewBox and size) holding `markup`, in `parent` (or detached, with null). */
export function drawSvg(parent: Element | null, markup: string, w: number, h: number, cls?: string): SVGSVGElement {
	const key = `${w}|${h}|${markup}`;
	let tpl = parsed.get(key);
	if (!tpl) {
		tpl = new DOMParser().parseFromString(`<svg xmlns="${NS}" viewBox="0 0 ${w} ${h}">${markup}</svg>`, 'image/svg+xml').documentElement;
		parsed.set(key, tpl);
	}
	const doc = parent?.ownerDocument ?? activeDocument;
	// importNode keeps the element's type; the template is always an <svg> we wrote.
	const el = doc.importNode(tpl, true) as SVGSVGElement;
	el.setAttribute('width', String(w));
	el.setAttribute('height', String(h));
	el.setAttribute('aria-hidden', 'true');
	if (cls) el.setAttribute('class', cls);
	parent?.appendChild(el);
	return el;
}
