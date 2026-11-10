// Particle effects for how a roll went: sparks for a crit, smoke for a miss,
// a starburst when every die lands on its highest face, and so on. Each burst
// is one Points object that updates itself until it fades out.

import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, NormalBlending, Points, PointsMaterial, Texture, Vector3 } from 'three';
import type { EffectId } from './styles';

export interface Burst {
	object: Points;
	/** Advance to `t` ms after the burst started. Returns false once it's done. */
	update(t: number): boolean;
	dispose(): void;
}

interface Spec {
	count: number;
	life: number;
	size: number;
	grow?: number;
	additive: boolean;
	gravity: number;
	drag: number;
	sprite: 'soft' | 'square' | 'star' | 'shard';
	colors: (tint: Color) => Color[];
	launch: (rand: () => number) => { pos: [number, number, number]; vel: [number, number, number] };
}

const r2 = (rand: () => number) => rand() * 2 - 1;

const SPECS: Record<Exclude<EffectId, 'none'>, Spec> = {
	sparks: {
		count: 160, life: 1000, size: 0.34, additive: false, gravity: -26, drag: 0.6, sprite: 'soft',
		colors: (t) => [new Color('#ffb000'), new Color('#ff7a00'), new Color('#ff3d00'), new Color('#ffd23f'), t],
		launch: (rand) => {
			const a = rand() * Math.PI * 2, up = 0.3 + rand() * 0.9, sp = 7 + rand() * 9;
			return { pos: [r2(rand) * 0.3, 0.8, r2(rand) * 0.3], vel: [Math.cos(a) * sp * (1 - up * 0.5), up * sp, Math.sin(a) * sp * (1 - up * 0.5)] };
		},
	},
	embers: {
		count: 100, life: 1700, size: 0.28, additive: false, gravity: 3.5, drag: 1.4, sprite: 'soft',
		colors: (t) => [new Color('#ff6a00'), new Color('#ff9f1c'), new Color('#e63000'), t],
		launch: (rand) => ({ pos: [r2(rand) * 0.9, 0.3 + rand() * 0.8, r2(rand) * 0.9], vel: [r2(rand) * 1.5, 2 + rand() * 3, r2(rand) * 1.5] }),
	},
	confetti: {
		count: 120, life: 1900, size: 0.24, additive: false, gravity: -14, drag: 1.8, sprite: 'square',
		colors: (t) => ['#ff5f6d', '#ffc371', '#47e891', '#3fa7ff', '#a76bff', '#ffffff'].map(c => new Color(c)).concat(t),
		launch: (rand) => {
			const a = rand() * Math.PI * 2, sp = 3 + rand() * 6;
			return { pos: [r2(rand) * 0.4, 1, r2(rand) * 0.4], vel: [Math.cos(a) * sp, 9 + rand() * 7, Math.sin(a) * sp] };
		},
	},
	stars: {
		count: 80, life: 1200, size: 0.5, additive: false, gravity: -4, drag: 1.2, sprite: 'star',
		colors: (t) => [new Color('#ffc400'), new Color('#ff9500'), new Color('#7c3aed'), t],
		launch: (rand) => {
			const a = rand() * Math.PI * 2, sp = 5 + rand() * 6;
			return { pos: [0, 0.9, 0], vel: [Math.cos(a) * sp, 1 + rand() * 4, Math.sin(a) * sp] };
		},
	},
	smoke: {
		count: 46, life: 1700, size: 1.0, grow: 2.4, additive: false, gravity: 2.6, drag: 1.6, sprite: 'soft',
		colors: () => [new Color('#6b6b6b'), new Color('#8a8a8a'), new Color('#4a4a4a')],
		launch: (rand) => ({ pos: [r2(rand) * 0.5, 0.6 + rand() * 0.5, r2(rand) * 0.5], vel: [r2(rand) * 1.4, 1.5 + rand() * 2, r2(rand) * 1.4] }),
	},
	shatter: {
		count: 70, life: 1200, size: 0.26, additive: false, gravity: -30, drag: 0.5, sprite: 'shard',
		colors: (t) => [new Color('#1c1b1f'), new Color('#3a3840'), t.clone().multiplyScalar(0.6)],
		launch: (rand) => {
			const a = rand() * Math.PI * 2, sp = 4 + rand() * 7;
			return { pos: [r2(rand) * 0.4, 0.7 + rand() * 0.4, r2(rand) * 0.4], vel: [Math.cos(a) * sp, 4 + rand() * 6, Math.sin(a) * sp] };
		},
	},
	gloom: {
		count: 60, life: 1900, size: 1.1, grow: 1.8, additive: false, gravity: 0.4, drag: 2.2, sprite: 'soft',
		colors: () => [new Color('#2a1b3d'), new Color('#1b1230'), new Color('#3d2456')],
		launch: (rand) => {
			const a = rand() * Math.PI * 2, sp = 2 + rand() * 3;
			return { pos: [0, 0.25, 0], vel: [Math.cos(a) * sp, rand() * 0.6, Math.sin(a) * sp] };
		},
	},
};

const spriteCache = new Map<string, Texture>();

function sprite(kind: Spec['sprite']): Texture {
	const hit = spriteCache.get(kind);
	if (hit) return hit;
	const c = createEl('canvas');
	c.width = c.height = 64;
	const g = c.getContext('2d')!;
	g.fillStyle = '#ffffff';
	if (kind === 'soft') {
		// A solid core with a soft edge: reads on a white page as well as a dark one.
		const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
		grad.addColorStop(0, 'rgba(255,255,255,1)');
		grad.addColorStop(0.55, 'rgba(255,255,255,0.95)');
		grad.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = grad;
		g.fillRect(0, 0, 64, 64);
	} else if (kind === 'square') {
		g.fillRect(16, 22, 32, 20);
	} else if (kind === 'star') {
		g.beginPath();
		for (let i = 0; i < 10; i++) {
			const a = (Math.PI / 5) * i - Math.PI / 2, rad = i % 2 ? 11 : 30;
			g.lineTo(32 + Math.cos(a) * rad, 32 + Math.sin(a) * rad);
		}
		g.closePath();
		g.fill();
	} else {
		g.beginPath();
		g.moveTo(30, 6); g.lineTo(50, 40); g.lineTo(24, 58); g.lineTo(12, 30);
		g.closePath();
		g.fill();
	}
	const tex = new CanvasTexture(c);
	spriteCache.set(kind, tex);
	return tex;
}

/** Free the shared sprite textures (when the 3D stage is torn down). */
export function disposeEffectSprites(): void {
	for (const t of spriteCache.values()) t.dispose();
	spriteCache.clear();
}

/** A burst of `kind` at `at` (on the table), tinted toward `tint`. Null for 'none'. */
export function makeBurst(kind: EffectId, at: Vector3, tint: string): Burst | null {
	if (kind === 'none') return null;
	const spec = SPECS[kind];
	if (!spec) return null;
	const rand = Math.random;
	const n = spec.count;
	const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), col = new Float32Array(n * 3);
	const palette = spec.colors(new Color(tint));
	for (let i = 0; i < n; i++) {
		const l = spec.launch(rand);
		pos.set([at.x + l.pos[0], at.y + l.pos[1], at.z + l.pos[2]], i * 3);
		vel.set(l.vel, i * 3);
		const c = palette[Math.floor(rand() * palette.length)];
		col.set([c.r, c.g, c.b], i * 3);
	}
	const geo = new BufferGeometry();
	const posAttr = new BufferAttribute(pos, 3);
	geo.setAttribute('position', posAttr);
	geo.setAttribute('color', new BufferAttribute(col, 3));
	const mat = new PointsMaterial({
		size: spec.size, map: sprite(spec.sprite), vertexColors: true, transparent: true, depthWrite: false,
		blending: spec.additive ? AdditiveBlending : NormalBlending, opacity: spec.additive ? 1 : 0.95, sizeAttenuation: true,
	});
	const object = new Points(geo, mat);
	object.frustumCulled = false;
	object.renderOrder = 10;
	let last = 0;
	return {
		object,
		update(t: number) {
			const u = t / spec.life;
			if (u >= 1) { object.visible = false; return false; }
			object.visible = t >= 0;
			if (t < 0) return true;
			const dt = Math.min(0.05, (t - last) / 1000);
			last = t;
			const damp = Math.exp(-spec.drag * dt);
			for (let i = 0; i < n; i++) {
				const o = i * 3;
				vel[o] *= damp; vel[o + 2] *= damp;
				vel[o + 1] = vel[o + 1] * damp + spec.gravity * dt;
				pos[o] += vel[o] * dt; pos[o + 1] = Math.max(0.05, pos[o + 1] + vel[o + 1] * dt); pos[o + 2] += vel[o + 2] * dt;
			}
			posAttr.needsUpdate = true;
			mat.opacity = (spec.additive ? 1 : 0.95) * (u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3);
			if (spec.grow) mat.size = spec.size * (1 + spec.grow * u);
			return true;
		},
		dispose() {
			geo.dispose();
			mat.dispose();
		},
	};
}
