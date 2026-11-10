import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { defaultLabels, modelCorrection, modelShape, symmetryRotation, topIndex, valueOnTop } from '../src/dice3d/geometry';

const SIDES = [4, 6, 8, 10, 12, 20];

describe('model dice layouts', () => {
	it('every face gets a distinct value 1..n', () => {
		for (const n of SIDES) {
			const s = modelShape(n)!;
			const labels = defaultLabels(s).slice().sort((a, b) => a - b);
			expect(labels, `d${n}`).toEqual(Array.from({ length: n }, (_, i) => i + 1));
		}
	});

	it('symmetries map the die onto itself and carry one face to another', () => {
		for (const n of SIDES) {
			const s = modelShape(n)!;
			const dirs = s.vertexValues ? s.vertices.map(v => v.clone().normalize()) : s.faces.map(f => f.normal);
			for (let a = 0; a < dirs.length; a++) for (let b = 0; b < dirs.length; b++) {
				const q = symmetryRotation(s, a, b);
				expect(dirs[a].clone().applyQuaternion(q).distanceTo(dirs[b]), `d${n} ${a}->${b}`).toBeLessThan(1e-5);
				for (const v of s.vertices) {
					const p = v.clone().applyQuaternion(q);
					expect(s.vertices.some(w => w.distanceTo(p) < 1e-4), `d${n} ${a}->${b} keeps corners`).toBe(true);
				}
			}
		}
	});

	it('the corrected model shows the rolled value, whatever pose physics left it in', () => {
		for (const n of SIDES) {
			const s = modelShape(n)!;
			for (let trial = 0; trial < 40; trial++) {
				// A resting pose: some face (d4: corner) straight up, random yaw.
				const idx = trial % (s.vertexValues ? 4 : n);
				const dir = s.vertexValues ? s.vertices[idx].clone().normalize() : s.faces[idx].normal.clone();
				const pose = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), trial * 0.7).multiply(new Quaternion().setFromUnitVectors(dir, new Vector3(0, 1, 0)));
				const value = 1 + (trial * 7) % n;
				const shown = pose.clone().multiply(modelCorrection(s, pose, value));
				expect(valueOnTop(s, shown), `d${n} pose ${idx} → ${value}`).toBe(value);
				// And the body's silhouette doesn't change: same top direction as physics.
				expect(topIndex(s, shown).dot).toBeGreaterThan(0.999);
			}
		}
	});
});
