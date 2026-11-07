declare module '*.md' {
	const text: string;
	export default text;
}

// The sample vault's plugin settings (its data.json). scripts/build-site.mjs
// points this name at the file, so the demo starts with the same party.
declare module 'sample-vault-settings' {
	const settings: { party: import('../src/types').PartyMember[] };
	export default settings;
}
