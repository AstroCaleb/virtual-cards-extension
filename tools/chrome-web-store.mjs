// Talks to the Chrome Web Store API for the workflows. `status` prints where the item
// stands; `publish <zip>` uploads a package and submits it for review.
//
// Needs CWS_TOKEN (an access token with the chromewebstore scope) and CWS_PUBLISHER_ID.
// The item is fixed: this repository only ever publishes one.
//
// Run: node tools/chrome-web-store.mjs status
//      node tools/chrome-web-store.mjs publish dist/store.zip
import { readFileSync } from 'node:fs';

const ITEM_ID = 'aclghbjbgimapkibeejappfhclocdjcc';
// Overridable only so the flow can be exercised against a local stand-in.
const API = process.env.CWS_API ?? 'https://chromewebstore.googleapis.com';
// An upload can finish in the background; the response says so and fetchStatus follows it.
const POLL_MS = Number(process.env.CWS_POLL_MS ?? 5000);
const POLL_LIMIT = 24;

const { CWS_TOKEN: token, CWS_PUBLISHER_ID: publisher } = process.env;
const [command, zipPath] = process.argv.slice(2);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!token || !publisher) fail('CWS_TOKEN and CWS_PUBLISHER_ID must both be set.');
const item = `publishers/${publisher}/items/${ITEM_ID}`;

async function call(method, path, body) {
  const response = await fetch(`${API}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const text = await response.text();
  if (!response.ok) fail(`${method} ${path} answered ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const fetchStatus = () => call('GET', `v2/${item}:fetchStatus`);

function revision(label, status) {
  if (!status) return `${label}: none`;
  const versions = (status.distributionChannels ?? []).map(channel => channel.crxVersion).filter(Boolean);
  return `${label}: ${versions.join(', ') || 'unknown version'} (${status.state})`;
}

async function status() {
  const current = await fetchStatus();
  console.log(revision('Published', current.publishedItemRevisionStatus));
  console.log(revision('Submitted', current.submittedItemRevisionStatus));
  if (current.warned) console.log('⚠ Warned for a policy violation. Check the Developer Dashboard.');
  if (current.takenDown) console.log('⚠ Taken down for a policy violation. Check the Developer Dashboard.');
}

async function publish() {
  if (!zipPath) fail('publish needs the path of the zip to upload.');

  // Uploading over a version that is still in review would quietly replace it and send it
  // to the back of the queue. Leave that call to a person.
  const before = await fetchStatus();
  if (before.submittedItemRevisionStatus?.state === 'PENDING_REVIEW') {
    fail(
      `${revision('In review', before.submittedItemRevisionStatus)}. This release was not uploaded, ` +
        'so that review keeps its place. Upload it from the Developer Dashboard once it clears.',
    );
  }

  let upload = await call('POST', `upload/v2/${item}:upload`, readFileSync(zipPath));
  for (let poll = 0; upload.uploadState === 'IN_PROGRESS' && poll < POLL_LIMIT; poll++) {
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
    upload = { ...upload, uploadState: (await fetchStatus()).lastAsyncUploadState };
  }
  if (upload.uploadState !== 'SUCCEEDED') fail(`Upload ended ${upload.uploadState}: ${JSON.stringify(upload)}`);

  const submitted = await call('POST', `v2/${item}:publish`);
  console.log(`✓ Uploaded${upload.crxVersion ? ` ${upload.crxVersion}` : ''} and submitted for review: ${submitted.state}`);
}

if (command === 'status') await status();
else if (command === 'publish') await publish();
else fail('Use "status" or "publish <zip>".');
