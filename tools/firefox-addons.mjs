// Talks to the Firefox Add-ons (addons.mozilla.org) API for the release workflow. `status`
// prints the listed version and the latest one submitted; `publish <zip>` uploads a build,
// waits for Mozilla's automatic validation, and submits it as a new listed version.
//
// Needs AMO_JWT_ISSUER and AMO_JWT_SECRET, an API key from
// https://addons.mozilla.org/developers/addon/api/key/. Each request signs a fresh,
// one-minute token with it, which is how the API authenticates. The add-on is fixed:
// this repository only ever publishes one, and its first version is submitted by hand.
//
// Run: node tools/firefox-addons.mjs status
//      node tools/firefox-addons.mjs publish dist/virtual-cards-extension-firefox.zip
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const ADDON_ID = 'virtual-card-helper@astrocaleb';
// AMO_API=local points it at a stand-in on port 9555 to exercise the flow. Only that switch
// is read, never an address: the signed token goes wherever this points.
const API = process.env.AMO_API === 'local' ? 'http://127.0.0.1:9555' : 'https://addons.mozilla.org';
// Validation usually takes well under a minute; give it five before giving up.
const POLL_MS = Number(process.env.AMO_POLL_MS ?? 5000);
const POLL_LIMIT = 60;

const { AMO_JWT_ISSUER: issuer, AMO_JWT_SECRET: secret } = process.env;
const [command, zipPath] = process.argv.slice(2);

// Everything printed here can carry text from the API. A line break in it would start a
// new log line, which GitHub Actions could read as a workflow command.
const oneLine = value => String(value).replace(/[\r\n]+/g, ' ');
const log = message => console.log(oneLine(message));

function fail(message) {
  console.error(`✗ ${oneLine(message)}`);
  process.exit(1);
}

if (!issuer || !secret) fail('AMO_JWT_ISSUER and AMO_JWT_SECRET must both be set.');

function token() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: issuer, jti: randomUUID(), iat: issuedAt, exp: issuedAt + 60 })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

async function call(method, path, body) {
  const headers = { Authorization: `JWT ${token()}` };
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API}/api/v5/${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body && JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) fail(`${method} ${path} answered ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const addon = `addons/addon/${encodeURIComponent(ADDON_ID)}`;

async function status() {
  const listing = await call('GET', `${addon}/`);
  log(`Listed: ${listing.current_version?.version ?? 'none'} (${listing.status})`);
  const { results = [] } = await call('GET', `${addon}/versions/?filter=all_with_unlisted`);
  const [latest] = results;
  log(latest ? `Latest submitted: ${latest.version} (${latest.file?.status ?? 'unknown'})` : 'Latest submitted: none');
}

async function publish() {
  if (!zipPath) fail('publish needs the path of the zip to upload.');

  const form = new FormData();
  form.append('upload', new Blob([readFileSync(zipPath)], { type: 'application/zip' }), basename(zipPath));
  form.append('channel', 'listed');
  let upload = await call('POST', 'addons/upload/', form);

  // The upload's ID comes back from the API and goes into later paths, so it has to look
  // like an ID: anything else could point a signed request at a different path.
  const uuid = String(upload.uuid ?? '');
  if (!/^[\w-]{1,64}$/.test(uuid)) fail(`Mozilla returned an unexpected upload ID: ${uuid.slice(0, 80)}`);
  for (let poll = 0; !upload.processed && poll < POLL_LIMIT; poll++) {
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
    upload = await call('GET', `addons/upload/${encodeURIComponent(uuid)}/`);
  }
  if (!upload.processed) fail(`Mozilla's validation didn't finish in time. Upload ${uuid} can be submitted from the Developer Hub.`);
  if (!upload.valid) {
    const errors = (upload.validation?.messages ?? []).filter(message => message.type === 'error').map(message => message.message);
    fail(`Mozilla's validation rejected ${upload.version ?? 'the upload'}: ${errors.join('; ') || 'see the Developer Hub'}`);
  }

  const version = await call('POST', `${addon}/versions/`, { upload: uuid });
  log(`✓ Uploaded ${version.version} and submitted for review: ${version.file?.status ?? 'submitted'}`);
}

if (command === 'status') await status();
else if (command === 'publish') await publish();
else fail('Use "status" or "publish <zip>".');
