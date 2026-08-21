import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
	cwd: root,
	encoding: 'utf8',
});
const [pack] = JSON.parse(output);
const files = pack.files.map(({ path }) => path).sort();
const expectedFiles = [
	'LICENSE.md',
	'README.md',
	'package.json',
	'dist/credentials/TwentyApi.credentials.d.ts',
	'dist/credentials/TwentyApi.credentials.js',
	'dist/credentials/TwentyApi.credentials.js.map',
	'dist/nodes/Twenty/Twenty.node.d.ts',
	'dist/nodes/Twenty/Twenty.node.js',
	'dist/nodes/Twenty/Twenty.node.js.map',
	'dist/nodes/Twenty/Twenty.node.json',
	'dist/nodes/Twenty/twenty.dark.svg',
	'dist/nodes/Twenty/twenty.svg',
	'dist/nodes/Twenty/shared/contracts.d.ts',
	'dist/nodes/Twenty/shared/contracts.js',
	'dist/nodes/Twenty/shared/contracts.js.map',
	'dist/nodes/Twenty/shared/urls.d.ts',
	'dist/nodes/Twenty/shared/urls.js',
	'dist/nodes/Twenty/shared/urls.js.map',
].sort();
const missing = expectedFiles.filter((path) => !files.includes(path));
const unexpected = files.filter((path) => !expectedFiles.includes(path));

if (missing.length > 0 || unexpected.length > 0) {
	console.error('npm package contents do not match the expected artifact set.');
	if (missing.length > 0) {
		console.error(`Missing files:\n${missing.map((path) => `- ${path}`).join('\n')}`);
	}
	if (unexpected.length > 0) {
		console.error(`Unexpected files:\n${unexpected.map((path) => `- ${path}`).join('\n')}`);
	}
	process.exit(1);
}

console.log(`Exact package artifact set passed (${files.length} files)`);
