// Die shapes for the sheet: a d4 is a triangle, a d6 a rounded square, a d8 a
// diamond, a d10 a kite, a d12 a pentagon, a d20 a hexagon with its front face.
// Drawn in currentColor (fill) on a 24×24 box; a face value, if any, sits on top.

const NS = 'http://www.w3.org/2000/svg';

const SHAPES: Record<number, { body: string; face?: string }> = {
	4: { body: 'M12 2.6 L22 20.4 H2 Z' },
	6: { body: 'M7 3 H17 A4 4 0 0 1 21 7 V17 A4 4 0 0 1 17 21 H7 A4 4 0 0 1 3 17 V7 A4 4 0 0 1 7 3 Z' },
	8: { body: 'M12 1.6 L22.4 12 L12 22.4 L1.6 12 Z', face: 'M1.6 12 H22.4' },
	10: { body: 'M12 1.6 L22.2 10.2 L12 22.4 L1.8 10.2 Z', face: 'M1.8 10.2 L12 14 L22.2 10.2 M12 14 V22.4' },
	12: { body: 'M12 1.8 L22 9.1 L18.2 21 H5.8 L2 9.1 Z', face: 'M12 6.2 L16.7 9.6 L14.9 15.2 H9.1 L7.3 9.6 Z' },
	20: { body: 'M12 1.5 L21.4 7 V17 L12 22.5 L2.6 17 V7 Z', face: 'M12 6.4 L17.6 16 H6.4 Z' },
};

/**
 * A die of `sides` as an element: `value` shows on it (a rolled face), or
 * nothing for a die that's held but not rolled yet.
 */
export function dieShape(parent: HTMLElement, sides: number, o: { value?: number; cls?: string } = {}): HTMLElement {
	const el = parent.createSpan({ cls: `ns-die is-d${sides}${o.cls ? ` ${o.cls}` : ''}` });
	const svg = (parent.ownerDocument ?? activeDocument).createElementNS(NS, 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('ns-die-svg');
	const shape = SHAPES[sides];
	if (shape) {
		const body = (parent.ownerDocument ?? activeDocument).createElementNS(NS, 'path');
		body.setAttribute('d', shape.body);
		body.classList.add('ns-die-body');
		svg.appendChild(body);
		if (shape.face) {
			const face = (parent.ownerDocument ?? activeDocument).createElementNS(NS, 'path');
			face.setAttribute('d', shape.face);
			face.classList.add('ns-die-face');
			svg.appendChild(face);
		}
	} else {
		const c = (parent.ownerDocument ?? activeDocument).createElementNS(NS, 'circle');
		c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '10');
		c.classList.add('ns-die-body');
		svg.appendChild(c);
	}
	el.appendChild(svg);
	if (o.value) {
		el.addClass('has-value');
		el.createSpan({ cls: 'ns-die-num', text: String(o.value) });
	}
	return el;
}

/** Dark or light ink for numbers on a die of this colour (#rrggbb). */
export function inkOn(color: string): string {
	const hex = color.replace('#', '');
	const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
	return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#24180a' : '#fffaf0';
}

/**
 * A ▲ or ▼ that looks centred in a round badge: triangles are weighted toward
 * their base, so the centroid (a third of the way up from the base), not the
 * bounding box, sits on the centre of the 10×10 box.
 */
export function triangleMark(parent: HTMLElement, dir: 'up' | 'down', cls = ''): SVGSVGElement {
	const doc = parent.ownerDocument ?? activeDocument;
	const svg = doc.createElementNS(NS, 'svg');
	svg.setAttribute('viewBox', '0 0 10 10');
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('ns-tri-mark');
	if (cls) svg.classList.add(cls);
	const h = 4.3;
	const w = 5;
	const apex = dir === 'up' ? 5 - (2 * h) / 3 : 5 + (2 * h) / 3;
	const base = dir === 'up' ? 5 + h / 3 : 5 - h / 3;
	const poly = doc.createElementNS(NS, 'polygon');
	poly.setAttribute('points', `5,${apex.toFixed(2)} ${(5 + w / 2).toFixed(2)},${base.toFixed(2)} ${(5 - w / 2).toFixed(2)},${base.toFixed(2)}`);
	svg.appendChild(poly);
	parent.appendChild(svg);
	return svg;
}
