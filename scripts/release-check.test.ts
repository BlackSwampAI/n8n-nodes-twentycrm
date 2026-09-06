/* eslint-disable @n8n/community-nodes/no-restricted-imports -- Offline release tests inspect repository files and spawn the local audit only. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { githubTagFailure, supportsNpmTrustedPublishing } from './release-check-lib.mjs';

const root = resolve(import.meta.dirname, '..');

describe('release audit', () => {
	it.each([
		['11.5.0', false],
		['11.5.1', true],
		['11.6.0', true],
		['12.0.0', true],
		['10.99.99', false],
		['11.5', false],
		['011.5.1', false],
		['not-a-version', false],
		['11.5.1-beta.0', false],
	])('classifies npm Trusted Publishing version %s', (version, expected) => {
		expect(supportsNpmTrustedPublishing(version)).toBe(expected);
	});

	it('accepts ordinary local context and the exact package-version tag', () => {
		expect(githubTagFailure('0.1.4', {})).toBeUndefined();
		expect(
			githubTagFailure('0.1.4', {
				GITHUB_REF: 'refs/tags/v0.1.4',
				GITHUB_REF_NAME: 'v0.1.4',
				GITHUB_REF_TYPE: 'tag',
			}),
		).toBeUndefined();
	});

	it('rejects a GitHub tag that does not exactly match the package version', () => {
		expect(
			githubTagFailure('0.1.4', {
				GITHUB_REF: 'refs/tags/v0.1.2',
				GITHUB_REF_NAME: 'v0.1.2',
				GITHUB_REF_TYPE: 'tag',
			}),
		).toBe('GitHub tag must exactly match package version v0.1.4');
	});

	it('pins the complete OIDC gate and postpublication scanner around one publish action', () => {
		const workflow = readFileSync(resolve(root, '.github/workflows/publish.yml'), 'utf8');
		expect(workflow).toContain('run: node scripts/verify-npm-version.mjs');
		expect(workflow.indexOf('run: node scripts/verify-npm-version.mjs')).toBeLessThan(
			workflow.indexOf('run: npm ci'),
		);
		expect(readFileSync(resolve(root, 'scripts/release-check.mjs'), 'utf8')).toContain(
			"'run: node scripts/verify-npm-version.mjs'",
		);
		const commands = [
			'npm run format:check',
			'npm run lint',
			'npm run typecheck',
			'npm test',
			'npm run build',
			'npm run scan:source',
			'npm run release:check',
			'npm run package:check',
			'npm run smoke:load',
			'npm run smoke:install',
			'npm run release',
			'npm run scan:published',
		];
		let previous = -1;
		for (const command of commands) {
			const index = workflow.indexOf(`run: ${command}`, previous + 1);
			expect(index, command).toBeGreaterThan(previous);
			previous = index;
		}
		expect(workflow.match(/run: npm run release$/gm)).toHaveLength(1);
		expect(workflow).toContain('node scripts/prepare-npm-auth.mjs');
		expect(readFileSync(resolve(root, 'scripts/scan-published.mjs'), 'utf8')).toContain(
			'has passed all security checks',
		);
		expect(workflow).not.toContain('secrets.NPM_TOKEN');
		expect(workflow).not.toMatch(/npm config|_authToken/);
		expect(workflow).toMatch(/timeout-minutes:\s*30/);
	});

	it('requires the adopted Template v2 marker and final documentation', () => {
		const marker = JSON.parse(readFileSync(resolve(root, '.blackswamp/template.json'), 'utf8'));
		expect(marker).toEqual({
			schemaVersion: 1,
			templateVersion: '2.0.0',
			sourceRepository: 'https://github.com/christopherjnelson/n8n-community-node-template',
		});
		const releaseCheck = readFileSync(resolve(root, 'scripts/release-check.mjs'), 'utf8');
		for (const path of [
			'.github/pull_request_template.md',
			'docs/BATCH_HANDOFF_TEMPLATE.md',
			'docs/TEMPLATE_MIGRATIONS.md',
			'docs/api-matrix.md',
			'docs/testing.md',
			'docs/branding.md',
			'.codex/config.toml',
			'.codex/agents/builder.toml',
		]) {
			expect(releaseCheck).toContain(path);
		}
		const builder = readFileSync(resolve(root, '.codex/agents/builder.toml'), 'utf8');
		expect(builder).toContain('name = "builder"');
		expect(builder).toContain('model = "gpt-5.6-sol"');
		expect(builder).toContain('model_reasoning_effort = "low"');
	});

	it('requires the API credential-class test and local webhook credential test', () => {
		const credential = readFileSync(
			resolve(root, 'credentials/TwentyWebhookApi.credentials.ts'),
			'utf8',
		);
		const smoke = readFileSync(resolve(root, 'scripts/node-load-smoke.mjs'), 'utf8');
		expect(credential).not.toContain('credential-test-required');
		expect(smoke).toContain('node.description.credentials?.[0]?.testedBy !== undefined');
		expect(smoke).toContain("typeof credential.test?.request?.baseURL !== 'string'");
		expect(smoke).toContain("credential.test?.rules?.[0]?.type !== 'responseSuccessBody'");
		expect(smoke).toContain('trigger.description.credentials?.[0]?.testedBy !== undefined');
		expect(smoke).toContain(
			"trigger.description.credentials?.[1]?.testedBy !== 'twentyWebhookCredentialTest'",
		);
		expect(smoke).toContain(
			"typeof trigger.methods?.credentialTest?.twentyWebhookCredentialTest !== 'function'",
		);
	});
});
