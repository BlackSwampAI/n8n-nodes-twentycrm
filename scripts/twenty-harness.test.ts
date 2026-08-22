/* eslint-disable @n8n/community-nodes/no-restricted-imports -- Offline harness tests inspect repository-local files and do not ship with the community node. */
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	assertPinnedCompose,
	DOCKER_HOST_ALIAS,
	localWebhookTarget,
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
const webhookQualification = readFileSync(
	resolve(import.meta.dirname, 'twenty-webhook-qualify.mjs'),
	'utf8',
);
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

	it('adds the supported local outbound setting and Linux host bridge only to the worker', () => {
		expect(compose.match(/OUTBOUND_HTTP_SAFE_MODE_ENABLED/g)).toHaveLength(1);
		expect(compose).toContain("OUTBOUND_HTTP_SAFE_MODE_ENABLED: 'false'");
		expect(compose).toContain(`'${DOCKER_HOST_ALIAS}:host-gateway'`);
		expect(compose.indexOf('OUTBOUND_HTTP_SAFE_MODE_ENABLED')).toBeGreaterThan(
			compose.indexOf('  worker:'),
		);
	});

	it('exposes explicit lifecycle commands while keeping live qualification opt-in', () => {
		expect(packageJson.scripts).toMatchObject({
			'twenty:start': 'node scripts/twenty-harness.mjs start',
			'twenty:wait': 'node scripts/twenty-harness.mjs wait',
			'twenty:stop': 'node scripts/twenty-harness.mjs stop',
			'twenty:clean': 'node scripts/twenty-harness.mjs clean',
			'test:integration': 'npm run build && node scripts/twenty-live-test.mjs',
			'test:webhook-bridge': 'node scripts/twenty-webhook-qualify.mjs',
		});
		expect(packageJson.scripts.test).toBe('vitest run');
	});

	it('keeps native webhook qualification local, bounded, and sanitized', () => {
		expect(webhookQualification).toContain('localWebhookTarget(env.N8N_WEBHOOK_URL)');
		expect(webhookQualification).toContain("'host.docker.internal'");
		expect(webhookQualification).toContain('timeout: 10_000');
		expect(webhookQualification).toContain("stdio: 'ignore'");
		expect(webhookQualification).not.toContain('console.log(target');
		expect(webhookQualification).not.toContain('console.log(env');
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
		expect(liveTest).toContain('createRecordService');
		expect(liveTest).toContain('reconstructRecordPayload');
		expect(liveTest).toContain("field.type === 'ADDRESS'");
		expect(liveTest).toContain('__addressCity');
		expect(liveTest).toContain('finally');
		expect(liveTest).toContain('cleanupOwnedLifecycleFixture');
		expect(liveTest).toContain('cleanupOwnedPersonFixture');
		expect(liveTest).toContain('cleanupOpportunityLifecycle');
		expect(liveTest).toContain(
			'Compiled fixed Person Create/Get/Get Many/Update qualification passed.',
		);
		expect(liveTest).toContain('findOwnedLifecycleRecords');
		expect(liveTest).toContain('name[eq]');
		expect(liveTest).toContain('record.name !== name');
		expect(liveTest).toContain("lifecycleService.delete('company', createdId)");
		expect(liveTest).toContain("lifecycleService.delete('company', match.id)");
		expect(liveTest).toContain('Disposable record cleanup could not verify absence.');
		expect(liveTest).toContain('Disposable Person cleanup could not verify absence.');
		expect(liveTest).toContain('Opportunity cleanup could not verify absence.');
		expect(liveTest).toContain('function hasOwnedRecordId(record)');
		expect(liveTest).toContain(
			'!hasOwnedRecordId(record) || record.name !== opportunityCompanyName',
		);
		expect(liveTest).toContain('!hasOwnedRecordId(record) || record.name !== name');
		expect(liveTest).toContain("field.relation?.type === 'MANY_TO_ONE'");
		expect(liveTest).toContain('function isQualifiedDirectRelation');
		expect(liveTest).toContain('field.relation.source.objectApiNameSingular === objectApiName');
		expect(liveTest).toContain('field.relation.source.fieldApiName === fieldApiName');
		expect(liveTest).toContain('field.relation.target.objectApiNameSingular === targetApiName');
		expect(liveTest).toContain('fetched.name !== opportunityName');
		expect(liveTest).toContain('fetched.title !== title');
		expect(liveTest).toContain('companyId: opportunityCompanyId');
		expect(liveTest).toContain('pointOfContactId: opportunityPersonId');
		expect(liveTest).toContain(
			'Compiled fixed Opportunity relation-ID lifecycle qualification passed.',
		);
		expect(liveTest).toContain('runOwnedTitleLifecycle');
		expect(liveTest).toContain("apiName: 'task'");
		expect(liveTest).toContain("apiName: 'note'");
		expect(liveTest).toContain('assigneeId: workspaceMemberId');
		expect(liveTest).toContain('bodyV2__markdown');
		expect(liveTest).toContain('Fixed-resource cleanup could not verify absence.');
		expect(liveTest).toContain(
			'Compiled fixed Task rich-text/relation lifecycle qualification passed.',
		);
		expect(liveTest).toContain('Compiled fixed Note rich-text lifecycle qualification passed.');
		expect(liveTest).toContain('crypto.randomUUID()');
		expect(liveTest).toContain("filter: 'deletedAt[is]:NULL'");
		expect(liveTest).toContain("orderBy: 'createdAt[AscNullsFirst]'");
		expect(liveTest).toContain("recordService.get('person'");
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
		const localWebhook = 'http://localhost:5678/webhook/synthetic-private-path';
		const containerWebhook = 'http://host.docker.internal:5678/webhook/synthetic-private-path';
		const output = redactHarnessText(
			`password-a Authorization: Bearer api-key TWENTY_API_KEY=api-key ${localWebhook} ${containerWebhook} private-safe`,
			['password-a', 'api-key', localWebhook, containerWebhook],
		);
		expect(output).not.toContain('password-a');
		expect(output).not.toContain('api-key');
		expect(output).not.toContain('synthetic-private-path');
		expect(output).toContain('[REDACTED]');
	});

	it('requires a local-only API key with actionable setup guidance', () => {
		expect(() => requireLocalApiKey({})).toThrow('Create one in Settings > APIs & Webhooks');
	});

	it('rewrites only explicit localhost production webhook URLs for the Docker worker', () => {
		expect(localWebhookTarget('http://localhost:5678/webhook/synthetic-path')).toEqual({
			containerUrl: 'http://host.docker.internal:5678/webhook/synthetic-path',
			port: 5678,
		});
		expect(localWebhookTarget('http://127.0.0.1:5678/webhook/synthetic-path').containerUrl).toBe(
			'http://host.docker.internal:5678/webhook/synthetic-path',
		);
	});

	it.each([
		'https://localhost:5678/webhook/synthetic',
		'http://example.com:5678/webhook/synthetic',
		'http://localhost/webhook/synthetic',
		'http://localhost:5678/webhook-test/synthetic',
		'http://user:secret@localhost:5678/webhook/synthetic',
		'http://localhost:5678/webhook/synthetic#fragment',
		'not-a-url',
	])('rejects unsafe or non-production local webhook targets', (value) => {
		expect(() => localWebhookTarget(value)).toThrow(/N8N_WEBHOOK_URL/);
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
