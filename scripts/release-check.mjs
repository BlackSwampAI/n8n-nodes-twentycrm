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
const sourceScannerSource = read('scripts/scan-source.mjs');
const publishedScannerSource = read('scripts/scan-published.mjs');
const templateMarkerPath = '.blackswamp/template.json';
let templateMarker;
if (!existsSync(resolve(root, templateMarkerPath))) {
	fail(`${templateMarkerPath} is required`);
} else {
	try {
		templateMarker = JSON.parse(read(templateMarkerPath));
	} catch {
		fail(`${templateMarkerPath} must contain valid JSON`);
	}
}
const finalDocumentation = ['docs/api-matrix.md', 'docs/testing.md', 'docs/branding.md'];
const adoptedBaselineArtifacts = [
	'.codex/config.toml',
	'.codex/agents/builder.toml',
	'.github/pull_request_template.md',
	'docs/BATCH_HANDOFF_TEMPLATE.md',
	'docs/TEMPLATE_MIGRATIONS.md',
];
const templateDocumentation = [
	'docs/API_MATRIX_TEMPLATE.md',
	'docs/TESTING_TEMPLATE.md',
	'docs/BRANDING_TEMPLATE.md',
];
const officialIconHash = '0016254102d200b1598b4c1ecb88dfa398ec3a34db0616ed9441eda887ff2fef';

if (!isValidN8nPackageName(packageJson.name ?? '')) {
	fail(
		'package.json name must be a lowercase n8n-nodes-* name, optionally under a lowercase npm scope',
	);
}

if (packageJson.name !== '@blackswampai/n8n-nodes-twentycrm') {
	fail('package.json name must match the approved @blackswampai/n8n-nodes-twentycrm identity');
}
if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(packageJson.version ?? ''))
	fail('package.json version must be a plain semantic version');
const escapedVersion = String(packageJson.version ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
if (!new RegExp(`^## ${escapedVersion}$`, 'm').test(changelog))
	fail(`CHANGELOG.md must contain a release heading for ${packageJson.version}`);
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
if (packageJson.packageManager !== 'npm@11.19.0') fail('packageManager must pin npm@11.19.0');
if (packageJson.devDependencies?.['@n8n/scan-community-package'] !== '0.34.0')
	fail('official community-package scanner must remain pinned to 0.34.0');
for (const script of ['scan:source', 'scan:published']) {
	if (!packageJson.scripts?.[script]) fail(`package.json must define ${script}`);
}
if (
	!sourceScannerSource.includes('SOURCE_FILE_PATTERNS') ||
	!sourceScannerSource.includes("'dist/**/*.js'") ||
	!sourceScannerSource.includes("'package.json'")
) {
	fail('scanner preflight must inspect official source patterns and built package artifacts');
}
if (!publishedScannerSource.includes('prepareNpmAuth(process.env)'))
	fail('published scanner must prepare tokenless npm authentication');
if (!publishedScannerSource.includes('has passed all security checks'))
	fail('published scanner must require the official exact success text');
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
if (!/timeout-minutes:\s*30/.test(publishWorkflow))
	fail('publish workflow must have a 30-minute job timeout');
if (!/timeout-minutes:\s*20/.test(ciWorkflow)) fail('CI must have a 20-minute job timeout');
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
	'npm run scan:source',
	'npm run release:check',
	'npm run package:check',
	'npm run smoke:load',
	'npm run smoke:install',
	'npm run release',
	'npm run scan:published',
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
if (publishWorkflow.includes('secrets.NPM_TOKEN'))
	fail('established package publishing must use Trusted Publisher OIDC without NPM_TOKEN');
if (!publishWorkflow.includes('node scripts/prepare-npm-auth.mjs'))
	fail('publish workflow must remove setup-node token placeholders before OIDC publication');
for (const [name, workflow] of [
	['CI', ciWorkflow],
	['publish', publishWorkflow],
]) {
	const npmPin = workflow.indexOf('npm install --global npm@11.19.0');
	const frozenInstall = workflow.indexOf('npm ci');
	if (npmPin < 0 || frozenInstall < 0 || npmPin > frozenInstall)
		fail(`${name} workflow must install npm 11.19.0 before npm ci`);
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
	'not affiliated with, sponsored by, endorsed by, or maintained by Twenty.com, PBC',
	'ee6a5c37cd9dc420934c02cf32256234f7e96d01',
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
if (
	templateMarker !== undefined &&
	(templateMarker?.schemaVersion !== 1 ||
		templateMarker?.templateVersion !== '2.0.0' ||
		templateMarker?.sourceRepository !==
			'https://github.com/christopherjnelson/n8n-community-node-template')
) {
	fail(`${templateMarkerPath} must identify the adopted canonical Template v2 baseline`);
}
for (const path of adoptedBaselineArtifacts) {
	if (!existsSync(resolve(root, path))) fail(`${path} is required`);
}
for (const path of finalDocumentation) {
	if (!existsSync(resolve(root, path))) {
		fail(`${path} is required`);
		continue;
	}
	if (/<[A-Z][A-Z0-9_-]*(?: [A-Z0-9_-]+)*>/.test(read(path)))
		fail(`${path} contains an unresolved uppercase template placeholder`);
}
for (const path of templateDocumentation) {
	if (existsSync(resolve(root, path))) fail(`${path} must not remain in a generated repository`);
}
for (const [path, content] of [
	['README.md', readme],
	['RELEASING.md', releasing],
	['docs/testing.md', read('docs/testing.md')],
]) {
	if (
		/release candidate|has not been published|not yet published|unpublished package/i.test(content)
	)
		fail(`${path} contains stale pre-release wording`);
}
if (webhookCredentialSource.includes('credential-test-required')) {
	fail('Twenty Webhook API credential must not suppress the credential-test-required rule');
}
for (const statement of [
	'node.description.credentials?.[0]?.testedBy !== undefined',
	"typeof credential.test?.request?.baseURL !== 'string'",
	"credential.test?.rules?.[0]?.type !== 'responseSuccessBody'",
	'trigger.description.credentials?.[0]?.testedBy !== undefined',
	"trigger.description.credentials?.[1]?.testedBy !== 'twentyWebhookCredentialTest'",
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
