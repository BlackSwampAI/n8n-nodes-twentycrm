/* eslint-disable @n8n/community-nodes/no-restricted-imports -- Offline harness tests inspect repository-local files and do not ship with the community node. */
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	assertPinnedCompose,
	parseEnv,
	redactHarnessText,
	requireLocalApiKey,
	TWENTY_IMAGE,
	validateGraphqlPayload,
	writePrivateFile,
} from './twenty-harness-lib.mjs';

const compose = readFileSync(
	resolve(import.meta.dirname, '../integration/twenty/docker-compose.yml'),
	'utf8',
);
const liveTest = readFileSync(resolve(import.meta.dirname, 'twenty-live-test.mjs'), 'utf8');
const packageJson = JSON.parse(
	readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
) as { scripts: Record<string, string> };

describe('local Twenty Compose harness', () => {
	it('pins the verified Twenty image and every supporting image', () => {
		expect(() => assertPinnedCompose(compose)).not.toThrow();
		expect(
			compose.match(new RegExp(TWENTY_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')),
		).toHaveLength(2);
		expect(compose).toContain('image: postgres:16.10-alpine');
		expect(compose).toContain('image: redis:7.4.6-alpine');
		expect(compose.toLowerCase()).not.toContain('latest');
	});

	it('binds only the server to localhost and defines health checks and isolated volumes', () => {
		expect(compose).toContain('127.0.0.1:${TWENTY_PORT:-3020}:3000');
		expect(compose).toContain('http://localhost:3000/healthz');
		expect(compose).toContain('name: n8n-twentycrm-integration');
		expect(compose).toContain('db-data:');
		expect(compose).toContain('server-local-data:');
	});

	it('exposes explicit lifecycle commands while keeping live qualification opt-in', () => {
		expect(packageJson.scripts).toMatchObject({
			'twenty:start': 'node scripts/twenty-harness.mjs start',
			'twenty:wait': 'node scripts/twenty-harness.mjs wait',
			'twenty:stop': 'node scripts/twenty-harness.mjs stop',
			'twenty:clean': 'node scripts/twenty-harness.mjs clean',
			'test:integration': 'npm run build && node scripts/twenty-live-test.mjs',
		});
		expect(packageJson.scripts.test).toBe('vitest run');
	});

	it('qualifies Core and Metadata GraphQL independently with read-only queries', () => {
		expect(liveTest).toContain("'Core GraphQL'");
		expect(liveTest).toContain('urls.coreGraphql');
		expect(liveTest).toContain('query HarnessCoreProbe');
		expect(liveTest).toContain('people(first: 1)');
		expect(liveTest).toContain("'Metadata GraphQL'");
		expect(liveTest).toContain('urls.metadataGraphql');
		expect(liveTest).toContain('query HarnessMetadataProbe');
		expect(liveTest).toContain('OBJECT_METADATA_QUERY');
		expect(liveTest).toContain('normalizeTwentyObject');
		expect(liveTest).toContain('object.fields.length > 0');
		expect(liveTest).not.toMatch(/\bmutation\b/);
		expect(liveTest).toContain('AbortSignal.timeout(PROBE_TIMEOUT_MS)');
		expect(liveTest).toContain('const PROBE_TIMEOUT_MS = 15_000');
	});
});

describe('local Twenty harness helpers', () => {
	it('parses local environment values without evaluating content', () => {
		expect(parseEnv('# comment\nTWENTY_PORT=3020\nSAMPLE_VALUE=value=with=equals\n')).toEqual({
			TWENTY_PORT: '3020',
			SAMPLE_VALUE: 'value=with=equals',
		});
	});

	it('redacts every configured secret and Bearer value from retained logs', () => {
		const output = redactHarnessText(
			'password-a Authorization: Bearer api-key TWENTY_API_KEY=api-key private-safe',
			['password-a', 'api-key'],
		);
		expect(output).not.toContain('password-a');
		expect(output).not.toContain('api-key');
		expect(output).toContain('[REDACTED]');
	});

	it('requires a local-only API key with actionable setup guidance', () => {
		expect(() => requireLocalApiKey({})).toThrow('Create one in Settings > APIs & Webhooks');
	});

	it('writes new and overwritten retained logs with mode 0600', () => {
		const directory = mkdtempSync(join(tmpdir(), 'twenty-harness-'));
		const path = join(directory, 'failure.log');
		try {
			writePrivateFile(path, 'first');
			expect(statSync(path).mode & 0o777).toBe(0o600);
			chmodSync(path, 0o644);
			writePrivateFile(path, 'second');
			expect(statSync(path).mode & 0o777).toBe(0o600);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('accepts expected GraphQL data and rejects HTTP-200 GraphQL failures safely', () => {
		expect(() =>
			validateGraphqlPayload('Core GraphQL', { data: { people: { edges: [] } } }, (data) =>
				Array.isArray((data as { people?: { edges?: unknown } })?.people?.edges),
			),
		).not.toThrow();
		expect(() =>
			validateGraphqlPayload(
				'Metadata GraphQL',
				{ errors: [{ message: 'private payload' }] },
				() => true,
			),
		).toThrow('Metadata GraphQL returned GraphQL errors');
	});
});
