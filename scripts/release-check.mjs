import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { isValidN8nPackageName } from './package-name.mjs';
import { githubTagFailure } from './release-check-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const failures = [];

function fail(message) {
	failures.push(message);
}

function read(path) {
	return readFileSync(resolve(root, path), 'utf8');
}

function hasPlaceholder(value) {
	return typeof value === 'string' && /<\.\.\.|TODO|CHANGEME/i.test(value);
}

const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
const publishWorkflow = read('.github/workflows/publish.yml');
const ciWorkflow = read('.github/workflows/ci.yml');
const releasing = read('RELEASING.md');
const readme = read('README.md');
const changelog = read('CHANGELOG.md');
const webhookCredentialSource = read('credentials/TwentyWebhookApi.credentials.ts');
const nodeLoadSmoke = read('scripts/node-load-smoke.mjs');
const officialIconHash = '0016254102d200b1598b4c1ecb88dfa398ec3a34db0616ed9441eda887ff2fef';

if (!isValidN8nPackageName(packageJson.name ?? '')) {
	fail(
		'package.json name must be a lowercase n8n-nodes-* name, optionally under a lowercase npm scope',
	);
}

if (packageJson.name !== '@blackswampai/n8n-nodes-twentycrm') {
	fail('package.json name must match the approved @blackswampai/n8n-nodes-twentycrm identity');
}
if (packageJson.version !== '0.1.1') {
	fail('package.json version must be exactly 0.1.1 for this release candidate');
}
if (!/^## 0\.1\.1$/m.test(changelog)) {
	fail('CHANGELOG.md must contain a real 0.1.1 release entry');
}
if (
	packageLock.version !== packageJson.version ||
	packageLock.packages?.['']?.version !== packageJson.version
) {
	fail('package.json and package-lock.json versions must agree');
}

for (const [label, value] of [
	['name', packageJson.name],
	['description', packageJson.description],
	['homepage', packageJson.homepage],
	['repository.url', packageJson.repository?.url],
	['author.name', packageJson.author?.name],
	['author.email', packageJson.author?.email],
]) {
	if (!value || hasPlaceholder(value))
		fail(`package.json ${label} is missing or still a placeholder`);
}
if (packageJson.homepage !== 'https://blackswampai.com/n8n-nodes/twenty-crm/') {
	fail('package.json homepage must be the Black Swamp AI Twenty CRM integration page');
}

if (packageJson.private === true) fail('package.json must not be private');
if (packageJson.license !== 'MIT') fail('package.json license must be MIT for n8n verification');
if (!packageJson.keywords?.includes('n8n-community-node-package')) {
	fail('package.json keywords must contain n8n-community-node-package');
}
if (Object.keys(packageJson.dependencies ?? {}).length > 0) {
	fail('runtime dependencies require explicit n8n verification review; remove or justify them');
}
if (packageJson.peerDependencies?.['n8n-workflow'] !== '*') {
	fail('n8n-workflow must remain a host-provided peer dependency');
}
if (packageJson.n8n?.strict !== true) fail('package.json n8n.strict must be true');
if (
	JSON.stringify(packageJson.n8n?.nodes) !==
	JSON.stringify(['dist/nodes/Twenty/Twenty.node.js', 'dist/nodes/Twenty/TwentyTrigger.node.js'])
) {
	fail(
		'package.json must register exactly the compiled Twenty CRM action and Twenty CRM Trigger nodes in the approved order',
	);
}
if (
	JSON.stringify(packageJson.n8n?.credentials) !==
	JSON.stringify([
		'dist/credentials/TwentyApi.credentials.js',
		'dist/credentials/TwentyWebhookApi.credentials.js',
	])
) {
	fail(
		'package.json must register exactly the compiled Twenty API and Twenty Webhook API credentials in the approved order',
	);
}
if (packageJson.publishConfig?.access !== 'public') fail('publishConfig.access must be public');
if (packageJson.engines?.node !== '>=22.22.0')
	fail('engines.node must match the current >=22.22.0 baseline');
if (packageJson.scripts?.release !== 'n8n-node release')
	fail('release script must use n8n-node release');
if (packageJson.scripts?.prepublishOnly !== 'n8n-node prerelease') {
	fail('prepublishOnly must use the n8n-node prerelease guard');
}
if (packageJson.scripts?.['smoke:install'] !== 'node scripts/package-install-smoke.mjs') {
	fail('smoke:install must run the isolated packed-package install/load audit');
}
if (!ciWorkflow.includes('- run: npm run smoke:install')) {
	fail('CI must run the isolated packed-package install/load audit');
}
if (!releasing.includes('npm run smoke:install')) {
	fail('RELEASING.md must include the isolated packed-package install/load audit');
}

if (!publishWorkflow.includes("- 'v*.*.*'"))
	fail('publish workflow must trigger on v-prefixed version tags');
if (!publishWorkflow.includes('runs-on: ubuntu-latest'))
	fail('publish workflow must use a GitHub-hosted Ubuntu runner');
if (!/contents:\s*read/.test(publishWorkflow)) fail('publish workflow needs contents: read');
if (!/id-token:\s*write/.test(publishWorkflow)) fail('publish workflow needs id-token: write');
if (/contents:\s*write/.test(publishWorkflow))
	fail('publish workflow must not grant contents: write');
for (const statement of [
	"node-version: '24'",
	"registry-url: 'https://registry.npmjs.org'",
	'package-manager-cache: false',
	'run: node scripts/verify-npm-version.mjs',
	'run: npm ci',
]) {
	if (!publishWorkflow.includes(statement))
		fail(`publish workflow is missing required setup: ${statement}`);
}
const publishCommands = [
	'npm run format:check',
	'npm run lint',
	'npm run typecheck',
	'npm test',
	'npm run build',
	'npm run release:check',
	'npm run package:check',
	'npm run smoke:load',
	'npm run smoke:install',
	'npm run release',
];
const workflowRunCommands = [...publishWorkflow.matchAll(/^\s*(?:-\s*)?run:\s*(.+)$/gm)].map(
	(match) => match[1].trim(),
);
let previousCommandIndex = -1;
for (const command of publishCommands) {
	const commandIndex = workflowRunCommands.indexOf(command, previousCommandIndex + 1);
	if (commandIndex < 0) fail(`publish workflow is missing required ordered command: ${command}`);
	previousCommandIndex = commandIndex;
}
if (workflowRunCommands.filter((command) => command === 'npm run release').length !== 1) {
	fail('publish workflow must run npm run release exactly once');
}
if (!publishWorkflow.includes('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}')) {
	fail('publish workflow must map the bootstrap NPM_TOKEN secret directly to NODE_AUTH_TOKEN');
}
if (/npm config|_authToken|echo[^\n]*NPM_TOKEN|run:\s*\|/.test(publishWorkflow)) {
	fail('publish workflow must not materialize the npm token through shell or npm configuration');
}

const tagFailure = githubTagFailure(packageJson.version);
if (tagFailure) fail(tagFailure);

for (const heading of [
	'## Installation',
	'## Compatibility',
	'## Credentials',
	'## Operations',
	'## License',
]) {
	if (!readme.includes(heading)) fail(`README is missing ${heading}`);
}
if (hasPlaceholder(readme)) fail('README still contains a placeholder');
for (const statement of [
	'unofficial Black Swamp AI community integration',
	'not affiliated with, sponsored by, or endorsed by Twenty.com, PBC',
	'1642be86f5c17217372366b9e2a950ebf88a53db',
]) {
	if (!readme.includes(statement)) fail(`README is missing required notice: ${statement}`);
}
if (/does not provide API operations|no live installation has been qualified/i.test(readme)) {
	fail('README contains a stale foundation or qualification claim');
}
for (const statement of [
	'# @blackswampai/n8n-nodes-twentycrm',
	'https://img.shields.io/npm/v/%40blackswampai%2Fn8n-nodes-twentycrm',
	'https://github.com/BlackSwampAI/n8n-nodes-twentycrm/actions/workflows/ci.yml/badge.svg',
	'https://blackswampai.com/n8n-nodes/twenty-crm/',
	'[SLSA provenance attestation](https://slsa.dev/provenance/v1)',
	'traces the package to the repository and commit it was built from',
	'npm view @blackswampai/n8n-nodes-twentycrm dist.attestations',
]) {
	if (!readme.includes(statement)) fail(`README is missing package presentation: ${statement}`);
}
if (/under active development|has not been published|after publication/i.test(readme)) {
	fail('README contains stale unpublished-package language');
}
if (webhookCredentialSource.includes('credential-test-required')) {
	fail('Twenty Webhook API credential must not suppress the credential-test-required rule');
}
for (const statement of [
	"trigger.description.credentials?.[0]?.testedBy !== 'twentyApiCredentialTest'",
	"trigger.description.credentials?.[1]?.testedBy !== 'twentyWebhookCredentialTest'",
	"typeof trigger.methods?.credentialTest?.twentyApiCredentialTest !== 'function'",
	"typeof trigger.methods?.credentialTest?.twentyWebhookCredentialTest !== 'function'",
]) {
	if (!nodeLoadSmoke.includes(statement))
		fail(`compiled load smoke is missing credential-test invariant: ${statement}`);
}

for (const path of ['nodes/Twenty/twenty.svg', 'nodes/Twenty/twenty.dark.svg']) {
	const hash = createHash('sha256').update(read(path)).digest('hex');
	if (hash !== officialIconHash) fail(`${path} must match the pinned official upstream asset`);
}

for (const path of ['LICENSE.md', 'CHANGELOG.md', 'RELEASING.md']) {
	if (!existsSync(resolve(root, path))) fail(`${path} is required`);
}

try {
	const origin = execFileSync('git', ['remote', 'get-url', 'origin'], {
		cwd: root,
		encoding: 'utf8',
	}).trim();
	const normalizedOrigin = origin
		.replace(/^git@github\.com:/, 'https://github.com/')
		.replace(/\.git$/, '');
	const normalizedRepository = String(packageJson.repository?.url ?? '')
		.replace(/^git\+/, '')
		.replace(/\.git$/, '');
	if (normalizedRepository !== 'https://github.com/BlackSwampAI/n8n-nodes-twentycrm') {
		fail('repository.url must match the approved BlackSwampAI repository');
	}
	if (normalizedOrigin !== normalizedRepository) {
		fail(`repository.url must match origin exactly (${normalizedOrigin})`);
	}
} catch {
	fail('unable to verify the GitHub origin');
}

if (failures.length) {
	console.error('Release audit failed:\n');
	for (const failure of failures) console.error(`- ${failure}`);
	process.exit(1);
}

console.log(`Release audit passed for ${packageJson.name}@${packageJson.version}`);
