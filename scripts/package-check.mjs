import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
	cwd: root,
	encoding: 'utf8',
});
const [pack] = JSON.parse(output);
const files = pack.files.map(({ path }) => path).sort();
const allowedRootFiles = new Set(['CHANGELOG.md', 'LICENSE.md', 'README.md', 'package.json']);
const unexpected = files.filter(
	(path) =>
		(!path.startsWith('dist/') && !allowedRootFiles.has(path)) ||
		path.includes('.test.') ||
		path.includes('.spec.'),
);

if (unexpected.length > 0) {
	console.error(
		`Unexpected files in npm package:\n${unexpected.map((path) => `- ${path}`).join('\n')}`,
	);
	process.exit(1);
}

for (const required of [
	'dist/Twenty.node.js',
	'dist/Twenty.node.json',
	'dist/nodes/Twenty/twenty.svg',
	'dist/nodes/Twenty/twenty.dark.svg',
]) {
	if (!files.includes(required)) {
		console.error(`Required package file is missing: ${required}`);
		process.exit(1);
	}
}

console.log(`Package allowlist passed (${files.length} files)`);
