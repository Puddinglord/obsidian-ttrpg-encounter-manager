// The CSS checks Obsidian's community plugin review runs on styles.css (`npm run lint`).
// The review targets Obsidian 1.6.5, which ships Electron 30 (Chromium 124).
export default {
	plugins: ["stylelint-no-unsupported-browser-features"],
	rules: {
		// "Unexpected browser feature ... is only partially supported by Obsidian 1.6.5"
		"plugin/no-unsupported-browser-features": [true, {
			browsers: ["Chrome 124"],
			severity: "error",
		}],
		// "Avoid !important: override styles by increasing selector specificity or using CSS variables instead."
		"declaration-no-important": true,
	},
};
