import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const runGit = (repository, args) =>
	execFileSync('git', args, {
		cwd: repository,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

export function verifyReleaseTag({ repository = process.cwd(), env = process.env } = {}) {
	const packageJson = JSON.parse(readFileSync(resolve(repository, 'package.json'), 'utf8'));
	const expectedRef = `refs/tags/v${packageJson.version}`;
	if (env.GITHUB_REF !== expectedRef)
		throw new Error(`GITHUB_REF must exactly match ${expectedRef}`);

	try {
		runGit(repository, ['show-ref', '--verify', '--quiet', expectedRef]);
	} catch {
		throw new Error(`release tag ref is missing: ${expectedRef}`);
	}
	if (runGit(repository, ['cat-file', '-t', expectedRef]) !== 'tag')
		throw new Error(`release tag must be annotated: ${expectedRef}`);

	const taggedCommit = runGit(repository, ['rev-parse', `${expectedRef}^{commit}`]);
	if (taggedCommit !== runGit(repository, ['rev-parse', 'HEAD']))
		throw new Error('release tag does not resolve to the checked-out HEAD');

	try {
		runGit(repository, ['show-ref', '--verify', '--quiet', 'refs/remotes/origin/main']);
	} catch {
		throw new Error('reviewed main ref is missing: refs/remotes/origin/main');
	}
	try {
		runGit(repository, ['merge-base', '--is-ancestor', taggedCommit, 'refs/remotes/origin/main']);
	} catch {
		throw new Error('tagged commit is not an ancestor of refs/remotes/origin/main');
	}

	return { expectedRef, taggedCommit };
}

const isDirectExecution =
	process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) {
	try {
		const result = verifyReleaseTag();
		console.log(`Verified annotated release tag ${result.expectedRef} in reviewed main history`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
