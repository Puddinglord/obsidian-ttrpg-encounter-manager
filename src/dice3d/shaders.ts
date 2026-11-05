// Procedural looks for the dice, layered onto three's MeshPhysicalMaterial
// with onBeforeCompile, so they keep its lighting, clearcoat and reflections.
// Patterns live in the die's own coordinates (they turn with the die), and the
// animated ones read a shared `uTime` that only ticks while the dice render.

import { Color, MeshPhysicalMaterial, Vector3 } from 'three';

export type ShaderLook = 'glitter' | 'lava' | 'frost' | 'nebula' | 'opal' | 'marble';

/** Looks that change over time (the renderer keeps drawing a little after landing for these). */
export const ANIMATED: ReadonlySet<string> = new Set(['glitter', 'lava', 'nebula']);

const NOISE = /* glsl */ `
varying vec3 vObjPos;
varying vec3 vObjView;
uniform float uTime;
uniform vec3 uTint;
float nHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 nHash3(vec3 p) { return vec3(nHash(p), nHash(p + 17.31), nHash(p + 41.7)); }
float vnoise(vec3 x) {
	vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(nHash(i), nHash(i + vec3(1,0,0)), f.x), mix(nHash(i + vec3(0,1,0)), nHash(i + vec3(1,1,0)), f.x), f.y),
	           mix(mix(nHash(i + vec3(0,0,1)), nHash(i + vec3(1,0,1)), f.x), mix(nHash(i + vec3(0,1,1)), nHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
// Distance to the nearest cell point (cellular noise), for crystals.
float cells(vec3 p) {
	vec3 i = floor(p); vec3 f = fract(p); float d = 8.0;
	for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
		vec3 g = vec3(float(x), float(y), float(z));
		vec3 o = nHash3(i + g);
		d = min(d, length(g + o - f));
	}
	return d;
}
vec3 palette(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
`;

/** GLSL run where emissive is applied: albedo, glow and view-dependent bits all in one place. */
const LOOKS: Record<Exclude<ShaderLook, 'glitter'>, string> = {
	// Dark crust split by glowing cracks; the cracks crawl and pulse.
	lava: /* glsl */ `{
		vec3 p = vObjPos * 2.2;
		vec3 q = vec3(fbm(p + vec3(0.0, uTime * 0.12, 0.0)), fbm(p + 5.2 - uTime * 0.08), fbm(p + 9.1));
		float n = fbm(p * 1.6 + q * 2.2);
		float d = abs(n - 0.5);
		float crack = 1.0 - smoothstep(0.0, 0.035, d);
		float halo = 1.0 - smoothstep(0.0, 0.1, d);
		// Cooled rock: near black, faintly tinted, with a little texture.
		vec3 crust = mix(vec3(0.02, 0.016, 0.014), uTint * 0.08, 0.4) * (0.7 + 0.5 * fbm(p * 5.0));
		diffuseColor.rgb = crust;
		// Molten core: white-yellow in the middle of a crack, red-orange at its edge.
		vec3 edge = mix(vec3(0.9, 0.18, 0.02), uTint, 0.3);
		vec3 core = vec3(1.0, 0.82, 0.35);
		float pulse = 0.75 + 0.4 * sin(uTime * 2.2 + n * 14.0);
		totalEmissiveRadiance += (mix(edge, core, crack * crack * crack) * crack * 3.0 + edge * halo * 0.3) * pulse;
	}`,
	// Icy crystals with a cold rim light.
	frost: /* glsl */ `{
		float c = cells(vObjPos * 5.5);
		float c2 = cells(vObjPos * 13.0 + 3.0);
		vec3 ice = mix(vec3(0.62, 0.82, 1.0), uTint, 0.22);
		float facet = smoothstep(0.15, 0.85, c) * 0.35 + smoothstep(0.0, 0.25, c2) * 0.15;
		diffuseColor.rgb = mix(ice, vec3(1.0), facet);
		vec3 v = normalize(vViewPosition);
		float rim = pow(1.0 - clamp(dot(normal, v), 0.0, 1.0), 2.5);
		totalEmissiveRadiance += mix(vec3(0.5, 0.85, 1.0), uTint, 0.25) * rim * 1.4;
	}`,
	// Deep space: a swirl of gas with stars at different depths, so it shifts as the die turns.
	nebula: /* glsl */ `{
		vec3 view = normalize(vObjView);
		vec3 acc = vec3(0.0);
		for (int k = 0; k < 3; k++) {
			float depth = 0.12 + float(k) * 0.22;
			vec3 p = vObjPos - view * depth;
			float gas = fbm(p * 2.4 + vec3(uTime * 0.05, 0.0, -uTime * 0.04) + fbm(p * 1.3) * 1.5);
			// Mostly deep space colours; the die's colour only nudges the hue (an ivory die mustn't go pastel).
			vec3 hue = mix(palette(gas * 0.6 + float(k) * 0.18 + 0.55) * vec3(0.75, 0.45, 1.0), uTint, 0.22);
			float cloud = smoothstep(0.42, 0.85, gas);
			acc += hue * cloud * cloud * (1.1 - float(k) * 0.3);
			vec3 sc = floor(p * (26.0 + float(k) * 9.0));
			float star = step(0.985, nHash(sc + float(k) * 7.0));
			float tw = 0.55 + 0.45 * sin(uTime * 3.0 + nHash(sc) * 6.2831);
			acc += vec3(1.0, 0.96, 0.9) * star * tw * (2.2 - float(k) * 0.55);
		}
		diffuseColor.rgb = vec3(0.004, 0.003, 0.01);
		totalEmissiveRadiance += acc;
	}`,
	// Milky pearl with play-of-colour that slides as the viewing angle changes.
	opal: /* glsl */ `{
		vec3 v = normalize(vViewPosition);
		float facing = clamp(dot(normal, v), 0.0, 1.0);
		float n = fbm(vObjPos * 3.2);
		float opalPatch = smoothstep(0.35, 0.75, fbm(vObjPos * 6.0 + 2.0));
		vec3 fire = palette(facing * 1.4 + n * 1.2);
		vec3 milk = mix(vec3(0.93, 0.92, 0.95), uTint, 0.18);
		diffuseColor.rgb = mix(milk, mix(milk, fire, 0.55), opalPatch);
		totalEmissiveRadiance += fire * opalPatch * 0.12;
	}`,
	// Polished stone with dark veins.
	marble: /* glsl */ `{
		vec3 p = vObjPos * 2.4;
		float w = fbm(p * 1.6) * 5.0;
		float v1 = abs(sin(p.x * 3.0 + p.y * 1.4 + w));
		float v2 = abs(sin(p.z * 5.0 - p.x * 2.0 + w * 1.3));
		float vein = (1.0 - smoothstep(0.0, 0.16, v1)) * 0.95 + (1.0 - smoothstep(0.0, 0.08, v2)) * 0.55;
		vec3 stone = mix(vec3(0.95, 0.94, 0.92), uTint, 0.35) * (0.92 + 0.12 * fbm(p * 6.0));
		vec3 veinCol = mix(vec3(0.12, 0.11, 0.1), uTint * 0.3, 0.45);
		diffuseColor.rgb = mix(stone, veinCol, clamp(vein, 0.0, 1.0));
	}`,
};

const GLITTER = /* glsl */ `{
	vec3 cell = floor(vObjPos * 30.0);
	vec3 jitter = nHash3(cell) - 0.5;
	float lit = step(0.55, nHash(cell + 3.7));
	vec3 n = normalize(normal + jitter * 1.3);
	vec3 v = normalize(vViewPosition);
	vec3 l = normalize(vec3(-0.35, 0.8, 0.45));
	vec3 h = normalize(l + v);
	float glint = pow(max(dot(n, h), 0.0), 60.0) * lit;
	float tw = 0.6 + 0.4 * sin(uTime * 5.0 + nHash(cell) * 6.2831);
	vec3 tint = mix(vec3(1.0, 0.96, 0.88), gl_FragColor.rgb * 1.6 + 0.25, 0.35);
	gl_FragColor.rgb += tint * glint * tw * 3.6;
}`;

/** Surface settings that suit each look (applied on top of the material's defaults). */
export function lookProps(look: ShaderLook): Partial<MeshPhysicalMaterial> {
	switch (look) {
		case 'lava': return { roughness: 0.9, metalness: 0, clearcoat: 0, envMapIntensity: 0.15 };
		case 'frost': return { roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.9, envMapIntensity: 1.2 };
		case 'nebula': return { roughness: 0.35, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.05, envMapIntensity: 0.25 };
		case 'opal': return { roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, iridescence: 0.8, iridescenceIOR: 1.45, sheen: 0.6, sheenRoughness: 0.4, envMapIntensity: 0.9 };
		case 'marble': return { roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.85 };
		case 'glitter': return { roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.16, envMapIntensity: 0.6 };
	}
}

/**
 * Turn a physical material into one of the procedural looks.
 * `time` is shared by every die in a roll; `tint` is the die's role colour.
 */
export function applyLook(mat: MeshPhysicalMaterial, look: ShaderLook, tint: string, time: { value: number }): void {
	const c = new Color(tint);
	const uTint = { value: new Vector3(c.r, c.g, c.b) };
	Object.assign(mat, lookProps(look));
	mat.onBeforeCompile = (shader) => {
		shader.uniforms.uTime = time;
		shader.uniforms.uTint = uTint;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjView;')
			.replace('#include <begin_vertex>', `#include <begin_vertex>
vObjPos = position;
// Camera direction in the die's own space, for parallax inside the nebula.
vObjView = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz - position;`);
		shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}`);
		if (look === 'glitter') {
			shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${GLITTER}`);
		} else {
			shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${LOOKS[look]}`);
		}
	};
	// One compiled program per look (the tint is a uniform, so colours share it).
	mat.customProgramCacheKey = () => `nimble-dice-${look}`;
}
