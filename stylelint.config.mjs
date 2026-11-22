// The CSS checks Obsidian's community plugin review runs (`npm run lint`). The bot reads every CSS file
// in the repo, not only styles.css, so the lint does too.
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
		// "Avoid :has — it can cause significant performance issues due to broad selector invalidation."
		"selector-pseudo-class-disallowed-list": ["has"],
		// "Unexpected URL scheme "https:"" / "External URLs are not allowed in themes": only data: URLs.
		// A page that needs web fonts loads them from its HTML (see prototypes/design-study/src/00-head.html).
		"function-url-scheme-allowed-list": ["data"],
	},
};
