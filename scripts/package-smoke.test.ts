/* eslint-disable @n8n/community-nodes/no-restricted-imports -- Offline release audit tests inspect repository files and do not ship. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const expectedIconHash = '0016254102d200b1598b4c1ecb88dfa398ec3a34db0616ed9441eda887ff2fef';

describe('release-candidate package smoke', () => {
	it('keeps both icons byte-identical to the pinned official upstream asset', () => {
		for (const path of ['nodes/Twenty/twenty.svg', 'nodes/Twenty/twenty.dark.svg']) {
			const icon = read(path);
			expect(createHash('sha256').update(icon).digest('hex')).toBe(expectedIconHash);
			expect(icon).toContain('viewBox="0 0 96 96"');
			expect(icon).toContain('<rect width="96" height="96"');
			expect(icon.match(/<path /g)).toHaveLength(2);
			expect(icon).not.toContain('<text');
			expect(icon).not.toContain('>20<');
		}
	});

	it('installs only the packed tarball and loads that installed package', () => {
		const installSmoke = read('scripts/package-install-smoke.mjs');
		expect(installSmoke).toContain("['pack', '--json', '--pack-destination', temporaryRoot]");
		expect(installSmoke).toContain("'--ignore-scripts'");
		expect(installSmoke).toContain("'--omit=peer'");
		expect(installSmoke).toContain("'@blackswampai'");
		expect(installSmoke).toContain("'n8n-nodes-twentycrm'");
		expect(installSmoke).toContain("'scripts/node-load-smoke.mjs'");
		expect(installSmoke).toContain('installedRoot');
		expect(installSmoke).toContain("NODE_PATH: resolve(root, 'node_modules')");
		const loadSmoke = read('scripts/node-load-smoke.mjs');
		expect(loadSmoke).toContain('process.argv[2] ? resolve(process.argv[2])');
		expect(loadSmoke).toContain("resolve(packageRoot, 'dist/nodes/Twenty/Twenty.node.js')");
		expect(loadSmoke).not.toContain("resolve(import.meta.dirname, '../dist/nodes/Twenty");
	});

	it('keeps the isolated install smoke in CI and the documented release gate', () => {
		const ci = read('.github/workflows/ci.yml');
		const releasing = read('RELEASING.md');
		expect(ci).toContain('- run: npm run smoke:install');
		expect(releasing).toContain('npm run smoke:install');
		expect(ci.indexOf('npm run package:check')).toBeLessThan(ci.indexOf('npm run smoke:install'));
		expect(releasing.indexOf('npm run package:check')).toBeLessThan(
			releasing.indexOf('npm run smoke:install'),
		);
	});

	it('requires both compiled nodes to resolve every shipped icon reference', () => {
		const loadSmoke = read('scripts/node-load-smoke.mjs');
		expect(loadSmoke).toContain(
			'for (const description of [node.description, trigger.description])',
		);
		expect(loadSmoke).toContain("icon.startsWith('file:')");
		expect(loadSmoke).toContain("resolve(packageRoot, 'dist/nodes/Twenty'");
	});
});
