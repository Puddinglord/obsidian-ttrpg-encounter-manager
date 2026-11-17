// `import load from './data/x.json?gz'`: the JSON ships gzip-compressed (base64) in
// main.js and `load()` inflates and parses it the first time it's called, so big
// data a user may never open costs neither startup time nor much download.
// esbuild (the plugin build) and vitest (the tests) each get a plugin; in tests
// the data stays plain JSON.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";

/** esbuild plugin. */
export const gzDataEsbuild = {
	name: "gz-data",
	setup(build) {
		build.onResolve({ filter: /\?gz$/ }, (args) => ({ path: resolve(args.resolveDir, args.path.slice(0, -3)), namespace: "gz-data" }));
		build.onLoad({ filter: /.*/, namespace: "gz-data" }, (args) => {
			// Minify first: what's on disk may be pretty-printed.
			const json = JSON.stringify(JSON.parse(readFileSync(args.path, "utf8")));
			const b64 = gzipSync(Buffer.from(json, "utf8"), { level: 9 }).toString("base64");
			return {
				contents: `import { gunzipSync, strFromU8 } from "fflate";
const data = ${JSON.stringify(b64)};
let cache;
export default function load() {
	if (cache === undefined) {
		const bin = atob(data);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		cache = JSON.parse(strFromU8(gunzipSync(bytes)));
	}
	return cache;
}`,
				loader: "js",
				resolveDir: dirname(args.path),
			};
		});
	},
};

/** Vite/vitest plugin: the same import, as plain JSON parsed on first call. */
export const gzDataVite = {
	name: "gz-data",
	enforce: "pre",
	async resolveId(id, importer) {
		if (!id.endsWith("?gz") || !importer) return null;
		// Let Vite resolve the file itself (importers may be root-relative ids), then mark it.
		const file = await this.resolve(id.slice(0, -3), importer, { skipSelf: true });
		return file ? `${file.id}?gz` : null;
	},
	load(id) {
		if (!id.endsWith("?gz")) return null;
		const text = readFileSync(id.slice(0, -3), "utf8");
		return `let cache; export default function load() { return cache ??= JSON.parse(${JSON.stringify(text)}); }`;
	},
};
