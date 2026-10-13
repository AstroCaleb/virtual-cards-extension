// Checks manifest.json against what Chrome and the Chrome Web Store will accept, so a
// renamed file or an over-long description fails a pull request instead of a release.
//
// Run: node tools/check-manifest.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefoxManifest, readFirefoxConfig } from './build-firefox.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'));
const manifest = read('manifest.json');
const released = read('.release-please-manifest.json')['.'];
const problems = [];
// The Chrome Web Store item this repository publishes. The manifest's key must produce it.
const STORE_ID = 'aclghbjbgimapkibeejappfhclocdjcc';

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

// The key fixes the extension ID, so a typo in it would quietly give every GitHub install
// a different ID from the store's. Chrome's ID is the first 32 hex digits of the key's
// SHA-256, spelled with the letters a to p.
const id = createHash('sha256')
  .update(Buffer.from(manifest.key ?? '', 'base64'))
  .digest('hex')
  .slice(0, 32)
  .replace(/./g, digit => String.fromCharCode(97 + parseInt(digit, 16)));
if (id !== STORE_ID) problems.push(`key gives extension ID ${id}, not the store's ${STORE_ID}`);

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

// The Firefox version is this manifest plus tools/firefox.json. Firefox refuses a manifest
// that names a missing file, and Firefox Add-ons needs the add-on ID and data declaration.
const firefoxConfig = readFirefoxConfig();
const firefox = firefoxManifest(manifest, firefoxConfig);
const gecko = firefox.browser_specific_settings?.gecko;
const copied = file => firefoxConfig.files.some(path => file === path || file.startsWith(`${path}/`));
const firefoxReferenced = [
  ...(firefox.background?.scripts ?? []),
  firefox.sidebar_action?.default_panel,
  ...Object.values(firefox.icons ?? {}),
  ...Object.values(firefox.action?.default_icon ?? {}),
  ...Object.values(firefox.sidebar_action?.default_icon ?? {}),
  ...(firefox.content_scripts ?? []).flatMap(script => [...(script.js ?? []), ...(script.css ?? [])]),
].filter(Boolean);
for (const file of firefoxReferenced) {
  if (!existsSync(join(root, file)) || !copied(file)) problems.push(`Firefox: ${file} is referenced but not built`);
}
if (firefox.side_panel || firefox.permissions.includes('sidePanel')) problems.push('Firefox: side panels are Chrome-only');
if (firefox.background?.service_worker) problems.push('Firefox: needs background.scripts, not a service worker');
if (!gecko?.id) problems.push('Firefox: browser_specific_settings.gecko.id is missing');
if (!gecko?.data_collection_permissions?.required?.length) problems.push('Firefox: the data collection declaration is missing');

if (problems.length) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}
console.log(`✓ manifest.json ${manifest.version}: ID ${id}, ${referenced.length} referenced files present`);
console.log(`✓ Firefox ${firefox.version}: ID ${gecko.id}, ${firefoxReferenced.length} referenced files built`);
