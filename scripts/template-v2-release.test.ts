/* eslint-disable @n8n/community-nodes/no-restricted-imports -- Release tooling tests use local temporary files only. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareNpmAuth } from './prepare-npm-auth.mjs';
import { isDeterministicSecurityFailure, isLikelyPropagationFailure } from './scan-policy.mjs';

const temporaryDirectories: string[] = [];
const packageJson = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
	name: string;
	version: string;
};
afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe('npm authentication preparation', () => {
	it('preserves setup-node configuration when a token exists', () => {
		const directory = mkdtempSync(join(tmpdir(), 'twenty-auth-test-'));
		temporaryDirectories.push(directory);
		const config = join(directory, '.npmrc');
		const contents =
			'//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\nregistry=https://registry.npmjs.org/\n';
		writeFileSync(config, contents);
		expect(prepareNpmAuth({ NODE_AUTH_TOKEN: 'present', NPM_CONFIG_USERCONFIG: config })).toBe(
			'token',
		);
		expect(readFileSync(config, 'utf8')).toBe(contents);
	});

	it('removes only the setup-node placeholder for tokenless OIDC', () => {
		const directory = mkdtempSync(join(tmpdir(), 'twenty-auth-test-'));
		temporaryDirectories.push(directory);
		const config = join(directory, '.npmrc');
		writeFileSync(
			config,
			'registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\nprovenance=true\n',
		);
		expect(prepareNpmAuth({ NODE_AUTH_TOKEN: '', NPM_CONFIG_USERCONFIG: config })).toBe('oidc');
		expect(readFileSync(config, 'utf8')).toBe(
			'registry=https://registry.npmjs.org/\nprovenance=true\n',
		);
	});
});

describe('published scanner retry policy', () => {
	const packageSpec = `${packageJson.name}@${packageJson.version}`;

	it('fails deterministic lint findings immediately', () => {
		const output = `Package ${packageSpec} has failed security checks\nReason: ESLint violations found\n404:3 error`;
		expect(isDeterministicSecurityFailure(output, packageSpec)).toBe(true);
		expect(isLikelyPropagationFailure(output, packageSpec)).toBe(false);
	});

	it('retries only recognized propagation failures for the exact version', () => {
		const analysis404 = `Package ${packageSpec} has failed security checks\nReason: Analysis failed: Request failed with status code 404`;
		const metadata = `Package ${packageSpec} has failed security checks\nReason: No package metadata found for version ${packageJson.version}`;
		const provenance404 = `Package ${packageSpec} has failed security checks\nReason: Could not fetch the source repository recorded in the package's npm provenance (Request failed with status code 404)`;
		expect(isLikelyPropagationFailure(analysis404, packageSpec)).toBe(true);
		expect(isLikelyPropagationFailure(metadata, packageSpec)).toBe(true);
		expect(isLikelyPropagationFailure(provenance404, packageSpec)).toBe(true);
		expect(
			isLikelyPropagationFailure(
				`Package ${packageSpec} has failed security checks\nReason: No package metadata found for version 0.1.2`,
				packageSpec,
			),
		).toBe(false);
		for (const reason of [
			"Could not fetch the source repository recorded in the package's npm provenance (Request failed with status code 403)",
			'ESLint violations found',
			'Request failed with status code 429',
			'ETIMEDOUT while fetching source',
			'Package policy rejected',
		]) {
			const output = `Package ${packageSpec} has failed security checks\nReason: ${reason}`;
			expect(isLikelyPropagationFailure(output, packageSpec)).toBe(false);
			expect(isDeterministicSecurityFailure(output, packageSpec)).toBe(true);
		}
	});
});
