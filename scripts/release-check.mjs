import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { isValidN8nPackageName } from './package-name.mjs';

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
const publishWorkflow = read('.github/workflows/publish.yml');
const ciWorkflow = read('.github/workflows/ci.yml');
const releasing = read('RELEASING.md');
const readme = read('README.md');
const officialIconHash = '0016254102d200b1598b4c1ecb88dfa398ec3a34db0616ed9441eda887ff2fef';

if (!isValidN8nPackageName(packageJson.name ?? '')) {
	fail(
		'package.json name must be a lowercase n8n-nodes-* name, optionally under a lowercase npm scope',
	);
}

if (packageJson.name !== '@blackswampai/n8n-nodes-twentycrm') {
	fail('package.json name must match the approved @blackswampai/n8n-nodes-twentycrm identity');
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
if (!/id-token:\s*write/.test(publishWorkflow)) fail('publish workflow needs id-token: write');
if (!publishWorkflow.includes('npm run release')) fail('publish workflow must run npm run release');
if (!publishWorkflow.includes('secrets.NPM_TOKEN')) {
	fail('publish workflow must retain the first-publication NPM_TOKEN fallback');
}

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
