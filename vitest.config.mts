import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['credentials/**/*.test.ts', 'nodes/**/*.test.ts', 'scripts/**/*.test.ts'],
	},
});
