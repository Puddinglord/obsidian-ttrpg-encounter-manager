import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { defaultLabels, DIE_SIDES, dieShape, relabel, restingRotation, shapeFor, topIndex, valueOnTop } from '../src/dice3d/geometry';

describe('3D dice geometry', () => {
	it.each(DIE_SIDES)('d%i has the right faces and values', (sides) => {
		const s = dieShape(sides);
		const faceCount = sides === 4 ? 4 : sides;
		expect(s.faces).toHaveLength(faceCount);
		if (sides !== 4) {
			expect(s.faces.map(f => f.value).sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, i) => i + 1));
			// Opposite faces add to sides + 1.
			for (const f of s.faces) {
				const opp = s.faces.find(g => g.normal.dot(f.normal) < -0.999)!;
				expect(f.value + opp.value).toBe(sides + 1);
			}
		}
		expect(s.inradius).toBeGreaterThan(0.2);
	});

	it.each(DIE_SIDES)('d%i rests with every value on top, at any yaw', (sides) => {
		const s = dieShape(sides);
		for (let v = 1; v <= sides; v++) {
			for (const yaw of [0, 1.3, 4.1]) {
				expect(valueOnTop(s, restingRotation(s, v, yaw))).toBe(v);
			}
		}
	});

	it('d10 kites are flat (planar faces)', () => {
		const s = dieShape(10);
		for (const f of s.faces) {
			expect(f.verts).toHaveLength(4);
			const d = f.normal.dot(s.vertices[f.verts[0]]);
			for (const i of f.verts) expect(Math.abs(f.normal.dot(s.vertices[i]) - d)).toBeLessThan(1e-6);
		}
	});

	it('falls back for odd die sizes', () => {
		expect(shapeFor(100)).toBe(10);
		expect(shapeFor(3)).toBe(6);
		expect(shapeFor(7)).toBe(8);
		expect(shapeFor(30)).toBe(20);
	});

	it('a d4 reads the top vertex', () => {
		const s = dieShape(4);
		const q = restingRotation(s, 3);
		const top = s.vertices[2].clone().normalize().applyQuaternion(q);
		expect(top.dot(new Vector3(0, 1, 0))).toBeCloseTo(1, 5);
		expect(valueOnTop(s, new Quaternion())).toBeGreaterThan(0);
	});
});

describe('simulate-then-relabel', () => {
	const randomQuat = (seed: number) => {
		let s = seed;
		const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
		return new Quaternion().setFromEuler(new (class { x = r() * 7; y = r() * 7; z = r() * 7; order = 'XYZ'; })() as never).normalize();
	};

	it.each(DIE_SIDES)('d%i: whichever face lands on top, relabelling shows the rolled value', (sides) => {
		const s = dieShape(sides);
		const faces = sides === 4 ? 4 : sides;
		for (let top = 0; top < faces; top++) {
			for (let v = 1; v <= sides; v++) {
				const labels = relabel(s, defaultLabels(s), top, v);
				expect(labels[top]).toBe(v);
				// Still a full set of numbers, each once.
				expect(labels.slice().sort((a, b) => a - b)).toEqual(defaultLabels(s).slice().sort((a, b) => a - b));
				if (sides !== 4) {
					for (let i = 0; i < s.faces.length; i++) {
						const o = s.faces.findIndex(g => g.normal.dot(s.faces[i].normal) < -0.999);
						expect(labels[i] + labels[o]).toBe(sides + 1);
					}
				}
			}
		}
	});

	it.each(DIE_SIDES)('d%i: topIndex finds the face physics left on top', (sides) => {
		const s = dieShape(sides);
		for (let k = 1; k <= 20; k++) {
			const q = randomQuat(k * 7919);
			const { index } = topIndex(s, q);
			const labels = relabel(s, defaultLabels(s), index, 1 + (k % sides));
			// Read the value the way a player would: the label on the upward face.
			const up = new Vector3(0, 1, 0);
			const dirs = s.vertexValues ? s.vertices.map(v => v.clone().normalize()) : s.faces.map(f => f.normal);
			const best = dirs.map(d => d.clone().applyQuaternion(q).dot(up)).reduce((bi, x, i, a) => (x > a[bi] ? i : bi), 0);
			expect(labels[best]).toBe(1 + (k % sides));
		}
	});
});

describe('dice looks', () => {
	it('every listed material is a known look, and the shader hooks exist in three', async () => {
		const { DICE3D_MATERIALS } = await import('../src/dice3d/materials');
		const { lookProps } = await import('../src/dice3d/shaders');
		const { ShaderLib } = await import('three');
		const ids = DICE3D_MATERIALS.map(m => m.id);
		expect(ids).toEqual(['classic', 'gem', 'metal', 'glitter', 'lava', 'frost', 'nebula', 'opal', 'marble']);
		for (const id of ids) if (!['classic', 'gem', 'metal'].includes(id)) expect(lookProps(id as never)).toBeTruthy();
		// applyLook splices code in at these includes; if three renames them, the looks silently vanish.
		const frag = ShaderLib.physical.fragmentShader;
		for (const hook of ['#include <common>', '#include <emissivemap_fragment>', '#include <opaque_fragment>']) expect(frag).toContain(hook);
		const vert = ShaderLib.physical.vertexShader;
		for (const hook of ['#include <common>', '#include <begin_vertex>']) expect(vert).toContain(hook);
	});
});
