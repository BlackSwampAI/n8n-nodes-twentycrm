import { execFileSync } from 'node:child_process';

import { supportsNpmTrustedPublishing } from './release-check-lib.mjs';

const version = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
if (!supportsNpmTrustedPublishing(version)) {
	console.error('npm 11.5.1 or newer is required for Trusted Publishing');
	process.exit(1);
}
console.log(`npm ${version} satisfies the Trusted Publishing minimum`);
