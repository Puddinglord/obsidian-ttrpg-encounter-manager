// Die shapes for the 3D roller: polyhedron faces, which value sits on which
// face, and the rotation that puts a given value on top. Uses three's math
// classes only (no WebGL), so it runs in unit tests.

import { Quaternion, Vector3 } from 'three';
import { MODEL_LAYOUTS } from './model-layout';

export const DIE_SIDES = [4, 6, 8, 10, 12, 20] as const;
export type DieSides = typeof DIE_SIDES[number];

export interface DieFace {
	/** Vertex indices, counter-clockwise seen from outside. */
	verts: number[];
	normal: Vector3;
	centroid: Vector3;
	/** Value printed on the face (d4: unused, see `vertexValues`). */
	value: number;
}

export interface DieShape {
	sides: DieSides;
	vertices: Vector3[];
	faces: DieFace[];
	/** d4 only: the value read at each vertex (the one pointing up is the result). */
	vertexValues?: number[];
	/** Distance from the centre to a face, i.e. resting height on a table. */
	inradius: number;
}

const PHI = (1 + Math.sqrt(5)) / 2;

function rawVertices(sides: DieSides): Vector3[] {
	const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
	switch (sides) {
		case 4: return [v(1, 1, 1), v(1, -1, -1), v(-1, 1, -1), v(-1, -1, 1)];
		case 6: {
			const out: Vector3[] = [];
			for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push(v(x, y, z));
			return out;
		}
		case 8: return [v(1, 0, 0), v(-1, 0, 0), v(0, 1, 0), v(0, -1, 0), v(0, 0, 1), v(0, 0, -1)];
		case 10: {
			// Pentagonal trapezohedron: ring heights ±b, apex height h, chosen so the kites are flat.
			const b = 0.105;
			const c = Math.cos(Math.PI / 5);
			const h = b * (1 + c) / (1 - c);
			const out = [v(0, h, 0), v(0, -h, 0)];
			for (let i = 0; i < 10; i++) {
				const a = (i * Math.PI) / 5;
				out.push(v(Math.cos(a), i % 2 ? -b : b, Math.sin(a)));
			}
			return out;
		}
		case 12: {
			const out: Vector3[] = [];
			for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push(v(x, y, z));
			for (const a of [-1, 1]) for (const b of [-1, 1]) {
				out.push(v(0, a / PHI, b * PHI), v(a / PHI, b * PHI, 0), v(a * PHI, 0, b / PHI));
			}
			return out;
		}
		case 20: {
			const out: Vector3[] = [];
			for (const a of [-1, 1]) for (const b of [-1, 1]) {
				out.push(v(0, a, b * PHI), v(a, b * PHI, 0), v(a * PHI, 0, b));
			}
			return out;
		}
	}
}

/** Faces of a convex polyhedron from its vertices: every plane with all vertices on one side. */
function hullFaces(verts: Vector3[]): { verts: number[]; normal: Vector3; centroid: Vector3 }[] {
	const eps = 1e-6;
	const faces: { verts: number[]; normal: Vector3; centroid: Vector3 }[] = [];
	const seen = new Set<string>();
	const n = verts.length;
	for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
		const normal = new Vector3().subVectors(verts[j], verts[i]).cross(new Vector3().subVectors(verts[k], verts[i]));
		if (normal.lengthSq() < eps) continue;
		normal.normalize();
		const d = normal.dot(verts[i]);
		let pos = 0, neg = 0;
		const on: number[] = [];
		for (let m = 0; m < n; m++) {
			const s = normal.dot(verts[m]) - d;
			if (s > eps) pos++;
			else if (s < -eps) neg++;
			else on.push(m);
		}
		if (pos && neg) continue;
		if (pos) normal.negate(); // outward
		const key = on.slice().sort((a, b) => a - b).join(',');
		if (seen.has(key)) continue;
		seen.add(key);
		const centroid = on.reduce((acc, m) => acc.add(verts[m]), new Vector3()).divideScalar(on.length);
		// Sort the face's vertices counter-clockwise around the outward normal.
		const u = new Vector3().subVectors(verts[on[0]], centroid).normalize();
		const w = new Vector3().crossVectors(normal, u);
		on.sort((a, b) => {
			const pa = new Vector3().subVectors(verts[a], centroid), pb = new Vector3().subVectors(verts[b], centroid);
			return Math.atan2(pa.dot(w), pa.dot(u)) - Math.atan2(pb.dot(w), pb.dot(u));
		});
		faces.push({ verts: on, normal, centroid });
	}
	return faces;
}

const cache = new Map<number, DieShape>();

/** The shape for a die size. Sizes we can't draw fall back to the nearest one that reads well. */
export function dieShape(sides: number): DieShape {
	const s = shapeFor(sides);
	const hit = cache.get(s);
	if (hit) return hit;
	const raw = rawVertices(s);
	// Scale so every die has about the same visual size (circumradius 1).
	const r = Math.max(...raw.map(p => p.length()));
	const vertices = raw.map(p => p.clone().divideScalar(r));
	const hull = hullFaces(vertices);
	const faces: DieFace[] = hull.map(f => ({ ...f, value: 0 }));

	// Opposite faces add up to sides + 1 (a d4 has no opposite faces).
	if (s !== 4) {
		let next = 1;
		const used = new Set<number>();
		// Deterministic order: by height, then angle, so the numbering is stable.
		const order = faces.map((f, i) => i).sort((a, b) => faces[b].normal.y - faces[a].normal.y || Math.atan2(faces[a].normal.z, faces[a].normal.x) - Math.atan2(faces[b].normal.z, faces[b].normal.x));
		for (const i of order) {
			if (used.has(i)) continue;
			const opp = faces.findIndex((g, j) => !used.has(j) && j !== i && g.normal.dot(faces[i].normal) < -0.999);
			faces[i].value = next;
			used.add(i);
			if (opp >= 0) { faces[opp].value = s + 1 - next; used.add(opp); }
			next++;
		}
	}
	const vertexValues = s === 4 ? [1, 2, 3, 4] : undefined;
	const inradius = Math.min(...faces.map(f => f.normal.dot(f.centroid)));
	const shape: DieShape = { sides: s, vertices, faces, vertexValues, inradius };
	cache.set(s, shape);
	return shape;
}

export function shapeFor(sides: number): DieSides {
	if ((DIE_SIDES as readonly number[]).includes(sides)) return sides as DieSides;
	if (sides === 100 || sides === 2 || sides === 3) return sides === 100 ? 10 : 6;
	return sides < 10 ? 8 : 20;
}

/** Can the 3D roller show this die exactly (same faces as the real die)? */
export function exactShape(sides: number): boolean {
	return (DIE_SIDES as readonly number[]).includes(sides);
}

/** The local direction that must point up for `value` to be the result. */
export function upDirection(shape: DieShape, value: number): Vector3 {
	if (shape.vertexValues) {
		const i = shape.vertexValues.indexOf(value);
		return shape.vertices[Math.max(0, i)].clone().normalize();
	}
	const face = shape.faces.find(f => f.value === value) ?? shape.faces[0];
	return face.normal.clone();
}

/** Rotation that rests the die with `value` on top, turned `yaw` radians about the vertical. */
export function restingRotation(shape: DieShape, value: number, yaw = 0): Quaternion {
	const tilt = new Quaternion().setFromUnitVectors(upDirection(shape, value), new Vector3(0, 1, 0));
	return new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw).multiply(tilt);
}

/** Which value is on top for a die at `rotation` (used by tests and as a sanity check). */
export function valueOnTop(shape: DieShape, rotation: Quaternion): number {
	const up = new Vector3(0, 1, 0);
	if (shape.vertexValues) {
		let best = 0, bestDot = -Infinity;
		shape.vertices.forEach((v, i) => { const d = v.clone().normalize().applyQuaternion(rotation).dot(up); if (d > bestDot) { bestDot = d; best = i; } });
		return shape.vertexValues[best];
	}
	let best = shape.faces[0];
	let bestDot = -Infinity;
	for (const f of shape.faces) {
		const d = f.normal.clone().applyQuaternion(rotation).dot(up);
		if (d > bestDot) { bestDot = d; best = f; }
	}
	return best.value;
}

// ---------------------------------------------------------------------------
// Simulate-then-relabel. Physics decides how a die lands; we then renumber its
// faces so the face that ended up on top shows the value we already rolled.

/** Labels for one die: the value on each face (d4: the value at each vertex). */
export function defaultLabels(shape: DieShape): number[] {
	return shape.vertexValues ? shape.vertexValues.slice() : shape.faces.map(f => f.value);
}

/** Index of the face (d4: vertex) pointing most nearly up, and how close to straight up it is. */
export function topIndex(shape: DieShape, rotation: Quaternion): { index: number; dot: number } {
	const up = new Vector3(0, 1, 0);
	const dirs = shape.vertexValues ? shape.vertices.map(v => v.clone().normalize()) : shape.faces.map(f => f.normal);
	let index = 0, dot = -Infinity;
	dirs.forEach((d, i) => {
		const k = d.clone().applyQuaternion(rotation).dot(up);
		if (k > dot) { dot = k; index = i; }
	});
	return { index, dot };
}

/** The face opposite face `i`, if the die has one (d4 doesn't). */
function opposite(shape: DieShape, i: number): number {
	if (shape.vertexValues) return -1;
	const n = shape.faces[i].normal;
	return shape.faces.findIndex(g => g.normal.dot(n) < -0.999);
}

/**
 * Relabel so `labels[top] === value`. Swaps the two faces' labels and, when the
 * die has opposite faces, their opposites too, so opposite faces still add up
 * to sides + 1, like a real die.
 */
export function relabel(shape: DieShape, labels: number[], top: number, value: number): number[] {
	const out = labels.slice();
	const j = out.indexOf(value);
	if (j < 0 || j === top) return out;
	const oTop = opposite(shape, top), oJ = opposite(shape, j);
	[out[top], out[j]] = [out[j], out[top]];
	if (oTop >= 0 && oJ >= 0 && oTop !== j && oJ !== top && oTop !== oJ) [out[oTop], out[oJ]] = [out[oJ], out[oTop]];
	return out;
}

// ---------------------------------------------------------------------------
// Model dice. A die from an imported dice set is a 3D model with its numbers
// painted on, so we can't renumber it. Instead physics rolls a body of the
// model's own shape, and the model is turned by one of the shape's symmetries
// so the face with the rolled value ends up where physics put the top face.

const modelCache = new Map<number, DieShape>();

/** Can imported model dice be rolled for this many sides? */
export function hasModelLayout(sides: number): boolean {
	return sides in MODEL_LAYOUTS;
}

/**
 * The shape model dice are built around, as a DieShape: same corners and face
 * values as the models. A d4 is read from its top corner (the one opposite the
 * face it rests on), so it carries vertexValues like our own d4.
 */
export function modelShape(sides: number): DieShape | null {
	const layout = MODEL_LAYOUTS[sides];
	if (!layout) return null;
	const hit = modelCache.get(sides);
	if (hit) return hit;
	const vertices = layout.vertices.map(([x, y, z]) => new Vector3(x, y, z).normalize());
	// Faces as the layout gives them (a model d10's kites aren't quite flat, so no hull here).
	// The normal is the direction of the face's centre, which is exact for these solids and
	// moves with the die's symmetries; corners are wound counter-clockwise from outside.
	const faces: DieFace[] = layout.faces.map((lf, i) => {
		const centroid = lf.reduce((acc, v) => acc.add(vertices[v]), new Vector3()).divideScalar(lf.length);
		const normal = centroid.clone().normalize();
		const [a, b, c] = lf.map(v => vertices[v]);
		const wound = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).dot(normal) > 0;
		return { verts: wound ? lf.slice() : lf.slice().reverse(), normal, centroid, value: layout.values[i] };
	});
	let vertexValues: number[] | undefined;
	if (layout.readsDown) {
		// Each corner sits opposite one face; that face's value is read when the corner points up.
		vertexValues = vertices.map((_, v) => faces.find(f => !f.verts.includes(v))?.value ?? 0);
	}
	const inradius = Math.min(...faces.map(f => f.normal.dot(f.centroid)));
	const shape: DieShape = { sides: sides as DieSides, vertices, faces, vertexValues, inradius };
	modelCache.set(sides, shape);
	return shape;
}

/** Direction of the face (d4: corner) at `index`, in the die's own frame. */
function dirOf(shape: DieShape, index: number): Vector3 {
	return shape.vertexValues ? shape.vertices[index].clone().normalize() : shape.faces[index].normal.clone();
}

/**
 * A rotation of the die onto itself that carries face (d4: corner) `from` to
 * where `to` is. Every die here is face-transitive, so one always exists.
 */
export function symmetryRotation(shape: DieShape, from: number, to: number): Quaternion {
	const a = dirOf(shape, from), b = dirOf(shape, to);
	const align = new Quaternion().setFromUnitVectors(a, b);
	const verts = shape.vertices;
	const matches = (q: Quaternion) => verts.every(v => {
		const p = v.clone().applyQuaternion(q);
		return verts.some(w => w.distanceToSquared(p) < 1e-6);
	});
	// Try every twist about b that lands one of the corners on another corner.
	const ref = verts.find(v => Math.abs(v.clone().normalize().dot(a)) < 0.999) ?? verts[0];
	const r = ref.clone().applyQuaternion(align);
	const perp = (v: Vector3) => v.clone().sub(b.clone().multiplyScalar(v.dot(b)));
	const rp = perp(r);
	for (const w of verts) {
		const wp = perp(w);
		if (Math.abs(wp.length() - rp.length()) > 1e-4 || Math.abs(w.dot(b) - r.dot(b)) > 1e-4) continue;
		const angle = Math.atan2(new Vector3().crossVectors(rp, wp).dot(b), rp.dot(wp));
		const q = new Quaternion().setFromAxisAngle(b, angle).multiply(align);
		if (matches(q)) return q;
	}
	return align;
}

/**
 * How to turn a model die so it shows `value`: given the pose physics left it
 * in, the extra rotation (applied in the die's own frame) that puts the
 * value's face where the top face is.
 */
export function modelCorrection(shape: DieShape, rotation: Quaternion, value: number): Quaternion {
	const top = topIndex(shape, rotation).index;
	const labels = defaultLabels(shape);
	const want = labels.indexOf(value);
	if (want < 0 || want === top) return new Quaternion();
	return symmetryRotation(shape, want, top);
}
