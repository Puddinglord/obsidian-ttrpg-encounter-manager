// The same rules Obsidian's community plugin review bot runs.
// Run from the project root (`npm run lint`) so manifest.json, package.json and LICENSE are checked too.
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import { readdirSync } from "node:fs";

// Layer boundaries (see src/systems/contract.ts):
//   src/core/**        shared by every system: may not import a system or the app layer
//   src/systems/<id>/  one game system: may not import another system or the app layer
//   src/systems/*.ts   the contract and registry: core only
//   src/app/** + main  wiring: anything
// So a change inside one system can only break another through core or the contract.
const SYSTEMS = readdirSync(new URL("./src/systems", import.meta.url), { withFileTypes: true })
	.filter((d) => d.isDirectory()).map((d) => d.name);
const APP = { group: ["**/app", "**/app/**"], message: "Only main.ts and src/app may import the app layer." };
const boundaries = [
	{
		files: ["src/core/**/*.ts"],
		rules: { "no-restricted-imports": ["error", { patterns: [
			{ group: ["**/systems/*/**", "**/systems/*/"], message: "Core can't import a game system. Go through the plugin (plugin.system()) and the contract in src/systems/contract.ts." },
			APP,
		] }] },
	},
	{
		files: ["src/systems/*.ts"],
		rules: { "no-restricted-imports": ["error", { patterns: [
			{ group: SYSTEMS.flatMap((id) => [`./${id}`, `./${id}/**`]), message: "The contract and registry can't import a game system." },
			APP,
		] }] },
	},
	...SYSTEMS.map((id) => ({
		files: [`src/systems/${id}/**/*.ts`],
		rules: { "no-restricted-imports": ["error", { patterns: [
			...SYSTEMS.filter((other) => other !== id).map((other) => ({
				group: [`**/systems/${other}`, `**/systems/${other}/**`, `../${other}`, `../${other}/**`],
				message: `The ${id} system can't import the ${other} system. Share code through src/core instead.`,
			})),
			APP,
		] }] },
	})),
];

export default defineConfig([
	globalIgnores([
		"node_modules", "main.js", "esbuild.config.mjs", "stylelint.config.mjs", "version-bump.mjs",
		"e2e", "scripts", "prototypes", "tests", "vitest.config.mjs",
		"src/systems/nimble/data", "sample-vault", "docs", "site", "_site",
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
			}, {
				// The bot's obsidianmd/prefer-create-el reports these calls; run locally, it skips any whose helper it can't
				// resolve through Obsidian's types. createElement(tag, options) is left alone, as the rule leaves it.
				selector: "CallExpression[callee.property.name='createElement'][arguments.length=1], CallExpression[callee.property.name='createDocumentFragment'][arguments.length=0]",
				message: "Use Obsidian's DOM helpers (Obsidian review): parent.createEl/createDiv/createSpan, createFragment() and appendText().",
			}],
		},
	},
	...boundaries,
	{
		languageOptions: {
			parserOptions: {
				projectService: { allowDefaultProject: ["eslint.config.*"] },
			},
		},
	},
]);
