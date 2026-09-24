# Chrome Web Store listing: Virtual Card Helper

Everything the Developer Dashboard asks for, ready to paste. Keep this in step with
`manifest.json` and [PRIVACY.md](../PRIVACY.md) whenever permissions or data handling change.

> Last updated: 2026-09-23

**Item ID:** `aclghbjbgimapkibeejappfhclocdjcc`

**Listing:** https://chromewebstore.google.com/detail/aclghbjbgimapkibeejappfhclocdjcc (unlisted; opens once published)

## Store listing tab

**Name** (must match `manifest.json`)

```
Virtual Card Helper
```

**Summary** (132 characters max; matches the manifest description)

```
Unofficial side panel for your Capital One virtual card numbers. Not affiliated with or endorsed by Capital One.
```

**Description** (plain text; the store ignores Markdown)

```
Keep the virtual card numbers on your Capital One account one click away, in a side panel next to whatever site you're shopping on.

Virtual Card Helper is a free, independent, open-source extension. It is not made by, affiliated with, or endorsed by Capital One, and Capital One does not support it.

WHAT IT DOES
• Lists your virtual cards, with search, status filters and a cardholder filter
• Suggests the cards that match the site you're on
• Shows a card's number, expiry and security code, with copy buttons
• Creates new cards, locks and unlocks them, renames them and deletes them

HOW IT WORKS
1. Click the toolbar icon to open the side panel.
2. Sign in to Capital One as you normally would. The extension opens the page for you if you aren't signed in.
3. Your cards appear in the panel. To show a number or create a card, the extension briefly opens Capital One's own page, which may ask for a texted code once per session, then brings you back.

YOUR PRIVACY
• It only talks to Capital One, from your own signed-in tab. No other servers, no analytics, no tracking.
• It never sees your password or your texted codes. You enter those on Capital One's own pages.
• It never saves card numbers. Details you show stay in the panel for at most 3 minutes, then they're cleared.
• To suggest cards, it searches your cards on Capital One using the first five letters of the site you're on.
• Only your account nicknames and a few settings are saved, on your computer.

PERMISSIONS
• "Read and change your data on myaccounts.capitalone.com": to talk to Capital One from your signed-in tab. No other site.
• "Read your browsing history": this is Chrome's name for reading the current tab's address, which the extension uses to suggest cards and to bring you back to the page you were on. It does not read or keep your history.

GOOD TO KNOW
• You need a Capital One credit card account and must sign in to Capital One yourself.
• It can't fill in checkout forms; you copy and paste.
• If Capital One changes its website, the extension may stop working until it's updated.

"Capital One" is a trademark of Capital One Financial Corporation, used here only to say which accounts this extension works with.

Questions or problems: caleb@calebdudleydesign.com
Source code and privacy policy: https://github.com/AstroCaleb/virtual-cards-extension
```

**Category:** Shopping

**Language:** English

**Graphics**

| Asset | Size | File | Status |
| --- | --- | --- | --- |
| Store icon | 128×128 | `icons/icon-128.png` | Ready |
| Screenshot 1: card list | 1280×800 | `store/screenshots/1-card-list.png` | From the demo recording |
| Screenshot 2: Expired filter | 1280×800 | `store/screenshots/2-cardholder-filter.png` | From the demo recording |
| Screenshot 3: card details | 1280×800 | `store/screenshots/3-card-details.png` | From the demo recording |
| Small promo tile | 440×280 | `store/promo-tile-440x280.png` | Ready |
| Marquee promo tile | 1400×560 | — | Optional |

All screenshots use the demo data (John and Jane Doe, `.example` sites, `0000` numbers). Never
use a capture of a real account.

**Promo video:** https://youtu.be/QBBEk2fUd-I

**Official URL:** None (it needs a site verified in Google Search Console)

**Homepage URL:** https://github.com/AstroCaleb/virtual-cards-extension

**Support URL:** https://github.com/AstroCaleb/virtual-cards-extension#questions-or-problems
(the README's help section, which offers the email as well as issues, for people without GitHub)

**Contact email** (Account settings, shown publicly on the listing): caleb@calebdudleydesign.com

## Privacy practices tab

**Single purpose**

```
Shows the virtual card numbers on the user's own Capital One account in a side panel, and lets the user create, reveal, lock, rename and delete them.
```

**Permission justifications**

`sidePanel`

```
The extension's entire interface is a side panel opened from its toolbar button, so the user's cards stay visible next to the page where they are paying.
```

`tabs`

```
Reads the active tab's URL to suggest the user's cards whose names match the current site, to find the user's open myaccounts.capitalone.com tab where requests run, and to return the user to the tab they were on after Capital One's page shows a card. activeTab is not enough because these happen from the side panel rather than a toolbar click. URLs are never stored; only the first five letters of the site's name are sent, to Capital One, as a search of the user's own card names.
```

`scripting`

```
Injects the extension's own bundled content script (src/config.js, src/c1-api.js, content/bridge.js) into a myaccounts.capitalone.com tab that was already open before the extension was installed or updated, because manifest content scripts only reach tabs loaded afterwards. It injects no other code and touches no other site.
```

`storage`

```
Saves, in chrome.storage.local only: the nicknames the user gives their accounts, Capital One's account reference from the page URL, the user's status filter choice, one on/off setting for opening Capital One automatically, and that the user agreed to the first-run notice. No card numbers are stored.
```

Host permission `https://myaccounts.capitalone.com/*`

```
The content script runs on the user's own signed-in Capital One page and makes the virtual card requests there (list, search, rename, lock, unlock, delete), because only requests from that page carry the user's session. A second content script reads the card number, expiry and security code that Capital One's own page displays after the user clicks Show, and passes them to the side panel, which clears them after three minutes. No other host is accessed.
```

**Remote code:** No, I am not using remote code. All JavaScript ships in the package.

**Data usage.** Declared generously on purpose, since a disclosure that claims less than the
code does is what gets rejected:

| Data type | Declare? | Why |
| --- | --- | --- |
| Personally identifiable information | Yes | Cardholder names on the account are shown in the panel. |
| Health information | No | |
| Financial and payment information | Yes | Virtual card numbers, expiry dates and security codes, shown on request. |
| Authentication information | No | Never sees passwords, one-time codes or cookies; the browser attaches the session itself. |
| Personal communications | No | |
| Location | No | |
| Web history | Yes | The current tab's address is read, and five letters of the site name are sent to Capital One as a search. |
| User activity | No | |
| Website content | Yes | Reads the card details that Capital One's page displays. |

Certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/AstroCaleb/virtual-cards-extension/blob/main/PRIVACY.md

## Distribution tab

- **Payments:** Free
- **Visibility:** Unlisted (installable by link, hidden from store search). Public is a later decision
- **Regions:** All regions, or just the United States, where `myaccounts.capitalone.com` accounts are

## Test instructions for the reviewer

```
This extension works only with a Capital One credit card account (myaccounts.capitalone.com), which the reviewer will likely not have. Without one, the panel opens Capital One's sign-in page and shows a sign-in message. The promo video (https://youtu.be/QBBEk2fUd-I) shows the full flow with sample data. The source is public at https://github.com/AstroCaleb/virtual-cards-extension. The extension never handles credentials and makes no requests to any host other than myaccounts.capitalone.com.
```

## Uploading

The store needs `manifest.json` at the root of the zip. The GitHub release zip keeps
everything inside a folder, so it is not the one to upload. The first upload could not contain
a `key` field, so 1.1.0 went up without one. Since 1.1.1 the manifest carries the store's own
public key (from the dashboard's Package tab), which later uploads may include. It gives
GitHub installs the store's ID, and `tools/check-manifest.mjs` fails if it ever stops doing so.

### Automated uploads

Merging a release pull request runs the **Chrome Web Store** job in
`.github/workflows/release.yml`. It zips the release with `manifest.json` at the root, uploads
it, and submits it for review, using `tools/chrome-web-store.mjs`. If a version is already in
review it stops without uploading, so that review keeps its place in the queue. The
**Chrome Web Store status** workflow (Actions tab → Run workflow, on `main`) prints what's
published and what's in review.

It signs in to Google through workload identity federation. There is no key or token
stored anywhere: Google hands out a short-lived token only to a workflow running on this
repository's `main` branch.

One-time setup, done in the Google Cloud Console:

1. Create a project (any name), and open **Cloud Shell** in it.
2. Paste the script below. It enables the APIs, creates the `chrome-web-store` service
   account, and lets only this repository's `main` branch act as it.
3. In the Developer Dashboard, go to **Account**, add the service account email it prints,
   and copy the **Publisher ID**.
4. In GitHub, go to Settings → Secrets and variables → Actions → **Variables**, and add
   `CWS_PUBLISHER_ID`, `GCP_SERVICE_ACCOUNT`, and `GCP_WORKLOAD_IDENTITY_PROVIDER` (all three
   are identifiers, not secrets). The store job is skipped until they exist.
5. Run **Chrome Web Store status** to confirm the sign-in works.

```bash
set -euo pipefail
PROJECT_ID="$(gcloud config get-value project)"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
REPO_ID=1384010019 # github.com/AstroCaleb/virtual-cards-extension; survives a rename
SA="chrome-web-store@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable chromewebstore.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com
gcloud iam service-accounts create chrome-web-store --display-name="Chrome Web Store uploads"
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc virtual-cards-extension \
  --location=global --workload-identity-pool=github --display-name="virtual-cards-extension" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository_id == '${REPO_ID}' && assertion.ref == 'refs/heads/main'"
sleep 10 # a new service account takes a moment to be usable in policy bindings
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository_id/${REPO_ID}"
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.serviceAccountTokenCreator \
  --member="serviceAccount:${SA}"

echo "GCP_SERVICE_ACCOUNT=${SA}"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/virtual-cards-extension"
```

## Version history

| Version | Date | Notes | Status |
| --- | --- | --- | --- |
| 1.1.1 | — | Carries the store's own key, so GitHub installs share its ID | To upload |
| 1.1.0 | 2026-09-23 | First submission, with the first-run notice | Published 2026-09-24 |
