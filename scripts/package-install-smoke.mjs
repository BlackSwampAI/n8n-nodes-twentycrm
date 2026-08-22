import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'twenty-package-smoke-'));
const consumer = join(temporaryRoot, 'consumer');

try {
	const packOutput = execFileSync('npm', ['pack', '--json', '--pack-destination', temporaryRoot], {
		cwd: root,
		encoding: 'utf8',
	});
	const [{ filename }] = JSON.parse(packOutput);
	const tarball = join(temporaryRoot, filename);
	mkdirSync(consumer);
	writeFileSync(join(consumer, 'package.json'), '{"name":"twenty-install-smoke","private":true}\n');
	execFileSync(
		'npm',
		[
			'install',
			'--ignore-scripts',
			'--no-package-lock',
			'--omit=peer',
			'--no-audit',
			'--no-fund',
			tarball,
		],
		{ cwd: consumer, stdio: 'pipe' },
	);
	const installedRoot = join(consumer, 'node_modules', '@blackswampai', 'n8n-nodes-twentycrm');
	execFileSync(process.execPath, [resolve(root, 'scripts/node-load-smoke.mjs'), installedRoot], {
		cwd: consumer,
		stdio: 'inherit',
		env: { ...process.env, NODE_PATH: resolve(root, 'node_modules') },
	});
	console.log('Packed package installed and loaded successfully in an isolated consumer');
} finally {
	rmSync(temporaryRoot, { recursive: true, force: true });
}
