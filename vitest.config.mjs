import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { gzDataVite } from './scripts/gz-data.mjs';

export default defineConfig({
	plugins: [gzDataVite],
	resolve: {
		alias: { obsidian: fileURLToPath(new URL('./tests/obsidian-stub.ts', import.meta.url)) },
	},
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'happy-dom',
		setupFiles: ['tests/obsidian-dom.ts'],
	},
});
