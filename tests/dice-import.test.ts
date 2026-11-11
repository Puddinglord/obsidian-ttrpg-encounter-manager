import { describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';

const requestUrl = vi.hoisted(() => vi.fn());
const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', () => ({
	normalizePath: (p: string) => p.replace(/\/+/g, '/'),
	requestUrl,
	Notice: class { constructor(text: string) { notices.push(text); } },
}));

import { importFile, importZip } from '../src/dice3d/importer';
import { migrateDice } from '../src/dice3d/styles';

/** A plugin with an in-memory plugin folder. */
function fakePlugin() {
	const files = new Map<string, ArrayBuffer>();
	const adapter = {
		exists: (p: string) => Promise.resolve([...files.keys()].some(f => f === p || f.startsWith(`${p}/`))),
		mkdir: () => Promise.resolve(),
		rmdir: (p: string) => { for (const f of [...files.keys()]) if (f.startsWith(`${p}/`)) files.delete(f); return Promise.resolve(); },
		writeBinary: (p: string, data: ArrayBuffer) => { files.set(p, data); return Promise.resolve(); },
	};
	const plugin = { manifest: { dir: 'plugins/ember', id: 'ember' }, app: { vault: { adapter, configDir: '.obsidian' } }, settings: { dice: migrateDice({}, {}) } };
	return { plugin: plugin as unknown as Parameters<typeof importZip>[0], files, dice: plugin.settings.dice };
}

const script = (model: string) => `Hooks.once('diceSoNiceReady', (dice3d) => {
  dice3d.addSystem({ id: "acme", name: "Acme" }, false);
  dice3d.addDicePreset({ type: "d20", labels: "", modelFile: "modules/acme/${model}", system: "acme" });
  dice3d.addColorset({ name: 'acme-ember', description: 'Acme Ember', foreground: '#ffffff', background: '#ff6a1f' });
});`;
const zip = (entries: Record<string, string>): ArrayBuffer => {
	const z = zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)])));
	return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
};
const manifest = JSON.stringify({ id: 'acme', title: 'Acme', scripts: ['main.js'] });
const asFile = (text: string) => ({ arrayBuffer: () => Promise.resolve(strToU8(text).buffer as ArrayBuffer) }) as unknown as File;

describe('importing a dice set', () => {
	it('keeps a set whose models came with it', async () => {
		const { plugin, files, dice } = fakePlugin();
		const r = await importZip(plugin, zip({ 'module.json': manifest, 'main.js': script('models/d20.gltf'), 'models/d20.gltf': '{}' }));
		expect(r.sets.map(s => s.id)).toEqual(['acme']);
		expect(dice.sets[0].models).toEqual({ 20: 'models/d20.gltf' });
		expect(dice.styles.some(s => s.id === 'set:acme')).toBe(true);
		expect([...files.keys()]).toEqual(['plugins/ember/dice-sets/acme/models/d20.gltf']);
	});

	it('does not keep a set (or its files) when none of its models are usable, only its colours', async () => {
		const { plugin, files, dice } = fakePlugin();
		const r = await importZip(plugin, zip({ 'module.json': manifest, 'main.js': script('models/missing.gltf'), 'art/cover.png': 'x' }));
		expect(r.sets).toEqual([]);
		expect(dice.sets).toEqual([]);
		expect(dice.styles.some(s => s.id === 'set:acme')).toBe(false);
		expect(dice.styles.map(s => s.name)).toEqual(['Acme Ember']);
		expect(files.size).toBe(0);
		expect(r.notes.join(' ')).toContain('no dice models');
	});
});

describe('importing a module.json file', () => {
	it('refuses a download address that is not http(s), without fetching', async () => {
		const { plugin } = fakePlugin();
		requestUrl.mockClear();
		for (const download of ['file:///etc/passwd', 'ftp://example.com/set.zip', 'set.zip']) {
			await expect(importFile(plugin, asFile(JSON.stringify({ id: 'acme', download })))).rejects.toThrow('no download link');
		}
		expect(requestUrl).not.toHaveBeenCalled();
	});

	it('says where it downloads from before fetching', async () => {
		const { plugin } = fakePlugin();
		notices.length = 0;
		requestUrl.mockReset();
		requestUrl.mockImplementation(() => { expect(notices).toEqual(['Downloading from dice.example.com…']); return Promise.resolve({ status: 404 }); });
		await expect(importFile(plugin, asFile(JSON.stringify({ id: 'acme', download: 'https://dice.example.com/sets/acme.zip' })))).rejects.toThrow('404');
		expect(requestUrl).toHaveBeenCalledWith({ url: 'https://dice.example.com/sets/acme.zip', throw: false });
	});
});
