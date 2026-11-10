// Effects for how a roll went: a gold shockwave as a crit die bursts out, a
// red ring along the table under a die that missed, a starburst for a natural
// max…
//
// Built the way game hit effects are: a few short layers, each with one job,
// staggered by a frame or two rather than all firing at once.
//   shockwave  a ring drawn in a shader: thick, easing out fast, ending hairline
//   flash      one soft sprite for ~85 ms (crits only; a miss gets no flash)
//   streaks    sparks stretched along their velocity, hot head, tapered tail
//   motes      soft particles with their own size, alpha and colour over life
// Sizes, lifetimes, speeds and angles are all randomised, fades are fast in
// and slow out, and colour cools over life (core → bright → mid → deep).
//
// Blending: premultiplied "blend-add" (as in Diablo III's effects). The shader
// writes rgb·a and a·solid: with solid near 0 a pixel adds light (a glow on a
// dark theme), with solid 1 it covers like paint (reads on a white page, where
// pure additive light disappears). Light themes also get a dark rim on
// particles and a soft shadow under the ring, so shapes hold against white.

import {
	BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, InstancedBufferAttribute, InstancedBufferGeometry,
	Mesh, NormalBlending, Object3D, PlaneGeometry, Points, ShaderMaterial, Texture, Vector3,
} from 'three';
import type { EffectId } from './styles';

export interface Burst {
	object: Object3D;
	/** Advance to `t` ms after the burst started. Returns false once it's done. */
	update(t: number): boolean;
	dispose(): void;
}

/** Colour stops over an effect's life, hottest first, plus the rim/shadow colour. */
export interface Palette { core: Color; bright: Color; mid: Color; deep: Color; rim: Color }

export interface BurstOptions {
	palette: Palette;
	/** Dark theme: layers glow. Light theme: layers cover, with dark rims. */
	dark: boolean;
	/** Screen pixels per world unit, so particle sizes match the dice. */
	pxPerUnit: number;
	/** A crit or max (flash, sparks and embers rise) rather than a miss (stays low on the table). */
	rising?: boolean;
}

const pal = (core: string, bright: string, mid: string, deep: string, rim: string): Palette =>
	({ core: new Color(core), bright: new Color(bright), mid: new Color(mid), deep: new Color(deep), rim: new Color(rim) });

/** Event colours per theme. On white, value contrast does the work: no pale cores, a dark rim carries the shape. */
export const EVENT_PALETTES: Record<'crit' | 'miss' | 'max' | 'min', { dark: Palette; light: Palette }> = {
	crit: { dark: pal('#fff6d5', '#ffd24a', '#f2a900', '#c77700', '#7a3e00'), light: pal('#ffcc33', '#f0b000', '#cf9700', '#9a6400', '#5c3a00') },
	miss: { dark: pal('#ffb8ad', '#ff4d3d', '#e02424', '#a3121c', '#4a0710'), light: pal('#f03a2e', '#d11f1f', '#a8121b', '#6e0a12', '#3d0509') },
	max: { dark: pal('#fff6d5', '#ffd24a', '#f2a900', '#c77700', '#7a3e00'), light: pal('#ffcc33', '#f0b000', '#cf9700', '#9a6400', '#5c3a00') },
	min: { dark: pal('#eadcff', '#a77bff', '#7c4ddb', '#4b2591', '#24104a'), light: pal('#8f5cf0', '#7440e0', '#5a2bc0', '#3b1886', '#1f0b4a') },
};

/** A palette from one colour (effects that take the die's colour). */
export function paletteFrom(hex: string, dark = true): Palette {
	const b = new Color(hex);
	const white = new Color('#ffffff'), black = new Color('#000000');
	return dark
		? { core: b.clone().lerp(white, 0.75), bright: b.clone().lerp(white, 0.3), mid: b.clone(), deep: b.clone().lerp(black, 0.4), rim: b.clone().lerp(black, 0.7) }
		: { core: b.clone().lerp(white, 0.15), bright: b.clone(), mid: b.clone().lerp(black, 0.15), deep: b.clone().lerp(black, 0.45), rim: b.clone().lerp(black, 0.7) };
}

/** Colour at age u along core → bright → mid → deep. */
function ramp(p: Palette, u: number, out: Color): Color {
	const stops = [p.core, p.bright, p.mid, p.deep];
	const x = Math.max(0, Math.min(0.999, u)) * (stops.length - 1);
	const i = Math.floor(x);
	return out.copy(stops[i]).lerp(stops[i + 1], x - i);
}

const easeInQuad = (x: number) => x * x;
const easeOutBack = (x: number) => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Value around `v`, ± `spread` (0.4 = ±40%). */
const vary = (v: number, spread: number) => v * (1 + (Math.random() * 2 - 1) * spread);
/** Particle alpha: quick fade in, long fall-off. */
const alphaCurve = (u: number) => clamp01(u / 0.08) * (1 - u) * (1 - u);
/** Particle size: pops to full in the first 10%, then shrinks toward `end`. */
const sizeCurve = (u: number, end: number, back = false) => (u < 0.1 ? (back ? easeOutBack(u / 0.1) : u / 0.1) : 1 - (1 - end) * easeInQuad((u - 0.1) / 0.9));

// ---------------------------------------------------------------------------
// Textures

const texCache = new Map<string, Texture>();

function canvasTex(key: string, draw: (g: CanvasRenderingContext2D, s: number) => void, size = 128): Texture {
	const hit = texCache.get(key);
	if (hit) return hit;
	const c = createEl('canvas');
	c.width = c.height = size;
	draw(c.getContext('2d')!, size);
	const t = new CanvasTexture(c);
	texCache.set(key, t);
	return t;
}

/** Soft round mote: Gaussian falloff, no hard edge. */
const softTex = () => canvasTex('soft', (g, s) => {
	const img = g.createImageData(s, s);
	for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
		const dx = (x + 0.5) / s * 2 - 1, dy = (y + 0.5) / s * 2 - 1;
		const d2 = dx * dx + dy * dy;
		const o = (y * s + x) * 4;
		img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
		img.data[o + 3] = Math.round(255 * Math.exp(-d2 * 4.5) * (d2 < 1 ? 1 : 0));
	}
	g.putImageData(img, 0, 0);
});

/** Four-point glint for starbursts. */
const glintTex = () => canvasTex('glint', (g, s) => {
	const c = s / 2;
	const core = g.createRadialGradient(c, c, 0, c, c, c * 0.3);
	core.addColorStop(0, 'rgba(255,255,255,1)');
	core.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = core;
	g.fillRect(0, 0, s, s);
	for (const [w, h] of [[s, s * 0.06], [s * 0.06, s]]) {
		const lg = g.createLinearGradient(w > h ? 0 : c, w > h ? c : 0, w > h ? s : c, w > h ? c : s);
		lg.addColorStop(0, 'rgba(255,255,255,0)');
		lg.addColorStop(0.5, 'rgba(255,255,255,0.95)');
		lg.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = lg;
		g.fillRect(c - w / 2, c - h / 2, w, h);
	}
});

/** Small rounded chip for confetti and shards. */
const chipTex = () => canvasTex('chip', (g, s) => {
	g.fillStyle = '#ffffff';
	g.beginPath();
	g.roundRect(s * 0.3, s * 0.38, s * 0.4, s * 0.24, s * 0.05);
	g.fill();
}, 64);

/** Free shared textures (when the 3D stage is torn down). */
export function disposeEffectSprites(): void {
	for (const t of texCache.values()) t.dispose();
	texCache.clear();
}

// ---------------------------------------------------------------------------
// Layers

interface Layer { object: Object3D; update(t: number): boolean; dispose(): void }

/** Material settings shared by every layer: premultiplied blend-add, no depth writes. */
const blendAdd = { transparent: true, depthWrite: false, premultipliedAlpha: true, blending: NormalBlending } as const;
/** How much a layer covers rather than adds light. */
const solidity = (o: BurstOptions, glow = true) => (o.dark ? (glow ? 0.3 : 0.85) : 1);

const SHOCK_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SHOCK_FRAG = /* glsl */`
uniform float uT;       // age 0..1
uniform float uSeed;
uniform float uW0;      // starting band width (fraction of radius)
uniform float uFill;    // faint glow inside the ring
uniform vec3 uCore;
uniform vec3 uEdge;
uniform float uAlpha;
uniform float uSolid;
varying vec2 vUv;
void main() {
	vec2 q = vUv * 2.0 - 1.0;
	float ang = atan(q.y, q.x);
	// Low-frequency wobble so it isn't a compass-drawn circle.
	float n = (sin(ang * 3.0 + uSeed) * 0.55 + sin(ang * 7.0 - uSeed * 1.3) * 0.3 + sin(ang * 13.0 + uSeed * 2.1) * 0.15) * 0.022;
	float d = length(q) + n * (1.0 - uT);
	float r = 1.0 - pow(2.0, -10.0 * uT);                              // ease-out expo
	float w = mix(uW0, 0.03, 1.0 - pow(1.0 - uT, 3.0));                // thick → hairline
	float band = smoothstep(r - w, r, d) * (1.0 - smoothstep(r, r + w * 0.25, d));   // soft inside, crisp outer edge
	float fill = (1.0 - smoothstep(0.0, max(r, 0.001), d)) * uFill * (1.0 - uT) * (1.0 - uT);
	float a = (band + fill) * (1.0 - smoothstep(0.6, 1.0, uT)) * uAlpha;           // hold, then fade over the last 40%
	vec3 col = mix(uEdge, uCore, clamp(band * (1.0 - uT * 1.3), 0.0, 1.0));
	gl_FragColor = vec4(col * a, a * uSolid);
}`;

interface ShockSpec { radius: number; life: number; width: number; fill: number; delay?: number; alpha?: number }

/** A ring that bursts outward along the table from under the die. */
function shockwave(at: Vector3, p: Palette, o: BurstOptions, s: ShockSpec, colors?: { core: Color; edge: Color; solid: number; order?: number; scale?: number }): Layer {
	const mat = new ShaderMaterial({
		vertexShader: SHOCK_VERT, fragmentShader: SHOCK_FRAG, ...blendAdd,
		uniforms: {
			// No inner glow on a light theme: on white it reads as a milky wash over the note.
			uT: { value: 0 }, uSeed: { value: Math.random() * 6.28 }, uW0: { value: s.width }, uFill: { value: o.dark ? s.fill : 0 },
			uCore: { value: colors?.core ?? (o.dark ? p.core : p.core) }, uEdge: { value: colors?.edge ?? (o.dark ? p.mid : p.mid) },
			uAlpha: { value: s.alpha ?? 1 }, uSolid: { value: colors?.solid ?? solidity(o) },
		},
	});
	const mesh = new Mesh(new PlaneGeometry(2, 2), mat);
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.set(at.x, 0.04, at.z);
	mesh.scale.setScalar(s.radius * (colors?.scale ?? 1));
	mesh.renderOrder = colors?.order ?? 11;
	const delay = s.delay ?? 0;
	return {
		object: mesh,
		update(t) {
			const u = (t - delay) / s.life;
			mesh.visible = u >= 0 && u < 1;
			if (mesh.visible) mat.uniforms.uT.value = u;
			return u < 1;
		},
		dispose() { mesh.geometry.dispose(); mat.dispose(); },
	};
}

/** On a light theme, a soft dark ring under the shockwave so it holds against white. */
function shockShadow(at: Vector3, p: Palette, o: BurstOptions, s: ShockSpec): Layer | null {
	if (o.dark) return null;
	return shockwave(at, p, o, { ...s, width: s.width * 1.3, fill: 0, alpha: 0.16 }, { core: p.rim, edge: p.rim, solid: 1, order: 10, scale: 1.02 });
}

const STREAK_VERT = /* glsl */`
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec3 iColor;
attribute float iLen;
attribute float iWidth;
attribute float iAlpha;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
	vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
	vec3 dv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
	vec2 d = length(dv.xy) > 1e-5 ? normalize(dv.xy) : vec2(1.0, 0.0);
	vec2 n = vec2(-d.y, d.x);
	mv.xy += d * position.x * iLen + n * position.y * iWidth;
	vUv = position.xy + 0.5;
	vColor = iColor;
	vAlpha = iAlpha;
	gl_Position = projectionMatrix * mv;
}`;

const STREAK_FRAG = /* glsl */`
uniform vec3 uHead;
uniform vec3 uRim;
uniform float uRimAmt;
uniform float uSolid;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
	float across = abs(vUv.y - 0.5) * 2.0;
	float body = 1.0 - smoothstep(0.2, 1.0, across);
	// Tapered tail, brightest just behind a rounded head.
	float a = smoothstep(0.0, 0.8, vUv.x) * (1.0 - smoothstep(0.93, 1.0, vUv.x)) * body * vAlpha;
	vec3 col = mix(vColor, uHead, smoothstep(0.6, 1.0, vUv.x) * (1.0 - across));
	col = mix(col, uRim, uRimAmt * smoothstep(0.35, 1.0, across));
	gl_FragColor = vec4(col * a, a * uSolid);
}`;

interface StreakSpec { count: number; speed: number; up: number; life: number; gravity: number; drag: number; width: number; stretch: number; delay?: number }

/** Sparks stretched along their velocity: fast, hot at the head, cooling and thinning as they slow. */
function streaks(at: Vector3, p: Palette, o: BurstOptions, s: StreakSpec): Layer {
	const n = s.count;
	const quad = new PlaneGeometry(1, 1);
	const geo = new InstancedBufferGeometry();
	geo.index = quad.index;
	geo.setAttribute('position', quad.getAttribute('position'));
	geo.instanceCount = n;
	const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), col = new Float32Array(n * 3);
	const len = new Float32Array(n), wid = new Float32Array(n), alpha = new Float32Array(n), life = new Float32Array(n), w0 = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.52; // ±15°
		const sp = vary(s.speed, 0.4);
		pos.set([at.x + Math.cos(a) * 0.35, 0.55 + Math.random() * 0.35, at.z + Math.sin(a) * 0.35], i * 3);
		vel.set([Math.cos(a) * sp, vary(s.up, 0.4), Math.sin(a) * sp], i * 3);
		life[i] = vary(s.life, 0.3);
		w0[i] = vary(s.width, 0.4);
	}
	const attr = (name: string, arr: Float32Array, size: number) => { const b = new InstancedBufferAttribute(arr, size); geo.setAttribute(name, b); return b; };
	const aPos = attr('iPos', pos, 3), aVel = attr('iVel', vel, 3), aCol = attr('iColor', col, 3), aLen = attr('iLen', len, 1), aWid = attr('iWidth', wid, 1), aAlpha = attr('iAlpha', alpha, 1);
	const mat = new ShaderMaterial({
		vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG, ...blendAdd,
		uniforms: { uHead: { value: o.dark ? p.core : p.bright }, uRim: { value: p.rim }, uRimAmt: { value: o.dark ? 0 : 0.55 }, uSolid: { value: solidity(o) } },
	});
	const mesh = new Mesh(geo, mat);
	mesh.frustumCulled = false;
	mesh.renderOrder = 12;
	const delay = s.delay ?? 0;
	let last = 0;
	const c = new Color();
	return {
		object: mesh,
		update(t0) {
			const t = t0 - delay;
			if (t < 0) { mesh.visible = false; return true; }
			mesh.visible = true;
			const dt = Math.min(0.05, Math.max(0, t - last) / 1000);
			last = t;
			let alive = false;
			const damp = Math.exp(-s.drag * dt);
			for (let i = 0; i < n; i++) {
				const u = t / life[i];
				if (u >= 1) { alpha[i] = 0; continue; }
				alive = true;
				const k = i * 3;
				vel[k] *= damp; vel[k + 2] *= damp;
				vel[k + 1] = vel[k + 1] * damp + s.gravity * dt;
				pos[k] += vel[k] * dt; pos[k + 1] = Math.max(0.05, pos[k + 1] + vel[k + 1] * dt); pos[k + 2] += vel[k + 2] * dt;
				const speed = Math.hypot(vel[k], vel[k + 1], vel[k + 2]);
				wid[i] = w0[i] * (1 - 0.7 * u);
				len[i] = Math.min(1.5, speed * s.stretch) + wid[i];
				alpha[i] = alphaCurve(u) * 1.6;
				ramp(p, o.dark ? u : 0.25 + u * 0.75, c);
				col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
			}
			aPos.needsUpdate = aVel.needsUpdate = aCol.needsUpdate = aLen.needsUpdate = aWid.needsUpdate = aAlpha.needsUpdate = true;
			return alive;
		},
		dispose() { geo.dispose(); quad.dispose(); mat.dispose(); },
	};
}

const MOTE_VERT = /* glsl */`
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	gl_PointSize = aSize * uScale / -mv.z;
	vColor = aColor;
	vAlpha = aAlpha;
	gl_Position = projectionMatrix * mv;
}`;

const MOTE_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uRim;
uniform float uRimAmt;
uniform float uSolid;
varying vec3 vColor;
varying float vAlpha;
void main() {
	float t = texture2D(uMap, gl_PointCoord).a;
	float a = t * vAlpha;
	if (a < 0.004) discard;
	// Bright core, darker saturated rim (light themes): shapes read against white.
	vec3 col = mix(vColor, uRim, uRimAmt * (1.0 - smoothstep(0.15, 0.75, t)));
	gl_FragColor = vec4(col * a, a * uSolid);
}`;

interface MoteSpec {
	count: number;
	life: number;
	/** Start-time spread, ms. */
	stagger?: number;
	delay?: number;
	size: number;
	/** Size at end of life as a fraction of full (0.2 = shrinks to 20%). */
	endSize: number;
	/** Pop in with a little overshoot (embers). */
	pop?: boolean;
	gravity: number;
	drag: number;
	/** Sideways wander, units/s. */
	wander?: number;
	/** Brightness flicker (embers), 0..1. */
	flicker?: number;
	tex: () => Texture;
	/** Glow on dark themes (blend-add), or always cover (smoke, confetti). */
	glow?: boolean;
	alpha?: number;
	launch: (i: number, n: number) => { pos: [number, number, number]; vel: [number, number, number] };
	/** Colour at age u. Default: the palette ramp. */
	color?: (p: Palette, u: number, out: Color, seed: number) => void;
}

/** Soft particles, each with its own size, alpha and colour over life. */
function motes(at: Vector3, p: Palette, o: BurstOptions, s: MoteSpec): Layer {
	const n = s.count;
	const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), col = new Float32Array(n * 3);
	const size = new Float32Array(n), alpha = new Float32Array(n), life = new Float32Array(n), birth = new Float32Array(n), size0 = new Float32Array(n), seed = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const l = s.launch(i, n);
		pos.set([at.x + l.pos[0], l.pos[1], at.z + l.pos[2]], i * 3);
		vel.set(l.vel, i * 3);
		life[i] = vary(s.life, 0.3);
		birth[i] = (s.delay ?? 0) + Math.random() * (s.stagger ?? 0);
		size0[i] = vary(s.size, 0.4);
		seed[i] = Math.random() * 100;
	}
	const geo = new BufferGeometry();
	const aPos = new BufferAttribute(pos, 3), aCol = new BufferAttribute(col, 3), aSize = new BufferAttribute(size, 1), aAlpha = new BufferAttribute(alpha, 1);
	geo.setAttribute('position', aPos);
	geo.setAttribute('aColor', aCol);
	geo.setAttribute('aSize', aSize);
	geo.setAttribute('aAlpha', aAlpha);
	const glow = s.glow ?? true;
	const mat = new ShaderMaterial({
		vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, ...blendAdd,
		uniforms: {
			uMap: { value: s.tex() }, uScale: { value: o.pxPerUnit * 9 }, uRim: { value: p.rim },
			uRimAmt: { value: o.dark || !glow ? 0 : 0.6 }, uSolid: { value: solidity(o, glow) },
		},
	});
	const pts = new Points(geo, mat);
	pts.frustumCulled = false;
	pts.renderOrder = 13;
	let last = 0;
	const c = new Color();
	const peak = (s.alpha ?? 1) * 1.8;
	return {
		object: pts,
		update(t) {
			if (t < 0) { pts.visible = false; return true; }
			pts.visible = true;
			const dt = Math.min(0.05, Math.max(0, t - last) / 1000);
			last = t;
			const damp = Math.exp(-s.drag * dt);
			let alive = false;
			for (let i = 0; i < n; i++) {
				const age = t - birth[i];
				const u = age / life[i];
				if (u >= 1) { alpha[i] = 0; continue; }
				alive = true;
				if (age < 0) { alpha[i] = 0; continue; }
				const k = i * 3;
				vel[k] *= damp; vel[k + 2] *= damp;
				vel[k + 1] = vel[k + 1] * damp + s.gravity * dt;
				if (s.wander) {
					const w = s.wander * dt;
					vel[k] += Math.sin(t * 0.004 + seed[i]) * w;
					vel[k + 2] += Math.cos(t * 0.0037 + seed[i] * 1.3) * w;
				}
				pos[k] += vel[k] * dt; pos[k + 1] = Math.max(0.03, pos[k + 1] + vel[k + 1] * dt); pos[k + 2] += vel[k + 2] * dt;
				size[i] = size0[i] * sizeCurve(u, s.endSize, s.pop);
				const flick = s.flicker ? 1 - s.flicker * (0.5 + 0.5 * Math.sin(t * 0.03 + seed[i] * 7)) : 1;
				alpha[i] = Math.min(1, peak * alphaCurve(u)) * flick;
				if (s.color) s.color(p, u, c, seed[i]); else ramp(p, o.dark ? u : 0.2 + u * 0.8, c);
				col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
			}
			aPos.needsUpdate = aCol.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = true;
			return alive;
		},
		dispose() { geo.dispose(); mat.dispose(); },
	};
}

/** One soft bloom at the point of impact: very short, white-hot on dark, bright gold on light. */
function flash(at: Vector3, p: Palette, o: BurstOptions, size: number, life = 85): Layer {
	return motes(at, p, o, {
		count: 1, life, size, endSize: 0.6, gravity: 0, drag: 0, tex: softTex, alpha: o.dark ? 0.9 : 0.5,
		launch: () => ({ pos: [0, 0.7, 0], vel: [0, 0, 0] }),
		color: (pp, _u, out) => { out.copy(o.dark ? pp.core : pp.bright); },
	});
}

// ---------------------------------------------------------------------------
// Effects

function layersFor(kind: Exclude<EffectId, 'none'>, at: Vector3, p: Palette, o: BurstOptions): Layer[] {
	const L: (Layer | null)[] = [];
	switch (kind) {
		case 'ring': {
			if (o.rising) {
				// Crit: ring first, a frame of flash, then a few hot streaks, then embers drifting up.
				const ring: ShockSpec = { radius: 4.4, life: 420, width: 0.3, fill: 0.16 };
				L.push(shockShadow(at, p, o, ring), shockwave(at, p, o, ring), flash(at, p, o, 3.4));
				L.push(streaks(at, p, o, { count: 16, speed: 7, up: 8, life: 380, gravity: -24, drag: 2.2, width: 0.08, stretch: 0.07, delay: 25 }));
				L.push(motes(at, p, o, {
					count: 8, life: 780, delay: 50, stagger: 90, size: 0.2, endSize: 0.2, pop: true, gravity: 2.2, drag: 2.5, wander: 5, flicker: 0.35, tex: softTex,
					launch: () => { const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 0.6; return { pos: [Math.cos(a) * r, 0.5 + Math.random() * 0.5, Math.sin(a) * r], vel: [Math.cos(a) * vary(1.6, 0.4), vary(2.6, 0.4), Math.sin(a) * vary(1.6, 0.4)] }; },
				}));
			} else {
				// Miss: no flash. A ring at the die's base and low particles skidding out along the table,
				// darkening as they slow, then gone.
				const ring: ShockSpec = { radius: 3.8, life: 520, width: 0.32, fill: 0.1 };
				L.push(shockShadow(at, p, o, ring), shockwave(at, p, o, ring));
				L.push(motes(at, p, o, {
					count: 14, life: 560, stagger: 40, size: 0.26, endSize: 0.2, gravity: -1.5, drag: 5, tex: softTex,
					launch: (i, n) => {
						const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.52;
						const sp = vary(9, 0.4);
						return { pos: [Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55], vel: [Math.cos(a) * sp, 0.3, Math.sin(a) * sp] };
					},
					color: (pp, u, out) => { ramp(pp, 0.35 + u * 0.65, out); },
				}));
			}
			break;
		}
		case 'sparks':
			L.push(flash(at, p, o, 3), streaks(at, p, o, { count: 22, speed: 9, up: 7, life: 460, gravity: -26, drag: 1.8, width: 0.07, stretch: 0.07, delay: 20 }));
			L.push(motes(at, p, o, { count: 7, life: 800, delay: 60, stagger: 120, size: 0.16, endSize: 0.2, pop: true, gravity: 2.5, drag: 2, wander: 6, flicker: 0.35, tex: softTex,
				launch: () => ({ pos: [(Math.random() - 0.5) * 0.8, 0.6, (Math.random() - 0.5) * 0.8], vel: [(Math.random() - 0.5) * 3, vary(2.5, 0.4), (Math.random() - 0.5) * 3] }) }));
			break;
		case 'embers':
			L.push(flash(at, p, o, 2, 120));
			L.push(motes(at, p, o, { count: 18, life: 1300, stagger: 350, size: 0.16, endSize: 0.2, pop: true, gravity: 2.6, drag: 1.6, wander: 8, flicker: 0.4, tex: softTex,
				launch: () => { const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 0.7; return { pos: [Math.cos(a) * r, 0.3 + Math.random() * 0.5, Math.sin(a) * r], vel: [(Math.random() - 0.5) * 1.4, vary(2, 0.4), (Math.random() - 0.5) * 1.4] }; } }));
			break;
		case 'confetti':
			L.push(motes(at, p, o, { count: 46, life: 1700, stagger: 80, size: 0.26, endSize: 0.8, gravity: -9, drag: 2.2, wander: 10, tex: chipTex, glow: false, alpha: 0.6,
				color: (_p, _u, out, seed) => { out.set(['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#eab308'][Math.floor(seed) % 6]); },
				launch: () => { const a = Math.random() * Math.PI * 2, sp = vary(3.5, 0.4); return { pos: [0, 1, 0], vel: [Math.cos(a) * sp, vary(11, 0.3), Math.sin(a) * sp] }; } }));
			break;
		case 'stars': {
			const ring: ShockSpec = { radius: 4.2, life: 460, width: 0.14, fill: 0.08 };
			L.push(shockShadow(at, p, o, ring), shockwave(at, p, o, ring), flash(at, p, o, 3.6, 110));
			L.push(motes(at, p, o, { count: 9, life: 760, delay: 30, stagger: 160, size: 0.7, endSize: 0.2, pop: true, gravity: 0.6, drag: 2.6, tex: glintTex,
				launch: () => { const a = Math.random() * Math.PI * 2, sp = vary(3.5, 0.4); return { pos: [0, 0.6 + Math.random() * 0.8, 0], vel: [Math.cos(a) * sp, vary(1.5, 0.4), Math.sin(a) * sp] }; } }));
			break;
		}
		case 'smoke':
			L.push(motes(at, p, o, { count: 12, life: 1700, stagger: 160, size: 1.1, endSize: 2.4, gravity: 1.3, drag: 1.8, wander: 3, tex: softTex, glow: false, alpha: 0.22,
				color: (_p, u, out) => { out.set(o.dark ? '#a3a3a8' : '#5f5f66').lerp(new Color(o.dark ? '#5a5a60' : '#8c8c94'), u); },
				launch: () => { const a = Math.random() * Math.PI * 2; return { pos: [Math.cos(a) * 0.4, 0.4, Math.sin(a) * 0.4], vel: [Math.cos(a) * vary(0.9, 0.4), vary(1, 0.4), Math.sin(a) * vary(0.9, 0.4)] }; } }));
			break;
		case 'shatter':
			L.push(flash(at, p, o, 2, 80));
			L.push(motes(at, p, o, { count: 18, life: 900, size: 0.26, endSize: 0.6, gravity: -28, drag: 0.8, tex: chipTex, glow: false, alpha: 0.6,
				color: (pp, u, out) => { out.copy(pp.deep).lerp(pp.rim, 0.3 + u * 0.6); },
				launch: () => { const a = Math.random() * Math.PI * 2, sp = vary(5, 0.4); return { pos: [0, 0.7, 0], vel: [Math.cos(a) * sp, vary(7, 0.4), Math.sin(a) * sp] }; } }));
			break;
		case 'gloom': {
			const ring: ShockSpec = { radius: 3.4, life: 1000, width: 0.55, fill: 0.35, alpha: 0.7 };
			L.push(shockShadow(at, p, o, ring), shockwave(at, p, o, ring));
			L.push(motes(at, p, o, { count: 10, life: 1500, stagger: 200, size: 0.9, endSize: 2, gravity: 0.3, drag: 2.4, wander: 2, tex: softTex, glow: false, alpha: 0.25,
				launch: () => { const a = Math.random() * Math.PI * 2; return { pos: [Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5], vel: [Math.cos(a) * vary(1.4, 0.4), 0.2, Math.sin(a) * vary(1.4, 0.4)] }; } }));
			break;
		}
	}
	return L.filter((l): l is Layer => !!l);
}

/** A burst of `kind` at `at` (on the table). Null for 'none'. */
export function makeBurst(kind: EffectId, at: Vector3, o: BurstOptions): Burst | null {
	if (kind === 'none') return null;
	const layers = layersFor(kind, at, o.palette, o);
	if (!layers.length) return null;
	const group = new Group();
	for (const l of layers) group.add(l.object);
	return {
		object: group,
		update(t) {
			let alive = false;
			for (const l of layers) if (l.update(t)) alive = true;
			group.visible = t >= 0 && alive;
			return alive;
		},
		dispose() { for (const l of layers) l.dispose(); },
	};
}
