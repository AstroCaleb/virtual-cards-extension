// Builds the Firefox version into dist/firefox from the same files as the Chrome one.
// Firefox has no side panel or extension service worker, so tools/firefox.json says what
// changes: which manifest keys and permissions to drop, which Firefox keys to add (a
// sidebar, a background script, the add-on ID and its data declaration), and which files
// to copy. The manifest's version, content scripts and security policy carry over as is.
//
// Run: node tools/build-firefox.mjs
// Then load dist/firefox/manifest.json from about:debugging#/runtime/this-firefox →
// Load Temporary Add-on. The release workflow zips dist/firefox for Firefox Add-ons.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const readFirefoxConfig = () => JSON.parse(readFileSync(join(root, 'tools', 'firefox.json'), 'utf8'));

export function firefoxManifest(manifest, config) {
  const result = Object.fromEntries(Object.entries(manifest).filter(([key]) => !config.removeKeys.includes(key)));
  result.permissions = (manifest.permissions ?? []).filter(permission => !config.removePermissions.includes(permission));
  return { ...result, ...config.addKeys };
}

function build() {
  const config = readFirefoxConfig();
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const out = join(root, 'dist', 'firefox');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const path of config.files) {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    cpSync(join(root, path), join(out, path), { recursive: true });
  }
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(firefoxManifest(manifest, config), null, 2)}\n`);
  console.log(`✓ Firefox ${manifest.version} built in dist/firefox`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
