// The renderer bundle (three.js + renderer.ts), embedded as text by esbuild.config.mjs.
declare module 'dice3d-bundle' {
	const source: string;
	export default source;
}
