// `import load from './data/x.json?gz'` (see scripts/gz-data.mjs): the data, parsed on first call.
declare module '*?gz' {
	const load: () => unknown;
	export default load;
}
