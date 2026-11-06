// The 3D dice renderer. Bundled separately (three.js and cannon-es are big) and
// loaded on the first roll; see index.ts.
//
// Every throw is real physics, so dice land somewhere new each time, bounce off
// each other and the screen edges, and tumble naturally. The result is still
// decided beforehand by our roller: we simulate the throw invisibly first
// (a few milliseconds), see which face each die lands on, renumber that die's
// faces so the landed face shows the rolled value, and then replay the throw.
// Nimble crits explode: each extra die pops out of the last one as its own
// short simulation, with the dice already on the table as obstacles.

import {
	Body, Box, ContactMaterial, ConvexPolyhedron, Material as PhysMaterial, Plane, Quaternion as CQuat, Shape, Vec3, World,
} from 'cannon-es';
import {
	AmbientLight, BackSide, BufferGeometry, CanvasTexture, Color, DirectionalLight, DoubleSide, EdgesGeometry, Float32BufferAttribute,
	FrontSide, Group, LineBasicMaterial, LineSegments, Material, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
	PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Quaternion, Scene, ShadowMaterial, SRGBColorSpace, Texture,
	Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { defaultLabels, dieShape, DieShape, relabel, topIndex } from './geometry';
import { ANIMATED, applyLook } from './shaders';

export type DiceMaterial = 'classic' | 'gem' | 'metal' | 'glitter' | 'lava' | 'frost' | 'nebula' | 'opal' | 'marble';
export interface Die3d { sides: number; value: number; role: 'primary' | 'normal' | 'explosion' }
export interface Dice3dOptions {
	primaryColor: string;
	diceColor: string;
	explosionColor?: string;
	/** Look for every die (default 'classic'). */
	material?: DiceMaterial;
	/** Per-role looks; each falls back to `material`. */
	materials?: { primary?: DiceMaterial; normal?: DiceMaterial; explosion?: DiceMaterial };
}

export interface RollStats {
	/** Time to create the 3D stage (first roll after a while) or reuse it. */
	stageMs: number;
	/** Time spent simulating the throw before anything moves on screen. */
	simMs: number;
	/** Time from roll() to the first rendered frame (bundle already evaluated). */
	startMs: number;
	/** Time from roll() until every die (explosions included) has landed. */
	landedMs: number;
	frames: number;
	avgFrameMs: number;
	p95FrameMs: number;
	/** CPU time spent in update + render per frame. */
	avgWorkMs: number;
	p95WorkMs: number;
	/** Physics throws re-done because a die came to rest tilted against something. */
	retries: number;
	/** What each die shows on top as drawn when it landed (should equal the rolled values). */
	shown: number[];
	/** Every die stayed on the table: inside the walls and above the floor, the whole throw. */
	inBounds: boolean;
	/** Furthest a die's centre got past a wall or below the floor (≤ 0 means never touched it). */
	overshoot: number;
	/** Length of each recorded segment (throw, then each explosion), in ms of playback. */
	segmentsMs: number[];
}

export const stats: { last: RollStats | null } = { last: null };

const MAX_DICE = 12;
const CELL = 128;
const STEP = 1 / 60;
// A throw that hasn't settled by 3.5 s is damped to a stop well before this; it's a safety net.
const MAX_STEPS = Math.round(3.5 * 60);
const GRAVITY = 55;

// ---------------------------------------------------------------------------
// Textures

function luminance(hex: string): number {
	const c = new Color(hex);
	return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
function shade(hex: string, k: number): string {
	return `#${new Color(hex).multiplyScalar(k).getHexString()}`;
}

const FONT_SCALE: Record<number, number> = { 4: 0.2, 6: 0.46, 8: 0.34, 10: 0.32, 12: 0.34, 20: 0.28 };

/** Local axes for drawing a face's number: which way is "up" on the face. */
function faceAxes(shape: DieShape, fi: number): { up: Vector3; right: Vector3 } {
	const f = shape.faces[fi];
	const vs = f.verts.map(i => shape.vertices[i]);
	let target: Vector3;
	if (shape.sides === 6) target = vs[0].clone().add(vs[1]).multiplyScalar(0.5);
	else if (shape.sides === 10) target = vs.reduce((a, b) => (Math.abs(b.y) > Math.abs(a.y) ? b : a));
	else target = vs[0];
	const up = target.clone().sub(f.centroid);
	up.sub(f.normal.clone().multiplyScalar(up.dot(f.normal))).normalize();
	const right = new Vector3().crossVectors(up, f.normal).normalize();
	return { up, right };
}

function atlasGrid(shape: DieShape) {
	const n = shape.faces.length;
	const cols = Math.ceil(Math.sqrt(n));
	return { cols, rows: Math.ceil(n / cols) };
}

/** The die's body colour, one cell per face (a soft lighter centre so faces read as surfaces). */
function bodyAtlas(shape: DieShape, color: string): CanvasTexture {
	const { cols, rows } = atlasGrid(shape);
	const canvas = createEl('canvas');
	canvas.width = cols * CELL;
	canvas.height = rows * CELL;
	const g = canvas.getContext('2d')!;
	shape.faces.forEach((_, i) => {
		const x0 = (i % cols) * CELL, y0 = Math.floor(i / cols) * CELL;
		const grad = g.createRadialGradient(x0 + CELL / 2, y0 + CELL / 2, 4, x0 + CELL / 2, y0 + CELL / 2, CELL * 0.75);
		grad.addColorStop(0, shade(color, 1.1));
		grad.addColorStop(1, shade(color, 0.88));
		g.fillStyle = grad;
		g.fillRect(x0, y0, CELL, CELL);
	});
	const tex = new CanvasTexture(canvas);
	tex.colorSpace = SRGBColorSpace;
	return tex;
}

type Ink = { fill: string; stroke: string | null; engrave?: boolean };

function inkFor(material: DiceMaterial, color: string): Ink {
	const light = luminance(color) > 0.55;
	if (material === 'gem') return light ? { fill: '#1b1814', stroke: 'rgba(255,255,255,0.7)' } : { fill: '#ffffff', stroke: 'rgba(0,0,0,0.55)' };
	if (material === 'metal') return { fill: light ? '#2a2724' : '#f4efe6', stroke: null, engrave: true };
	// Dark or busy surfaces: warm light numbers with a dark edge, so they read over cracks and stars.
	if (material === 'lava') return { fill: '#fff1d6', stroke: 'rgba(20,8,0,0.85)' };
	if (material === 'nebula') return { fill: '#ffffff', stroke: 'rgba(0,0,0,0.75)' };
	// Pale surfaces: dark numbers with a light edge.
	if (material === 'frost') return { fill: '#0f2238', stroke: 'rgba(255,255,255,0.75)' };
	if (material === 'opal' || material === 'marble') return { fill: '#1d1a17', stroke: 'rgba(255,255,255,0.6)' };
	return { fill: light ? '#1d1a17' : '#fbf8f2', stroke: light ? null : 'rgba(0,0,0,0.25)' };
}

/** The numbers, on a transparent atlas, using this die's own labels. */
function numberAtlas(shape: DieShape, labels: number[], ink: Ink): CanvasTexture {
	const { cols, rows } = atlasGrid(shape);
	const canvas = createEl('canvas');
	canvas.width = cols * CELL;
	canvas.height = rows * CELL;
	const g = canvas.getContext('2d')!;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.lineJoin = 'round';
	const font = FONT_SCALE[shape.sides] ?? 0.3;
	const draw = (text: string, cx: number, cy: number, angle: number, size: number) => {
		g.save();
		g.translate(cx, cy);
		g.rotate(angle);
		g.font = `800 ${Math.round(size)}px "Inter", "Helvetica Neue", Arial, sans-serif`;
		const y = size * 0.04;
		const underline = text === '6' || text === '9';
		const bar = () => g.fillRect(-size * 0.22, size * 0.42, size * 0.44, Math.max(2, size * 0.07));
		if (ink.engrave) {
			// Engraved: a light lip below, a dark cut above.
			g.fillStyle = 'rgba(255,255,255,0.55)';
			g.fillText(text, 0, y + 2);
			if (underline) { g.save(); g.translate(0, 2); bar(); g.restore(); }
		}
		if (ink.stroke) {
			g.strokeStyle = ink.stroke;
			g.lineWidth = Math.max(2, size * 0.1);
			g.strokeText(text, 0, y);
		}
		g.fillStyle = ink.fill;
		g.fillText(text, 0, y);
		if (underline) bar();
		g.restore();
	};
	shape.faces.forEach((f, i) => {
		const x0 = (i % cols) * CELL, y0 = Math.floor(i / cols) * CELL;
		if (shape.vertexValues) {
			// d4: a number near each corner, pointing at it. The top corner is the result.
			const { up, right } = faceAxes(shape, i);
			const R = Math.max(...f.verts.map(v => shape.vertices[v].distanceTo(f.centroid)));
			for (const vi of f.verts) {
				const p = shape.vertices[vi].clone().sub(f.centroid);
				const x = p.dot(right) / (2 * R * 1.04), y = p.dot(up) / (2 * R * 1.04);
				draw(String(labels[vi]), x0 + (0.5 + x * 0.62) * CELL, y0 + (0.5 - y * 0.62) * CELL, Math.atan2(x, y), CELL * font * 1.4);
			}
		} else {
			draw(String(labels[i]), x0 + CELL / 2, y0 + CELL / 2 + (shape.sides === 10 ? CELL * 0.06 : 0), 0, CELL * font);
		}
	});
	const tex = new CanvasTexture(canvas);
	tex.colorSpace = SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

interface Built { geometry: BufferGeometry; edges: EdgesGeometry }
const geometryCache = new Map<number, Built>();

function buildGeometry(shape: DieShape): Built {
	const hit = geometryCache.get(shape.sides);
	if (hit) return hit;
	const { cols, rows } = atlasGrid(shape);
	const pos: number[] = [], nor: number[] = [], uv: number[] = [];
	shape.faces.forEach((f, i) => {
		const { up, right } = faceAxes(shape, i);
		const R = Math.max(...f.verts.map(v => shape.vertices[v].distanceTo(f.centroid)));
		const cx = (i % cols) / cols, cyTop = Math.floor(i / cols) / rows;
		const toUv = (p: Vector3): [number, number] => {
			const l = p.clone().sub(f.centroid);
			const x = l.dot(right) / (2 * R * 1.04), y = l.dot(up) / (2 * R * 1.04);
			return [cx + (0.5 + x) / cols, 1 - (cyTop + (0.5 - y) / rows)];
		};
		for (let k = 1; k < f.verts.length - 1; k++) {
			for (const vi of [f.verts[0], f.verts[k], f.verts[k + 1]]) {
				const p = shape.vertices[vi];
				pos.push(p.x, p.y, p.z);
				nor.push(f.normal.x, f.normal.y, f.normal.z);
				uv.push(...toUv(p));
			}
		}
	});
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
	geometry.setAttribute('normal', new Float32BufferAttribute(nor, 3));
	geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
	const built = { geometry, edges: new EdgesGeometry(geometry, 10) };
	geometryCache.set(shape.sides, built);
	return built;
}

function ringTexture(): CanvasTexture {
	const c = createEl('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d')!;
	const grad = g.createRadialGradient(64, 64, 34, 64, 64, 62);
	grad.addColorStop(0, 'rgba(255,255,255,0)');
	grad.addColorStop(0.6, 'rgba(255,255,255,0.95)');
	grad.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, 128, 128);
	return new CanvasTexture(c);
}

// ---------------------------------------------------------------------------
// Materials

interface DieMeshes {
	group: Group;
	body: MeshPhysicalMaterial;
	materials: Material[];
	textures: Texture[];
}

function makeDieMeshes(shape: DieShape, labels: number[], color: string, material: DiceMaterial, time: { value: number }): DieMeshes {
	const built = buildGeometry(shape);
	const group = new Group();
	const materials: Material[] = [];
	const textures: Texture[] = [];
	let body: MeshPhysicalMaterial;
	if (material === 'gem') {
		// Glass you can see the note through: real transparency, strong reflections, a little rainbow sheen.
		const props = {
			color: new Color(color), roughness: 0.04, metalness: 0, transparent: true, opacity: 0.62,
			clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.75, iridescenceIOR: 1.35, specularIntensity: 1,
			emissive: new Color(color), emissiveIntensity: 0.12, envMapIntensity: 1.6,
		};
		const back = new MeshPhysicalMaterial({ ...props, side: BackSide, opacity: 0.5, depthWrite: false });
		body = new MeshPhysicalMaterial({ ...props, side: FrontSide, depthWrite: false });
		const backMesh = new Mesh(built.geometry, back);
		backMesh.renderOrder = 1;
		const front = new Mesh(built.geometry, body);
		front.renderOrder = 2;
		front.castShadow = true;
		group.add(backMesh, front);
		materials.push(back, body);
	} else {
		const tex = bodyAtlas(shape, color);
		textures.push(tex);
		body = material === 'metal'
			? new MeshPhysicalMaterial({ map: tex, metalness: 1, roughness: 0.24, clearcoat: 0.35, clearcoatRoughness: 0.1, envMapIntensity: 1.25 })
			: new MeshPhysicalMaterial({ map: tex, metalness: 0, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.16, envMapIntensity: 0.6 });
		// Procedural looks paint their own surface; the colour atlas is just the fallback.
		if (material !== 'classic' && material !== 'metal') applyLook(body, material, color, time);
		if (material === 'frost') body.depthWrite = false;
		const mesh = new Mesh(built.geometry, body);
		mesh.castShadow = true;
		group.add(mesh);
		materials.push(body);
		if (material === 'classic' || material === 'glitter') {
			const lineMat = new LineBasicMaterial({ color: shade(color, 0.55), transparent: true, opacity: 0.45 });
			group.add(new LineSegments(built.edges, lineMat));
			materials.push(lineMat);
		}
	}
	// Numbers ride on top as their own layer, so they stay crisp and readable on every material.
	const numbers = numberAtlas(shape, labels, inkFor(material, color));
	textures.push(numbers);
	const numMat = new MeshStandardMaterial({
		map: numbers, transparent: true, alphaTest: 0.35, depthWrite: false, roughness: 0.45, metalness: material === 'metal' ? 0.6 : 0,
		polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
	});
	const numMesh = new Mesh(built.geometry, numMat);
	numMesh.renderOrder = 3;
	group.add(numMesh);
	materials.push(numMat);
	return { group, body, materials, textures };
}

// ---------------------------------------------------------------------------
// The stage: one renderer, kept for a little while between rolls

interface Stage {
	renderer: WebGLRenderer;
	scene: Scene;
	camera: PerspectiveCamera;
	canvas: HTMLCanvasElement;
	sun: DirectionalLight;
	floor: Mesh;
	ringTex: CanvasTexture;
	env: Texture;
	pxPerUnit: number;
}

let stage: Stage | null = null;
let idleTimer: number | null = null;
let fadeTimer: number | null = null;
let current: { cancel: () => void } | null = null;

function getStage(): Stage {
	if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = null; }
	if (stage) return stage;
	const canvas = createEl('canvas');
	canvas.className = 'nimble-dice3d-overlay'; // full-window, click-through; see styles.css
	const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: (window.devicePixelRatio || 1) < 2, powerPreference: 'low-power', premultipliedAlpha: true });
	renderer.setClearColor(0x000000, 0);
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFSoftShadowMap;
	const scene = new Scene();
	// Reflections come from a soft studio environment, so metal and clearcoat catch real highlights.
	const pmrem = new PMREMGenerator(renderer);
	const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	pmrem.dispose();
	scene.environment = env;
	scene.environmentIntensity = 0.55;
	scene.add(new AmbientLight(0xffffff, 0.35));
	const sun = new DirectionalLight(0xffffff, 2.1);
	sun.position.set(-6, 14, 7);
	sun.castShadow = true;
	sun.shadow.mapSize.set(1024, 1024);
	sun.shadow.radius = 5;
	sun.shadow.bias = -0.0006;
	scene.add(sun, sun.target);
	const floor = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ opacity: 0.22, transparent: true }));
	floor.rotation.x = -Math.PI / 2;
	floor.receiveShadow = true;
	scene.add(floor);
	const camera = new PerspectiveCamera(32, 1, 0.1, 200);
	stage = { renderer, scene, camera, canvas, sun, floor, ringTex: ringTexture(), env, pxPerUnit: 36 };
	return stage;
}

function resize(s: Stage): void {
	const w = window.innerWidth, h = window.innerHeight;
	s.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
	s.renderer.setSize(w, h, false);
	s.camera.aspect = w / h;
	// A die (radius 1) is about 2 × pxPerUnit pixels across, whatever the window size.
	s.pxPerUnit = Math.max(26, Math.min(40, Math.min(w, h) / 16));
	const fov = (s.camera.fov * Math.PI) / 180;
	const dist = (h / 2) / (Math.tan(fov / 2) * s.pxPerUnit);
	const elev = (78 * Math.PI) / 180;
	s.camera.position.set(0, dist * Math.sin(elev), dist * Math.cos(elev));
	s.camera.lookAt(0, 0, 0);
	s.camera.updateProjectionMatrix();
	const ext = floorExtent(s);
	s.floor.scale.set(ext.x * 2 + 4, ext.z * 2 + 4, 1);
	const cam = s.sun.shadow.camera;
	cam.left = -ext.x - 2; cam.right = ext.x + 2; cam.top = ext.z + 2; cam.bottom = -ext.z - 2;
	cam.near = 1; cam.far = 40;
	cam.updateProjectionMatrix();
}

/**
 * Half-width and half-depth of the table the dice can use: the middle of the
 * screen, not the whole window, so the result lands as one readable cluster.
 */
function floorExtent(s: Stage): { x: number; z: number } {
	return {
		x: Math.min((window.innerWidth / 2) / s.pxPerUnit * 0.9, 9),
		z: Math.min((window.innerHeight / 2) / s.pxPerUnit * 0.82, 6.5),
	};
}

function teardown(): void {
	if (!stage) return;
	stage.renderer.dispose();
	stage.renderer.forceContextLoss();
	stage.canvas.remove();
	stage.ringTex.dispose();
	stage.env.dispose();
	(stage.floor.material as Material).dispose();
	stage.floor.geometry.dispose();
	for (const b of geometryCache.values()) { b.geometry.dispose(); b.edges.dispose(); }
	geometryCache.clear();
	stage = null;
}

// ---------------------------------------------------------------------------
// Physics: simulate a throw headlessly and record it

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function physShape(shape: DieShape): Shape {
	if (shape.sides === 6) { const h = 1 / Math.sqrt(3); return new Box(new Vec3(h, h, h)); }
	return new ConvexPolyhedron({
		vertices: shape.vertices.map(v => new Vec3(v.x, v.y, v.z)),
		faces: shape.faces.map(f => f.verts.slice()),
	});
}

interface Table { world: World; dieMat: PhysMaterial }

function makeTable(ext: { x: number; z: number }): Table {
	const world = new World({ gravity: new Vec3(0, -GRAVITY, 0), allowSleep: true });
	(world.solver as unknown as { iterations: number }).iterations = 10;
	const dieMat = new PhysMaterial('die');
	const floorMat = new PhysMaterial('floor');
	const wallMat = new PhysMaterial('wall');
	world.addContactMaterial(new ContactMaterial(dieMat, floorMat, { friction: 0.32, restitution: 0.38 }));
	world.addContactMaterial(new ContactMaterial(dieMat, wallMat, { friction: 0.05, restitution: 0.62 }));
	world.addContactMaterial(new ContactMaterial(dieMat, dieMat, { friction: 0.12, restitution: 0.45 }));
	const plane = (mat: PhysMaterial, pos: Vec3, axis: Vec3, angle: number) => {
		const b = new Body({ mass: 0, material: mat, shape: new Plane() });
		b.position.copy(pos);
		b.quaternion.setFromAxisAngle(axis, angle);
		world.addBody(b);
	};
	// cannon's Plane faces +Z; turn each one to face into the table.
	plane(floorMat, new Vec3(0, 0, 0), new Vec3(1, 0, 0), -Math.PI / 2);
	plane(wallMat, new Vec3(-ext.x, 0, 0), new Vec3(0, 1, 0), Math.PI / 2);
	plane(wallMat, new Vec3(ext.x, 0, 0), new Vec3(0, 1, 0), -Math.PI / 2);
	plane(wallMat, new Vec3(0, 0, -ext.z), new Vec3(0, 1, 0), 0);
	plane(wallMat, new Vec3(0, 0, ext.z), new Vec3(0, 1, 0), Math.PI);
	plane(wallMat, new Vec3(0, 14, 0), new Vec3(1, 0, 0), Math.PI / 2);
	return { world, dieMat };
}

function dieBody(t: Table, shape: DieShape, mass = 1): Body {
	const b = new Body({
		mass, material: t.dieMat, shape: physShape(shape),
		// Round dice (d10, d12, d20) roll on like marbles; a little more rolling resistance settles them like real ones.
		linearDamping: 0.12, angularDamping: shape.sides >= 10 ? 0.32 : 0.18, allowSleep: true, sleepSpeedLimit: 0.25, sleepTimeLimit: 0.2,
	});
	t.world.addBody(b);
	return b;
}

/** A recorded throw: transforms for the moving dice, 60 per second. */
interface Segment {
	/** Indices (into the roll's dice) of the dice that move in this segment. */
	dice: number[];
	steps: number;
	/** steps × dice × 7 (x, y, z, qx, qy, qz, qw). */
	frames: Float32Array;
	/** Where an explosion pops from (shown as a ring), if this segment is one. */
	burstAt?: Vector3;
	/** Playback speed (explosions replay a little quicker so a crit chain stays snappy). */
	speed?: number;
}

interface Resting { pos: Vector3; quat: Quaternion }

/**
 * Run a world until every moving die is asleep (or the time cap), recording as we go.
 * Returns the recording and how tilted the worst die ended up (1 = perfectly flat).
 */
function record(t: Table, bodies: Body[], shapes: DieShape[], dampAt = 100): { steps: number; frames: Float32Array; flatness: number } {
	const n = bodies.length;
	const buf = new Float32Array(MAX_STEPS * n * 7);
	let steps = 0;
	// A die is at rest after CALM_STEPS quiet steps in a row (cannon's own sleep can
	// miss a die that keeps micro-jittering against a wall or another die).
	const CALM_STEPS = 15;
	const calm = new Array<number>(n).fill(0);
	for (; steps < MAX_STEPS; steps++) {
		// Past ~2 s, damp hard so a straggler stops rocking instead of holding up the roll.
		if (steps === dampAt) for (const b of bodies) { b.linearDamping = 0.9; b.angularDamping = 0.95; }
		t.world.step(STEP);
		for (let i = 0; i < n; i++) {
			const b = bodies[i], o = (steps * n + i) * 7;
			buf[o] = b.position.x; buf[o + 1] = b.position.y; buf[o + 2] = b.position.z;
			buf[o + 3] = b.quaternion.x; buf[o + 4] = b.quaternion.y; buf[o + 5] = b.quaternion.z; buf[o + 6] = b.quaternion.w;
		}
		for (let i = 0; i < n; i++) {
			const b = bodies[i];
			const quiet = b.sleepState === Body.SLEEPING || (b.velocity.length() < 0.35 && b.angularVelocity.length() < 0.8);
			calm[i] = quiet ? calm[i] + 1 : 0;
		}
		if (steps > 20 && calm.every(c => c >= CALM_STEPS)) { steps++; break; }
	}
	let flatness = 1;
	bodies.forEach((b, i) => {
		const q = new Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
		flatness = Math.min(flatness, topIndex(shapes[i], q).dot);
	});
	return { steps, frames: buf.slice(0, steps * n * 7), flatness };
}

function lastPose(seg: Segment, k: number): Resting {
	const n = seg.dice.length, o = ((seg.steps - 1) * n + k) * 7, f = seg.frames;
	return { pos: new Vector3(f[o], f[o + 1], f[o + 2]), quat: new Quaternion(f[o + 3], f[o + 4], f[o + 5], f[o + 6]) };
}

/** The opening throw: all non-explosion dice in from a random edge. */
function simulateThrow(shapes: DieShape[], ext: { x: number; z: number }): { seg: Segment; flatness: number } {
	const t = makeTable(ext);
	// Throw from one edge (mostly the near or side edges, like a hand across the table).
	const edge = [0, 0, 1, 2, 3][Math.floor(Math.random() * 5)]; // 0 near, 1 right, 2 left, 3 far
	const inward = [new Vec3(0, 0, -1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0), new Vec3(0, 0, 1)][edge];
	const along = new Vec3(-inward.z, 0, inward.x);
	const halfAlong = edge === 1 || edge === 2 ? ext.z : ext.x;
	const back = edge === 1 || edge === 2 ? ext.x : ext.z;
	const start = new Vec3(-inward.x * (back - 1.6), 0, -inward.z * (back - 1.6));
	// Rows sized to fit along the edge, centred somewhere it still fits: no die starts in a wall or another die.
	const room = Math.max(0, halfAlong - 1.3);
	const fit = Math.max(1, Math.floor((room * 2) / 2.3) + 1);
	const target = new Vec3(rand(-0.3, 0.3) * ext.x, 0, rand(-0.3, 0.3) * ext.z);
	const perRow = Math.min(fit, Math.max(1, Math.ceil(shapes.length / Math.max(1, Math.ceil(shapes.length / fit)))));
	const rowHalf = ((Math.min(perRow, shapes.length) - 1) * 2.3) / 2;
	const centre = rand(-1, 1) * Math.max(0, room - rowHalf);
	const bodies = shapes.map((shape, i) => {
		const b = dieBody(t, shape);
		const row = Math.floor(i / perRow), col = i % perRow;
		const offset = (col - (Math.min(perRow, shapes.length - row * perRow) - 1) / 2) * 2.3 + rand(-0.15, 0.15);
		const a = Math.max(-room, Math.min(room, centre + offset));
		b.position.set(
			start.x + along.x * a + inward.x * row * 2.3,
			rand(2.2, 4.2) + row * 0.6,
			start.z + along.z * a + inward.z * row * 2.3,
		);
		const q = new CQuat();
		q.setFromEuler(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
		b.quaternion.copy(q);
		const aim = new Vec3(target.x - b.position.x, 0, target.z - b.position.z);
		aim.normalize();
		const speed = rand(12, 18);
		b.velocity.set(aim.x * speed, rand(2, 6), aim.z * speed);
		b.angularVelocity.set(rand(-22, 22), rand(-14, 14), rand(-22, 22));
		return b;
	});
	const r = record(t, bodies, shapes);
	return { seg: { dice: shapes.map((_, i) => i), steps: r.steps, frames: r.frames }, flatness: r.flatness };
}

/** One explosion: a die pops out of `from`, with everything already on the table in its way. */
function simulatePop(shape: DieShape, from: Resting, resting: { shape: DieShape; pose: Resting }[], ext: { x: number; z: number }): { steps: number; frames: Float32Array; flatness: number } {
	const t = makeTable(ext);
	for (const r of resting) {
		const b = dieBody(t, r.shape, 0);
		b.position.set(r.pose.pos.x, r.pose.pos.y, r.pose.pos.z);
		b.quaternion.set(r.pose.quat.x, r.pose.quat.y, r.pose.quat.z, r.pose.quat.w);
	}
	const b = dieBody(t, shape);
	b.position.set(from.pos.x, from.pos.y + 2.4, from.pos.z);
	const q = new CQuat();
	q.setFromEuler(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
	b.quaternion.copy(q);
	// Leap up and away, leaning toward the middle so it doesn't pile into a wall.
	const toCentre = new Vector3(-from.pos.x / Math.max(1, ext.x), 0, -from.pos.z / Math.max(1, ext.z));
	const dir = new Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize().addScaledVector(toCentre, 0.9).normalize();
	const speed = rand(4.5, 7);
	b.velocity.set(dir.x * speed, rand(7, 9), dir.z * speed);
	b.angularVelocity.set(rand(-18, 18), rand(-10, 10), rand(-18, 18));
	// A pop is a short hop, not a full throw: settle it quickly.
	b.linearDamping = 0.4;
	b.angularDamping = 0.6;
	return record(t, [b], [shape], 30);
}

// ---------------------------------------------------------------------------

export function roll(dice: Die3d[], opts: Dice3dOptions): Promise<void> {
	current?.cancel();
	if (fadeTimer) { window.clearTimeout(fadeTimer); fadeTimer = null; }
	const t0 = performance.now();
	const s = getStage();
	if (!s.canvas.isConnected) s.canvas.ownerDocument.body.appendChild(s.canvas);
	s.canvas.classList.remove('is-fading');
	resize(s);
	const ext = floorExtent(s);
	const stageMs = performance.now() - t0;
	const tSim = performance.now();
	const materialOf = (d: Die3d): DiceMaterial => opts.materials?.[d.role] ?? opts.material ?? 'classic';

	const shown = dice.slice(0, MAX_DICE);
	const shapes = shown.map(d => dieShape(d.sides));
	const wave1 = shown.map((d, i) => i).filter(i => shown[i].role !== 'explosion');
	const chain = shown.map((d, i) => i).filter(i => shown[i].role === 'explosion');
	const colorOf = (d: Die3d) => d.role === 'primary' ? opts.primaryColor : d.role === 'explosion' ? (opts.explosionColor ?? opts.primaryColor) : opts.diceColor;

	// 1. Simulate. Retry a throw that leaves a die propped up at an angle (rare).
	const segments: Segment[] = [];
	const finalPose: (Resting | null)[] = shown.map(() => null);
	let retries = 0;
	{
		let best: { seg: Segment; flatness: number } | null = null;
		for (let tries = 0; tries < 4; tries++) {
			const attempt = simulateThrow(wave1.map(i => shapes[i]), ext);
			if (!best || attempt.flatness > best.flatness) best = attempt;
			if (attempt.flatness > 0.97) break;
			retries++;
		}
		const seg = { ...best!.seg, dice: wave1 };
		segments.push(seg);
		wave1.forEach((di, k) => { finalPose[di] = lastPose(seg, k); });
	}
	let popFrom = wave1.length ? finalPose[wave1[0]]! : { pos: new Vector3(), quat: new Quaternion() };
	for (const di of chain) {
		const resting = shown.map((_, i) => i).filter(i => finalPose[i]).map(i => ({ shape: shapes[i], pose: finalPose[i]! }));
		let best: { steps: number; frames: Float32Array; flatness: number } | null = null;
		for (let tries = 0; tries < 3; tries++) {
			const attempt = simulatePop(shapes[di], popFrom, resting, ext);
			if (!best || attempt.flatness > best.flatness) best = attempt;
			if (attempt.flatness > 0.97) break;
			retries++;
		}
		const seg: Segment = { dice: [di], steps: best!.steps, frames: best!.frames, burstAt: popFrom.pos.clone(), speed: 1.25 };
		segments.push(seg);
		finalPose[di] = lastPose(seg, 0);
		popFrom = finalPose[di]!;
	}

	// 2. Relabel: whatever face physics left on top now shows the rolled value.
	const labels = shown.map((d, i) => {
		const shape = shapes[i];
		const top = topIndex(shape, finalPose[i]!.quat).index;
		return relabel(shape, defaultLabels(shape), top, Math.min(Math.max(1, d.value), shape.sides));
	});
	const simMs = performance.now() - tSim;
	// How far any die's centre ever got past a wall (or below the floor). A hard hit can sink a
	// die a little into a wall for a frame; anything past ~0.6 would mean it really escaped.
	let overshoot = 0;
	for (const seg of segments) {
		for (let o = 0; o < seg.frames.length; o += 7) {
			const x = seg.frames[o], y = seg.frames[o + 1], z = seg.frames[o + 2];
			overshoot = Math.max(overshoot, Math.abs(x) - ext.x, Math.abs(z) - ext.z, 0.15 - y);
		}
	}
	const inBounds = overshoot < 0.6;

	// 3. Build the dice.
	const time = { value: 0 };
	const meshes = shown.map((d, i) => {
		const m = makeDieMeshes(shapes[i], labels[i], colorOf(d), materialOf(d), time);
		m.group.visible = false;
		s.scene.add(m.group);
		return m;
	});
	const extraMaterials: Material[] = [];
	const extraObjects: Mesh[] = [];

	// Timeline: the opening throw, then each explosion right after the one before lands.
	const GAP = 140;
	const starts: number[] = [];
	let tcur = 0;
	for (const seg of segments) {
		starts.push(tcur);
		tcur += (seg.steps * STEP * 1000) / (seg.speed ?? 1) + GAP;
	}
	const landedAt = tcur - GAP;

	const rings: { mesh: Mesh; mat: MeshBasicMaterial; start: number }[] = [];
	const burst = (at: Vector3, color: string, start: number) => {
		const mat = new MeshBasicMaterial({ map: s.ringTex, color: new Color(color), transparent: true, depthWrite: false, side: DoubleSide, opacity: 0 });
		const mesh = new Mesh(new PlaneGeometry(1, 1), mat);
		mesh.rotation.x = -Math.PI / 2;
		mesh.position.set(at.x, 0.03, at.z);
		mesh.visible = false;
		s.scene.add(mesh);
		extraMaterials.push(mat);
		extraObjects.push(mesh);
		rings.push({ mesh, mat, start });
	};
	segments.forEach((seg, k) => { if (seg.burstAt) burst(seg.burstAt, colorOf(shown[seg.dice[0]]), starts[k]); });

	const qa = new Quaternion(), qb = new Quaternion();
	const apply = (elapsed: number) => {
		segments.forEach((seg, k) => {
			const local = elapsed - starts[k];
			if (local < 0) return;
			const f = Math.min(seg.steps - 1, (local * (seg.speed ?? 1)) / (STEP * 1000));
			const i0 = Math.floor(f), i1 = Math.min(seg.steps - 1, i0 + 1), u = f - i0;
			const n = seg.dice.length, fr = seg.frames;
			seg.dice.forEach((di, j) => {
				const g = meshes[di].group;
				g.visible = true;
				const a = (i0 * n + j) * 7, b = (i1 * n + j) * 7;
				g.position.set(fr[a] + (fr[b] - fr[a]) * u, fr[a + 1] + (fr[b + 1] - fr[a + 1]) * u, fr[a + 2] + (fr[b + 2] - fr[a + 2]) * u);
				qa.set(fr[a + 3], fr[a + 4], fr[a + 5], fr[a + 6]);
				qb.set(fr[b + 3], fr[b + 4], fr[b + 5], fr[b + 6]);
				g.quaternion.slerpQuaternions(qa, qb, u);
				// An exploding die grows out of the one it popped from.
				if (seg.burstAt) g.scale.setScalar(Math.min(1, 0.3 + local / 220));
			});
		});
		for (const r of rings) {
			const u = (elapsed - r.start) / 480;
			r.mesh.visible = u >= 0 && u <= 1;
			if (!r.mesh.visible) continue;
			r.mesh.scale.setScalar(1.6 + u * 5);
			r.mat.opacity = 1 - u;
		}
		// Crit dice glow, gently pulsing.
		shown.forEach((d, i) => {
			if (d.role !== 'explosion') return;
			meshes[i].body.emissive.set(colorOf(d));
			meshes[i].body.emissiveIntensity = 0.18 + 0.14 * Math.sin(elapsed / 160);
		});
	};

	// Render loop: runs only while something moves (or glows).
	const frameMs: number[] = [];
	const workMs: number[] = [];
	let last = 0;
	let startMs = -1;
	let raf = 0;
	let begin = 0;
	let resolveLanded!: () => void;
	const landed = new Promise<void>(r => { resolveLanded = r; });
	let landedFired = false;
	let landedMs = 0;
	let stopAfter = Infinity;
	const tick = (ts: number) => {
		const w0 = performance.now();
		if (startMs < 0) { startMs = w0 - t0; begin = w0; }
		if (last) frameMs.push(ts - last);
		last = ts;
		const elapsed = w0 - begin;
		time.value = elapsed / 1000;
		apply(elapsed);
		s.renderer.render(s.scene, s.camera);
		workMs.push(performance.now() - w0);
		if (!landedFired && elapsed >= landedAt) {
			landedFired = true;
			landedMs = performance.now() - t0;
			report();
			resolveLanded();
			// Animated looks and crit glow keep moving while the dice are on show; still dice can stop.
			const shimmer = chain.length > 0 || shown.some(d => ANIMATED.has(materialOf(d)));
			stopAfter = shimmer ? elapsed + 2100 : elapsed;
		}
		if (elapsed >= stopAfter) return;
		raf = window.requestAnimationFrame(tick);
	};
	raf = window.requestAnimationFrame(tick);

	const report = () => {
		const shownValues = meshes.map((m, i) => labels[i][topIndex(shapes[i], m.group.quaternion).index]);
		const sorted = (xs: number[]) => xs.slice().sort((a, b) => a - b);
		const p95 = (xs: number[]) => (xs.length ? sorted(xs)[Math.floor(xs.length * 0.95)] : 0);
		const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
		stats.last = {
			stageMs, simMs, startMs, landedMs, frames: frameMs.length, avgFrameMs: avg(frameMs), p95FrameMs: p95(frameMs),
			avgWorkMs: avg(workMs), p95WorkMs: p95(workMs), retries, shown: shownValues, inBounds, overshoot: Math.round(overshoot * 100) / 100, segmentsMs: segments.map(g => Math.round((g.steps * STEP * 1000) / (g.speed ?? 1))),
		};
	};

	const cleanup = () => {
		window.cancelAnimationFrame(raf);
		for (const m of meshes) {
			s.scene.remove(m.group);
			for (const mat of m.materials) mat.dispose();
			for (const t of m.textures) t.dispose();
		}
		for (const o of extraObjects) { s.scene.remove(o); o.geometry.dispose(); }
		for (const m of extraMaterials) m.dispose();
	};
	let cancelled = false;
	current = {
		cancel: () => {
			cancelled = true;
			cleanup();
			resolveLanded();
		},
	};

	return landed.then(() => {
		if (cancelled) return;
		// Keep the result on screen for a moment, then fade out and free the GPU.
		fadeTimer = window.setTimeout(() => {
			if (!stage || cancelled) return;
			stage.canvas.classList.add('is-fading');
			fadeTimer = window.setTimeout(() => {
				if (cancelled) return;
				cleanup();
				current = null;
				if (stage) stage.canvas.remove();
				// Keep the renderer briefly so a quick re-roll starts warm.
				idleTimer = window.setTimeout(teardown, 20000);
			}, 380);
		}, 1700);
	});
}
