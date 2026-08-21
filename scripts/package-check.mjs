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
	'dist/Twenty.node.d.ts',
	'dist/Twenty.node.js',
	'dist/Twenty.node.js.map',
	'dist/Twenty.node.json',
	'dist/nodes/Twenty/twenty.dark.svg',
	'dist/nodes/Twenty/twenty.svg',
	'dist/shared/contracts.d.ts',
	'dist/shared/contracts.js',
	'dist/shared/contracts.js.map',
].sort();
const missing = expectedFiles.filter((path) => !files.includes(path));
const unexpected = files.filter((path) => !expectedFiles.includes(path));

if (missing.length > 0 || unexpected.length > 0) {
	console.error('npm package contents do not match the expected foundation artifact set.');
	if (missing.length > 0) {
		console.error(`Missing files:\n${missing.map((path) => `- ${path}`).join('\n')}`);
	}
	if (unexpected.length > 0) {
		console.error(`Unexpected files:\n${unexpected.map((path) => `- ${path}`).join('\n')}`);
	}
	process.exit(1);
}

console.log(`Exact package artifact set passed (${files.length} files)`);
