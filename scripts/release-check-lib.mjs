export function githubTagFailure(version, env = process.env) {
	const isGitHubTag = env.GITHUB_REF_TYPE === 'tag' || env.GITHUB_REF?.startsWith('refs/tags/');
	return isGitHubTag && env.GITHUB_REF_NAME !== `v${version}`
		? `GitHub tag must exactly match package version v${version}`
		: undefined;
}

export function supportsNpmTrustedPublishing(version) {
	const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version.trim());
	if (!match) return false;
	const current = match.slice(1).map(Number);
	const minimum = [11, 5, 1];
	for (let index = 0; index < minimum.length; index++) {
		if (current[index] > minimum[index]) return true;
		if (current[index] < minimum[index]) return false;
	}
	return true;
}

export function hasImmediateReleaseTagGuard(workflow) {
	return /- uses: actions\/checkout@v6\n\s+with:\n\s+fetch-depth: 0\n\n\s+- name: Verify release tag\n\s+run: node scripts\/verify-release-tag\.mjs/.test(
		workflow,
	);
}
