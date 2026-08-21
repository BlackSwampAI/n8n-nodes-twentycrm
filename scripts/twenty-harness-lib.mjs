import { randomBytes } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const TWENTY_IMAGE =
	'twentycrm/twenty:v2.9.0@sha256:0afdba1494ea50bad6eb278a20ae35933317483f23501157c2ed866b74d4bc4a';

export function parseEnv(text) {
	const values = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const separator = line.indexOf('=');
		if (separator < 1) continue;
		values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
	}
	return values;
}

export function readEnv(path) {
	return parseEnv(readFileSync(path, 'utf8'));
}

export function createLocalEnv(path) {
	const secret = () => randomBytes(32).toString('base64url');
	const content = [
		'TWENTY_PORT=3020',
		'PG_DATABASE_USER=twenty_local',
		`PG_DATABASE_PASSWORD=${secret()}`,
		`ENCRYPTION_KEY=${secret()}`,
		`APP_SECRET=${secret()}`,
		'',
		'# Add TWENTY_API_KEY after creating it in the local Twenty UI.',
		'',
	].join('\n');
	mkdirSync(dirname(path), { recursive: true });
	writePrivateFile(path, content, 'wx');
}

export function writePrivateFile(path, content, flag = 'w') {
	writeFileSync(path, content, { encoding: 'utf8', mode: 0o600, flag });
	chmodSync(path, 0o600);
}

export function redactHarnessText(text, secrets = []) {
	let safe = String(text);
	for (const secret of secrets) {
		if (typeof secret === 'string' && secret.length > 0)
			safe = safe.split(secret).join('[REDACTED]');
	}
	return safe
		.replace(/(authorization\s*[:=]\s*)bearer\s+[^\s"']+/gi, '$1Bearer [REDACTED]')
		.replace(/(TWENTY_API_KEY\s*=\s*)[^\s]+/gi, '$1[REDACTED]');
}

export function validateGraphqlPayload(surface, payload, dataCheck) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		throw new Error(`${surface} returned an invalid JSON object`);
	}
	if (Array.isArray(payload.errors) && payload.errors.length > 0) {
		throw new Error(`${surface} returned GraphQL errors`);
	}
	if (!dataCheck(payload.data)) throw new Error(`${surface} did not return the expected data`);
}

export function requireLocalApiKey(env) {
	if (!env.TWENTY_API_KEY) {
		throw new Error(
			'Local Twenty API key is missing. Create one in Settings > APIs & Webhooks, then add TWENTY_API_KEY to integration/twenty/.env.',
		);
	}
	return env.TWENTY_API_KEY;
}

export function assertPinnedCompose(composeText) {
	if (!composeText.includes(TWENTY_IMAGE)) throw new Error('Twenty v2.9.0 digest pin is missing');
	if (/image:\s*[^\n]*(?:^|[:/@-])latest(?:\s|$)/im.test(composeText)) {
		throw new Error('Compose must not contain a latest image reference');
	}
	for (const service of ['server:', 'worker:', 'db:', 'redis:']) {
		if (!composeText.includes(`  ${service}`))
			throw new Error(`Compose service ${service} is missing`);
	}
}
