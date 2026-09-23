// Checks manifest.json against what Chrome and the Chrome Web Store will accept, so a
// renamed file or an over-long description fails a pull request instead of a release.
//
// Run: node tools/check-manifest.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'));
const manifest = read('manifest.json');
const released = read('.release-please-manifest.json')['.'];
const problems = [];

if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');
// The store's limits, which are stricter than Chrome's own.
if (!manifest.name || manifest.name.length > 75) problems.push('name must be 1 to 75 characters');
if (!manifest.description || manifest.description.length > 132) {
  problems.push(`description must be 1 to 132 characters (it is ${manifest.description?.length ?? 0})`);
}
// release-please owns the version. Editing it by hand breaks the next release.
if (manifest.version !== released) {
  problems.push(`version ${manifest.version} does not match .release-please-manifest.json (${released})`);
}

// Every file the manifest names has to exist, or Chrome refuses to load the extension.
const referenced = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...(manifest.content_scripts ?? []).flatMap(script => [...(script.js ?? []), ...(script.css ?? [])]),
].filter(Boolean);
for (const file of referenced) {
  if (!existsSync(join(root, file))) problems.push(`${file} is referenced but does not exist`);
}

if (problems.length) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}
console.log(`✓ manifest.json ${manifest.version}: ${referenced.length} referenced files present`);
