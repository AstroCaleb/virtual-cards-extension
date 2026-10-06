// Holds the shipped extension to the promises in PRIVACY.md, so a pull request that would
// quietly add a server, save a card number or load remote code fails here instead of
// relying on someone spotting it in review. It reads the code as text, so it's a tripwire
// rather than a proof: review still matters.
//
// Run: node tools/check-privacy.mjs [folder] [--base folder]
//   folder   the checkout to check (defaults to this repository)
//   --base   main's checkout; also lists changed files that deserve a careful read, such
//            as the workflows, this script and the agent instructions
//
// The Privacy workflow points this at pull requests from forks, so it only ever reads the
// folder it checks as text. It never runs, imports or evaluates anything from it.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// What the zips in release.yml contain. Only these reach a browser, so only these are held
// to the network, storage and code rules; every file in the repository gets the card
// number and forbidden-file checks.
const SHIPPED = ['manifest.json', 'service-worker.js', 'content', 'sidepanel', 'src', 'icons', 'LICENSE'];
const SHIPPED_TYPES = /\.(?:js|html|css|png)$/;

// The manifest's reach. A new permission, host or top-level key changes what the extension
// can touch, so each one has to be added here on purpose.
const MANIFEST = {
  keys: ['manifest_version', 'name', 'version', 'minimum_chrome_version', 'description', 'key', 'permissions',
    'host_permissions', 'background', 'icons', 'action', 'side_panel', 'content_scripts', 'content_security_policy'],
  permissions: ['sidePanel', 'tabs', 'scripting', 'storage'],
  hosts: ['https://myaccounts.capitalone.com/*'],
  backgroundKeys: ['service_worker', 'type'],
  contentScriptKeys: ['matches', 'js', 'css', 'run_at', 'all_frames'],
  // Chrome enforces this on the panel and service worker: no network requests at all, and
  // images only from the extension and Capital One. Content scripts aren't covered; they
  // run under Capital One's page.
  csp: "default-src 'self'; script-src 'self'; object-src 'none'; connect-src 'none'; img-src 'self' data: https://capitalone.com https://*.capitalone.com; base-uri 'none'; form-action 'none'",
};

// Every address the shipped code may name, and where. Anything else fails, even in a comment.
const HOSTS = {
  'myaccounts.capitalone.com': null, // anywhere: it's the only server the extension talks to
  'github.com': ['sidepanel/panel.html'], // the privacy policy link, opened only when clicked
  'capitalone.com': ['manifest.json'], // logo hosts allowed by the CSP, along with *.capitalone.com
  'www.w3.org': ['sidepanel/panel.css'], // an SVG namespace inside a data URL, never requested
};

// Everything chrome.storage.local may hold, as PRIVACY.md lists it, and the files that may use it.
const STORAGE_KEYS = new Set(['accounts', 'statusFilter', 'autoOpen', 'noticeAccepted']);
const STORAGE_FILES = new Set(['sidepanel/panel.js', 'content/bridge.js']);

// PRIVACY.md promises card details are cleared from the panel within 3 minutes.
const CAPTURE_TTL_LIMIT_MS = 3 * 60 * 1000;

// Never allowed in shipped JavaScript, whatever the reason. Each rule is a few small
// patterns rather than one long one, so each stays readable and quick to run.
const BANNED = [
  ['opens a connection or loads code from somewhere', [
    /\b(?:XMLHttpRequest|WebSocket|EventSource|WebTransport|RTCPeerConnection)\b/,
    /\b(?:sendBeacon|importScripts|SharedWorker)\b|\bnew\s+Worker\b|\bimport\s*\(/,
  ]],
  ['runs code built from text', [/\beval\s*\(|\bFunction\s*\(|\bWebAssembly\b/, /\bset(?:Timeout|Interval)\s*\(\s*['"`]/]],
  ['turns text into page markup', [
    /\b(?:innerHTML|outerHTML|insertAdjacentHTML|createContextualFragment|srcdoc|DOMParser)\b/,
    /\bdocument\s*\.\s*write/,
  ]],
  ['hides what the code says from a reader', [/\b(?:atob|btoa|fromCharCode|fromCodePoint)\b/, /\\x[0-9a-f]{2}|\\u\{?[0-9a-f]{2}/i]],
  ['hides which browser API it calls', [
    /\b(?:window|globalThis|self|this|top|parent)\s*(?:\?\.\s*)?\[/,
    /\b(?:frames|opener|chrome|navigator|document)\s*(?:\?\.\s*)?\[/,
    /\b(?:Reflect|Proxy|getOwnPropertyDescriptors?)\b/,
  ]],
  ['saves data somewhere PRIVACY.md does not list', [
    /\b(?:localStorage|sessionStorage|indexedDB|createObjectURL|showSaveFilePicker)\b/,
    /\bcaches\s*\.|\bdocument\s*\.\s*cookie|\bnavigator\s*\.\s*storage/,
  ]],
  ['uses a Chrome API outside what PRIVACY.md describes', [
    /\bchrome\s*\.\s*storage\s*\.\s*(?:sync|session|managed)\b/,
    /\bchrome\s*\.\s*(?:cookies|downloads|history|identity|webRequest|debugger|declarativeNetRequest)\b/,
  ]],
  ['talks to programs or extensions outside this one', [/\b(?:connectNative|sendNativeMessage|onMessageExternal|onConnectExternal)\b/]],
  ["hands data to Capital One's page, where any script on it could read it", [/\b(?:postMessage|dispatchEvent|CustomEvent)\b/]],
  ['navigates somewhere this check cannot see', [
    /\bwindow\s*\.\s*open\b/,
    /\blocation\s*\.\s*(?:assign|replace)\b/,
    /\blocation\s*(?:\.\s*href\s*)?=(?!=)/,
  ]],
  ['points the page at an address this check cannot see', [
    /\.\s*(?:action|formAction|ping)\s*=(?!=)/,
    /setAttribute\(\s*['"`](?:src|srcset|href|action|formaction|ping|poster|data)['"`]/i,
  ]],
  ['adds an element that loads something', [/createElement\(\s*['"`](?:script|iframe|frame|object|embed|link|base|meta|audio|video|source|track)['"`]/i]],
  ['reads the clipboard', [/\bclipboard\s*\.\s*read/]],
  ['builds an address from pieces', [/\/\/['"`]/, /\burl\(\s*['"`]?(?!data:)/]],
];
const BANNED_HTML = [
  ['adds an element that loads or sends something', [/<(?:iframe|frame|object|embed|base|form)\b/i, /<meta\s+http-equiv/i]],
  ['inline event handler or ping attribute', [/\s(?:on[a-z]+|ping)\s*=/i]],
];
const BANNED_CSS = [['loads another stylesheet', [/@import\b/i]]];

// Calls that reach the network, a tab, the clipboard or the console, and how many of each
// may exist per file. Fewer is always fine. More fails until someone reviews the new one
// and raises the number here.
const LIMITS = [
  { name: 'fetch', pattern: /\bfetch\b(?!\s+[a-z])/g, allowed: { 'src/c1-api.js': 1 } },
  { name: 'an image source', pattern: /\.\s*src\s*=(?!=)|\bsrcset\b|\bnew\s+Image\b/g, allowed: { 'sidepanel/panel.js': 1 } },
  { name: 'a link address', pattern: /\.\s*href\s*=(?!=)/g, allowed: { 'sidepanel/panel.js': 1 } },
  { name: 'chrome.tabs.create', pattern: /\bchrome\s*\.\s*tabs\s*\.\s*create\b/g, allowed: { 'sidepanel/panel.js': 2 } },
  { name: 'chrome.tabs.update', pattern: /\bchrome\s*\.\s*tabs\s*\.\s*update\b/g, allowed: { 'sidepanel/panel.js': 3 } },
  { name: 'chrome.scripting', pattern: /\bchrome\s*\.\s*scripting\b/g, allowed: { 'sidepanel/panel.js': 1 } },
  { name: 'the clipboard', pattern: /\bnavigator\s*\.\s*clipboard\b/g, allowed: { 'sidepanel/panel.js': 2 } },
  { name: 'chrome.runtime.sendMessage', pattern: /\bchrome\s*\.\s*runtime\s*\.\s*sendMessage\b/g, allowed: { 'content/capture.js': 1 } },
  { name: 'console logging', pattern: /\bconsole\s*\.\s*\w+/g, allowed: { 'sidepanel/panel.js': 5 } },
  { name: 'chrome.storage', pattern: /\bchrome\s*\.\s*storage\b(?!\s+[a-z])/g, allowed: { 'sidepanel/panel.js': Infinity, 'content/bridge.js': Infinity } },
];

// Lines that keep every API call and merchant logo on Capital One's servers. Refactoring
// them is fine, but it needs a careful read and a matching change here.
const PINNED = [
  ['src/config.js', /\borigin:\s*'https:\/\/myaccounts\.capitalone\.com',/g, 'every API call goes to this origin'],
  ['src/c1-api.js', /const\s*\{\s*origin\b[^}]*\}\s*=\s*globalThis\.C1_CONFIG;/g, 'the origin comes only from src/config.js'],
  ['src/c1-api.js', /\bfetch\(`\$\{origin\}\$\{path\}`,/g, "the one network call stays on Capital One's origin"],
  ['src/c1-api.js', /const listPath = `\/web-api\//g, 'the card list path stays a path'],
  ['sidepanel/panel.js', /url\.protocol === 'https:' && \/\(\^\|\\\.\)capitalone\\\.com\$\/i\.test\(url\.hostname\)/g,
    "merchant logos load only from Capital One's servers"],
];

// Every API path starts with /web-api/, so nothing can turn Capital One's origin into
// someone else's (https://myaccounts.capitalone.com@elsewhere/ is a different host).
const REQUEST_CALL = /(?<!function\s)\brequest\(\s*([^\s,)]+)/g;
const REQUEST_PATH = /^(?:[`'"]\/web-api\/|`\$\{listPath\}|listPath$)/;

// Published test numbers, which tests may use. Anything else shaped like a card number
// is treated as a real one.
const TEST_CARDS = new Set(['4111111111111111', '4242424242424242', '4012888888881881', '4000056655665556',
  '5555555555554444', '5105105105105100', '2223003122003222', '378282246310005', '371449635398431',
  '6011111111111117', '3056930009020004', '36227206271667']);
// A run of 13 to 19 digits, either unbroken or grouped the way cards print them.
const CARD_SHAPE = /\b\d(?:[ -]?\d){12,18}\b/g;
const CARD_GROUPS = new Set(['4-4-4-4', '4-4-4-4-1', '4-4-4-4-2', '4-4-4-4-3', '4-6-5', '4-6-4']);
// Captures and keys that must never be committed: a HAR export holds live cookies and full card numbers.
const FORBIDDEN_FILE = /\.(?:har|pem|key|p12|pfx|crx|zip)$|(?:^|\/)\.env(?:\.|$)/i;
const SKIPPED_FOLDERS = new Set(['.git', 'node_modules', 'dist']);

// Changes here are allowed but deserve a careful read, because they change the checks
// themselves, what ships, or what agents working in the repository are told to do.
const GUARDED = ['.github', 'tools/check-privacy.mjs', 'tools/check-privacy.test.mjs', 'manifest.json',
  'PRIVACY.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md'];

const LONG_LINE = 300;

function listFiles(root, folder = '') {
  const files = [];
  for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) files.push(...listFiles(root, path));
    } else if (entry.name !== '.DS_Store') {
      files.push(path);
    }
  }
  return files;
}

const safePath = value => String(value).replaceAll(/[^\w./@-]/g, '?');
const isShipped = file => SHIPPED.some(path => file === path || file.startsWith(`${path}/`));
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const sorted = list => [...list].sort((a, b) => a.localeCompare(b));

// Regular files only: a symbolic link could point anywhere on the machine running this.
// Returns null for anything else, and for binary files such as images.
function readText(root, file) {
  const path = join(root, file);
  if (!existsSync(path) || !lstatSync(path).isFile()) return null;
  const buffer = readFileSync(path);
  return buffer.subarray(0, 8000).includes(0) ? null : buffer.toString('utf8');
}

// Shipped code must be plain UTF-8. A NUL byte or another encoding would make it look like
// a binary file to this check, and hide it from every rule.
function readCode(root, file, fail) {
  const buffer = readFileSync(join(root, file));
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (!text.includes('\0')) return text;
  } catch {
    // Not UTF-8; reported below.
  }
  fail('encoding', file, 'shipped code must be plain UTF-8 text with no NUL bytes');
  return '';
}

function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

function checkManifest(root, fail) {
  let manifest;
  try {
    manifest = JSON.parse(readText(root, 'manifest.json'));
  } catch {
    return fail('manifest', 'manifest.json', 'manifest.json is missing or is not valid JSON');
  }
  const same = (expected, actual = []) => actual.length === expected.length && expected.every(item => actual.includes(item));
  const extra = (object, allowed) => Object.keys(object ?? {}).filter(key => !allowed.includes(key));

  for (const key of extra(manifest, MANIFEST.keys)) fail('manifest', 'manifest.json', `new manifest key "${key}"`);
  for (const key of extra(manifest.background, MANIFEST.backgroundKeys)) fail('manifest', 'manifest.json', `new background key "${key}"`);
  if (!same(MANIFEST.permissions, manifest.permissions)) {
    fail('manifest', 'manifest.json', `permissions must be exactly ${MANIFEST.permissions.join(', ')}`);
  }
  if (!same(MANIFEST.hosts, manifest.host_permissions)) {
    fail('manifest', 'manifest.json', `host_permissions must be exactly ${MANIFEST.hosts.join(', ')}`);
  }
  if (manifest.content_security_policy?.extension_pages !== MANIFEST.csp || extra(manifest.content_security_policy, ['extension_pages']).length) {
    fail('manifest', 'manifest.json', 'content_security_policy must stay exactly as reviewed');
  }
  for (const script of manifest.content_scripts ?? []) {
    for (const key of extra(script, MANIFEST.contentScriptKeys)) fail('manifest', 'manifest.json', `new content script key "${key}"`);
    if (!(script.matches ?? []).every(match => MANIFEST.hosts.includes(match))) {
      fail('manifest', 'manifest.json', `content scripts may only match ${MANIFEST.hosts.join(', ')}`);
    }
  }
}

// Both zip steps in release.yml must package exactly SHIPPED, so nothing unchecked ships.
function checkPackaging(root, fail) {
  const file = '.github/workflows/release.yml';
  const text = readText(root, file);
  if (text === null) return fail('packaging', file, 'release.yml is missing');
  // "zip -r -X name.zip files…" and "cp -R files… destination", read word by word.
  const lists = text.split('\n').flatMap(line => {
    const words = line.replaceAll(/[()]/g, ' ').trim().split(/\s+/);
    const zip = words.indexOf('zip');
    if (zip !== -1 && words[zip + 1] === '-r' && words[zip + 2] === '-X') return [words.slice(zip + 4)];
    const copy = words.indexOf('cp');
    return copy !== -1 && words[copy + 1] === '-R' ? [words.slice(copy + 2, -1)] : [];
  });
  const expected = sorted(SHIPPED).join(' ');
  // The GitHub zip packs the folder the cp step filled, so only the cp and store zip lists count.
  const packaged = lists.filter(list => !list.some(entry => entry.startsWith('virtual-cards-extension')));
  if (packaged.length !== 2 || packaged.some(list => sorted(list).join(' ') !== expected)) {
    fail('packaging', file, `both release zips must contain exactly: ${SHIPPED.join(' ')}`);
  }
}

function checkHosts(file, text, fail) {
  for (const match of text.matchAll(/\/\/(?=[\w$[{])([^\s/'"`)<>\\]*)/g)) {
    const host = match[1].toLowerCase();
    const allowed = Object.hasOwn(HOSTS, host) && (HOSTS[host] === null || HOSTS[host].includes(file));
    if (!allowed) fail('host', file, `names an address this extension is not allowed to reach (${host.slice(0, 60)})`, lineOf(text, match.index));
  }
  // Browsers read https:elsewhere.example and https:/\\elsewhere.example as https://elsewhere.example.
  for (const match of text.matchAll(/\b(?:https?|wss?|ftps?):(?!\/\/|['"`])/gi)) {
    fail('host', file, 'names an address without the usual //, which hides where it goes', lineOf(text, match.index));
  }
}

function checkPatterns(file, text, rules, fail) {
  for (const [reason, patterns] of rules) {
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) fail('banned', file, `${reason}: "${match[0].trim().slice(0, 40)}"`, lineOf(text, match.index));
    }
  }
}

// Scripts must come from a file in the extension; Chrome blocks inline ones anyway.
function checkScriptTags(file, text, fail) {
  for (const match of text.matchAll(/<script\b[^>]*>/gi)) {
    if (!/\ssrc=/i.test(match[0])) fail('banned', file, 'inline script', lineOf(text, match.index));
  }
}

function checkLimits(file, text, fail) {
  for (const { name, pattern, allowed } of LIMITS) {
    const matches = [...text.matchAll(pattern)];
    const limit = allowed[file] ?? 0;
    if (matches.length > limit) {
      const where = matches[limit].index;
      fail('limit', file, limit
        ? `uses ${name} ${matches.length} times; the reviewed limit for this file is ${limit}`
        : `uses ${name}, which is not allowed in this file`, lineOf(text, where));
    }
  }
}

function checkStorage(file, text, fail) {
  const constants = new Map([...text.matchAll(/\bconst\s+(\w+_KEY)\s*=\s*['"`]([^'"`]*)['"`]/g)].map(match => [match[1], match[2]]));
  for (const [name, key] of constants) {
    if (!STORAGE_KEYS.has(key)) fail('storage', file, `${name} names storage key "${key}", which PRIVACY.md does not list`);
  }
  for (const match of text.matchAll(/\bchrome\s*\.\s*storage\s*\.\s*local\s*\.\s*set\(([^)]*)\)/g)) {
    checkStorageWrite(file, match[1].trim(), constants, lineOf(text, match.index), fail);
  }
}

// One chrome.storage.local.set({ … }) call: every key it saves must be one PRIVACY.md lists.
function checkStorageWrite(file, body, constants, line, fail) {
  if (!body.startsWith('{') || body.includes('...')) {
    return fail('storage', file, 'saves something whose keys this check cannot read; pass an object literal', line);
  }
  if (/\b(?:captured|details|number|cvv|expiry)\b/.test(body)) fail('storage', file, 'saves something that looks like card details', line);
  const keys = [
    // [SOME_KEY]: value
    ...[...body.matchAll(/\[(\w+)\]\s*:/g)].map(match => ({ name: match[1], key: constants.get(match[1]) })),
    // key: value, or 'key': value
    ...[...body.matchAll(/[{,]\s*['"]?(\w+)['"]?\s*:/g)].map(match => ({ name: match[1], key: match[1] })),
    // the shorthand { key }
    ...[...body.matchAll(/[{,]\s*(\w+)\s*(?=[,}])/g)].map(match => ({ name: match[1], key: match[1] })),
  ];
  for (const { name, key } of keys) {
    if (!STORAGE_KEYS.has(key)) fail('storage', file, `saves "${name}", which PRIVACY.md does not list`, line);
  }
}

function checkCaptureTtl(text, fail) {
  const match = text.match(/\bconst CAPTURE_TTL_MS = ([\d\s*]+);/);
  const value = match?.[1].split('*').reduce((product, part) => product * Number(part.trim()), 1);
  if (!value || value > CAPTURE_TTL_LIMIT_MS) {
    fail('capture-ttl', 'sidepanel/panel.js', 'CAPTURE_TTL_MS must be a plain number of at most 3 minutes, as PRIVACY.md promises');
  }
}

function checkRequests(text, fail) {
  for (const match of text.matchAll(REQUEST_CALL)) {
    if (!REQUEST_PATH.test(match[1])) {
      fail('request-path', 'src/c1-api.js', 'every request() path must start with /web-api/', lineOf(text, match.index));
    }
  }
}

function checkPins(root, fail) {
  for (const [file, pattern, why] of PINNED) {
    const text = readText(root, file) ?? '';
    const count = [...text.matchAll(pattern)].length;
    if (count !== 1) fail('pinned', file, `expected this exact line once (${why}), found it ${count} times: ${pattern.source.slice(0, 60)}`);
  }
}

function checkShippedFile(file, text, fail) {
  if (!['manifest.json', 'LICENSE'].includes(file) && !SHIPPED_TYPES.test(file)) {
    return fail('shipped-files', file, 'only .js, .html, .css and .png files may ship');
  }
  if (file.endsWith('.png')) return;
  checkHosts(file, text, fail);
  if (!/\.(?:js|html|css)$/.test(file)) return;
  text.split('\n').forEach((line, index) => {
    if (line.length > LONG_LINE) fail('long-line', file, `line is ${line.length} characters, which looks minified or generated`, index + 1);
  });
  if (file.endsWith('.js')) {
    checkPatterns(file, text, BANNED, fail);
    checkLimits(file, text, fail);
    if (STORAGE_FILES.has(file)) checkStorage(file, text, fail);
    if (file === 'sidepanel/panel.js') checkCaptureTtl(text, fail);
    if (file === 'src/c1-api.js') checkRequests(text, fail);
  }
  if (file.endsWith('.html')) {
    checkPatterns(file, text, BANNED_HTML, fail);
    checkScriptTags(file, text, fail);
  }
  if (file.endsWith('.css')) checkPatterns(file, text, BANNED_CSS, fail);
}

function checkCardNumbers(file, text, fail) {
  for (const match of text.matchAll(CARD_SHAPE)) {
    const grouped = /[ -]/.test(match[0]);
    if (grouped && !CARD_GROUPS.has(match[0].split(/[ -]/).map(group => group.length).join('-'))) continue;
    const digits = match[0].replaceAll(/\D/g, '');
    // Deliberately doesn't print the number: this output is public.
    if (luhn(digits) && !TEST_CARDS.has(digits)) {
      fail('card-number', file, 'contains what looks like a real card number; use a published test number', lineOf(text, match.index));
    }
  }
}

function compareWithBase(root, base, note) {
  const snapshot = folder => {
    const files = new Map();
    for (const path of GUARDED) {
      const full = join(folder, path);
      if (!existsSync(full)) continue;
      const entries = lstatSync(full).isDirectory() ? listFiles(folder, path) : [path];
      for (const file of entries) files.set(file, readText(folder, file) ?? 'not a text file');
    }
    return files;
  };
  const before = snapshot(base);
  const after = snapshot(root);
  const changed = sorted([...new Set([...before.keys(), ...after.keys()])].filter(file => before.get(file) !== after.get(file)));
  for (const file of changed) note(`${safePath(file)} changed: it affects the checks, what ships, or what agents are told. Read it closely.`);

  const noticeVersion = folder => (readText(folder, 'sidepanel/panel.js') ?? '').match(/\bconst NOTICE_VERSION = (\d+);/)?.[1];
  if (changed.includes('PRIVACY.md') && noticeVersion(root) === noticeVersion(base)) {
    note('PRIVACY.md changed but NOTICE_VERSION did not. If data handling changed, raise it so the notice asks again.');
  }
}

export function checkRepository(root, base) {
  const problems = [];
  const notes = [];
  const fail = (rule, file, message, line) => problems.push({ rule, file, line, message });

  checkManifest(root, fail);
  checkPackaging(root, fail);
  checkPins(root, fail);
  for (const file of listFiles(root)) {
    if (FORBIDDEN_FILE.test(file)) fail('forbidden-file', file, 'HAR exports, keys and zips must never be committed');
    if (!lstatSync(join(root, file)).isFile()) {
      fail('symlink', file, 'symbolic links are not allowed');
      continue;
    }
    const code = isShipped(file) && /\.(?:js|html|css|json)$/.test(file);
    const text = code ? readCode(root, file, fail) : readText(root, file);
    if (isShipped(file)) checkShippedFile(file, text ?? '', fail);
    if (text !== null) checkCardNumbers(file, text, fail);
  }
  if (base) compareWithBase(root, base, message => notes.push(message));
  return { problems, notes };
}

// Paths and snippets come from the checked folder, which may be a fork's, so nothing
// printed can break a line or pass for a workflow command.
const oneLine = value => String(value).replaceAll(/[\u0000-\u001f\u007f]/g, ' ');
const escapeData = value => oneLine(value).replaceAll('%', '%25');

function main() {
  const args = process.argv.slice(2);
  const baseAt = args.indexOf('--base');
  const base = baseAt === -1 ? undefined : resolve(args.splice(baseAt, 2)[1]);
  const root = resolve(args[0] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const { problems, notes } = checkRepository(root, base);
  const annotate = process.env.GITHUB_ACTIONS === 'true';

  for (const note of notes) console.log(annotate ? `::warning::${escapeData(note)}` : `! ${oneLine(note)}`);
  for (const { file, line, message } of problems) {
    const where = line ? `${safePath(file)}:${line}` : safePath(file);
    console.error(`✗ ${where} ${oneLine(message)}`);
    const position = line ? `,line=${line}` : '';
    if (annotate) console.log(`::error file=${safePath(file)}${position}::${escapeData(message)}`);
  }
  if (problems.length) {
    console.error(`\n${problems.length} privacy problem${problems.length === 1 ? '' : 's'}. See CONTRIBUTING.md, "The privacy check".`);
    process.exit(1);
  }
  console.log('✓ privacy: talks only to Capital One, saves only what PRIVACY.md lists, no remote code, no card numbers');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
