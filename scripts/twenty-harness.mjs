import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
	createLocalEnv,
	readEnv,
	redactHarnessText,
	writePrivateFile,
} from './twenty-harness-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const harnessDir = resolve(root, 'integration/twenty');
const composePath = resolve(harnessDir, 'docker-compose.yml');
const envPath = resolve(harnessDir, '.env');
const artifactDir = resolve(harnessDir, 'artifacts');
const failureLog = resolve(artifactDir, 'twenty-failure.log');
const command = process.argv[2];

function compose(args, capture = false) {
	const result = spawnSync(
		'docker',
		['compose', '--env-file', envPath, '-f', composePath, ...args],
		{
			cwd: root,
			encoding: 'utf8',
			stdio: capture ? 'pipe' : 'inherit',
		},
	);
	if (result.error) throw result.error;
	return result;
}

function ensureEnv() {
	if (existsSync(envPath)) return;
	createLocalEnv(envPath);
	console.log('Created private integration/twenty/.env (values were not printed).');
}

function retainLogs() {
	if (!existsSync(envPath)) return;
	mkdirSync(artifactDir, { recursive: true });
	const result = compose(['logs', '--no-color'], true);
	const env = readEnv(envPath);
	const secrets = [
		env.PG_DATABASE_PASSWORD,
		env.ENCRYPTION_KEY,
		env.APP_SECRET,
		env.TWENTY_API_KEY,
	];
	writePrivateFile(
		failureLog,
		redactHarnessText(`${result.stdout ?? ''}${result.stderr ?? ''}`, secrets),
	);
	console.error(
		'Sanitized failure logs retained at integration/twenty/artifacts/twenty-failure.log',
	);
}

async function waitForHealth() {
	const env = readEnv(envPath);
	const port = env.TWENTY_PORT || '3020';
	const deadline = Date.now() + 180_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/healthz`);
			if (response.ok) {
				console.log(`Twenty is healthy at http://127.0.0.1:${port}`);
				return;
			}
		} catch {
			// The server is expected to refuse connections while migrations and startup complete.
		}
		await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
	}
	retainLogs();
	throw new Error('Twenty did not become healthy within 180 seconds; inspect the sanitized log.');
}

try {
	if (command === 'start') {
		ensureEnv();
		const result = compose(['up', '-d']);
		if (result.status !== 0) throw new Error('Docker Compose start failed');
		await waitForHealth();
	} else if (command === 'wait') {
		if (!existsSync(envPath)) throw new Error('Run npm run twenty:start first.');
		await waitForHealth();
	} else if (command === 'stop' || command === 'clean') {
		if (!existsSync(envPath)) throw new Error('No local harness environment exists.');
		const args = ['down', '--remove-orphans'];
		if (command === 'clean') args.push('--volumes');
		const result = compose(args);
		if (result.status !== 0) throw new Error('Docker Compose cleanup failed');
	} else if (command === 'logs') {
		retainLogs();
	} else {
		throw new Error('Usage: node scripts/twenty-harness.mjs <start|wait|stop|clean|logs>');
	}
} catch (error) {
	if ((command === 'start' || command === 'wait') && existsSync(envPath)) {
		try {
			retainLogs();
		} catch {
			console.error('Unable to retain container logs.');
		}
	}
	console.error(error instanceof Error ? error.message : 'Twenty harness command failed');
	process.exitCode = 1;
}
