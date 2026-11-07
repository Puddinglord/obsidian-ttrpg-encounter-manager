// The same rules Obsidian's community plugin review bot runs.
// Run from the project root (`npm run lint`) so manifest.json, package.json and LICENSE are checked too.
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	globalIgnores([
		"node_modules", "main.js", "esbuild.config.mjs", "version-bump.mjs",
		"e2e", "scripts", "prototypes", "tests", "vitest.config.mjs",
		"src/data", "sample-vault", "docs", "site", "_site",
	]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: { allowDefaultProject: ["eslint.config.*"] },
			},
		},
	},
]);
