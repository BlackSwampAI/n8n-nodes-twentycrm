/* eslint-disable @n8n/community-nodes/no-restricted-imports -- Isolated release tests create synthetic Git repositories only. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { verifyReleaseTag } from './verify-release-tag.mjs';

const root = resolve(import.meta.dirname, '..');
const scratchRoot = resolve(root, '.codex-scratch');
mkdirSync(scratchRoot, { recursive: true });
const fixtureRoot = mkdtempSync(resolve(scratchRoot, 'verify-release-tag-tests-'));
const fixtures: string[] = [];

function git(repository: string, ...args: string[]): string {
	// eslint-disable-next-line @n8n/community-nodes/no-dangerous-functions -- Fixed git executable with test-owned arguments against offline synthetic Git fixtures only.
	return execFileSync('git', args, {
		cwd: repository,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

function repository(version = '0.1.5'): string {
	const path = mkdtempSync(resolve(fixtureRoot, 'repo-'));
	fixtures.push(path);
	git(path, 'init', '-b', 'main');
	git(path, 'config', 'user.name', 'Release Test');
	git(path, 'config', 'user.email', 'release-test@example.invalid');
	writeFileSync(resolve(path, 'package.json'), `${JSON.stringify({ version })}\n`);
	writeFileSync(resolve(path, 'fixture.txt'), 'first\n');
	git(path, 'add', 'package.json', 'fixture.txt');
	git(path, 'commit', '-m', 'first');
	return path;
}

function setReviewedMain(path: string, commit = 'HEAD'): void {
	git(path, 'update-ref', 'refs/remotes/origin/main', git(path, 'rev-parse', commit));
}

function tag(path: string, annotated = true): void {
	git(path, 'tag', ...(annotated ? ['-a', 'v0.1.5', '-m', 'release'] : ['v0.1.5']));
}

afterEach(() => {
	while (fixtures.length > 0) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

describe('release tag verifier', () => {
	it('accepts an annotated version tag at the reviewed main head', () => {
		const path = repository();
		setReviewedMain(path);
		tag(path);
		expect(
			verifyReleaseTag({ repository: path, env: { GITHUB_REF: 'refs/tags/v0.1.5' } }),
		).toMatchObject({
			expectedRef: 'refs/tags/v0.1.5',
			taggedCommit: git(path, 'rev-parse', 'HEAD'),
		});
	});

	it('accepts an older annotated tag whose target remains in reviewed main history', () => {
		const path = repository();
		tag(path);
		const taggedCommit = git(path, 'rev-parse', 'HEAD');
		writeFileSync(resolve(path, 'fixture.txt'), 'second\n');
		git(path, 'add', 'fixture.txt');
		git(path, 'commit', '-m', 'second');
		setReviewedMain(path);
		git(path, 'checkout', '--detach', taggedCommit);
		expect(
			verifyReleaseTag({ repository: path, env: { GITHUB_REF: 'refs/tags/v0.1.5' } }),
		).toMatchObject({ taggedCommit });
	});

	it('rejects the wrong GitHub ref or package version', () => {
		const path = repository();
		setReviewedMain(path);
		tag(path);
		expect(() =>
			verifyReleaseTag({ repository: path, env: { GITHUB_REF: 'refs/tags/v0.1.4' } }),
		).toThrow('GITHUB_REF must exactly match refs/tags/v0.1.5');
		writeFileSync(resolve(path, 'package.json'), `${JSON.stringify({ version: '0.1.6' })}\n`);
		expect(() =>
			verifyReleaseTag({ repository: path, env: { GITHUB_REF: 'refs/tags/v0.1.5' } }),
		).toThrow('GITHUB_REF must exactly match refs/tags/v0.1.6');
	});

	it('rejects a missing or lightweight release tag', () => {
		const missing = repository();
		setReviewedMain(missing);
		expect(() =>
			verifyReleaseTag({ repository: missing, env: { GITHUB_REF: 'refs/tags/v0.1.5' } }),
		).toThrow('release tag ref is missing');

		const lightweight = repository();
		setReviewedMain(lightweight);
		tag(lightweight, false);
		expect(() =>
			verifyReleaseTag({ repository: lightweight, env: { GITHUB_REF: 'refs/tags/v0.1.5' } }),
		).toThrow('release tag must be annotated');
	});

	it('rejects a tag that does not resolve to HEAD', () => {
		const path = repository();
		tag(path);
		writeFileSync(resolve(path, 'fixture.txt'), 'second\n');
		git(path, 'add', 'fixture.txt');
		git(path, 'commit', '-m', 'second');
		setReviewedMain(path);
		expect(() =>
			verifyReleaseTag({ repository: path, env: { GITHUB_REF: 'refs/tags/v0.1.5' } }),
		).toThrow('release tag does not resolve to the checked-out HEAD');
	});

	it('rejects a missing reviewed main ref', () => {
		const path = repository();
		tag(path);
		expect(() =>
			verifyReleaseTag({ repository: path, env: { GITHUB_REF: 'refs/tags/v0.1.5' } }),
		).toThrow('reviewed main ref is missing');
	});

	it('rejects a tagged commit outside reviewed main history', () => {
		const path = repository();
		setReviewedMain(path);
		writeFileSync(resolve(path, 'fixture.txt'), 'unreviewed\n');
		git(path, 'add', 'fixture.txt');
		git(path, 'commit', '-m', 'unreviewed');
		tag(path);
		expect(() =>
			verifyReleaseTag({ repository: path, env: { GITHUB_REF: 'refs/tags/v0.1.5' } }),
		).toThrow('tagged commit is not an ancestor');
	});
});
