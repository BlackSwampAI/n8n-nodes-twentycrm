import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { localWebhookTarget, readEnv } from './twenty-harness-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const harnessDir = resolve(root, 'integration/twenty');
const composePath = resolve(harnessDir, 'docker-compose.yml');
const envPath = resolve(harnessDir, '.env');

function fail(message) {
	console.error(message);
	process.exitCode = 1;
}

if (!existsSync(envPath)) {
	fail('Local Twenty environment is missing. Run npm run twenty:start first.');
} else {
	try {
		const env = readEnv(envPath);
		if (!env.TWENTY_WEBHOOK_URL) {
			throw new Error(
				'Add the local n8n production webhook URL as TWENTY_WEBHOOK_URL in integration/twenty/.env.',
			);
		}
		const target = localWebhookTarget(env.TWENTY_WEBHOOK_URL);
		const probe = spawnSync(
			'docker',
			[
				'compose',
				'--env-file',
				envPath,
				'-f',
				composePath,
				'exec',
				'-T',
				'worker',
				'node',
				'-e',
				"const net=require('node:net');const socket=net.connect({host:'host.docker.internal',port:Number(process.argv[1])});const timer=setTimeout(()=>socket.destroy(new Error('timeout')),5000);socket.once('connect',()=>{clearTimeout(timer);socket.end();process.exit(0)});socket.once('error',()=>{clearTimeout(timer);process.exit(1)});",
				String(target.port),
			],
			{ cwd: root, encoding: 'utf8', stdio: 'ignore', timeout: 10_000 },
		);
		if (probe.error || probe.status !== 0) {
			throw new Error(
				'Twenty worker could not reach the host n8n port. Confirm n8n is running and listening beyond loopback for the Docker bridge.',
			);
		}
		console.log('Twenty worker host-bridge reachability passed.');
		console.log(
			'Native webhook delivery is ready for the manual step: register the container-reachable URL and create or update a uniquely owned local record.',
		);
	} catch (error) {
		fail(error instanceof Error ? error.message : 'Local webhook qualification failed.');
	}
}
