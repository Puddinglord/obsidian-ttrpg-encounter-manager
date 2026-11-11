// The same rules Obsidian's community plugin review bot runs.
// Run from the project root (`npm run lint`) so manifest.json, package.json and LICENSE are checked too.
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	globalIgnores([
		"node_modules", "main.js", "esbuild.config.mjs", "stylelint.config.mjs", "version-bump.mjs",
		"e2e", "scripts", "prototypes", "tests", "vitest.config.mjs",
		"src/data", "sample-vault", "docs", "site", "_site",
	]),
	...obsidianmd.configs.recommended,
	{
		// The review bot flags these even though obsidianmd's recommended config leaves them off
		// or only matches "command" as a whole word.
		files: ["**/*.ts"],
		rules: {
			"@typescript-eslint/no-unnecessary-type-assertion": "error",
			"no-restricted-syntax": ["error", {
				selector: "CallExpression[callee.property.name='addCommand'] Property[key.name='name'] Literal[value=/command/i]",
				message: "Adding `command` to the command name is not necessary (Obsidian review). Avoid \"command\"/\"commands\" anywhere in the name.",
			}],
		},
	},
	{
		languageOptions: {
			parserOptions: {
				projectService: { allowDefaultProject: ["eslint.config.*"] },
			},
		},
	},
]);
