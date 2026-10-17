# Firefox Add-ons listing: Virtual Card Helper

Everything the Firefox Add-ons (addons.mozilla.org) Developer Hub asks for, ready to paste.
Keep this in step with `manifest.json`, `tools/firefox.json` and [PRIVACY.md](../PRIVACY.md)
whenever permissions or data handling change.

**Add-on ID:** `virtual-card-helper@astrocaleb` (permanent once published)

**Listing:** https://addons.mozilla.org/firefox/addon/virtual-card-helper/ (Public)

## The Firefox build

Firefox runs the same files as Chrome with a different manifest: a sidebar instead of a side
panel, `firefox/background.js` to open it from the toolbar button, the add-on ID, and the data
declaration. `tools/firefox.json` describes those differences, and `node tools/build-firefox.mjs`
builds the result into `dist/firefox`. Every GitHub release attaches it as
`virtual-cards-extension-firefox.zip`, with `manifest.json` at the root of the zip.

To try a build, open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** and
choose `dist/firefox/manifest.json`. It's removed when Firefox quits.

It needs Firefox 140 or newer, the first version with Firefox's built-in data consent. It's
desktop only: Firefox for Android has no sidebars.

## Listing

**Name** (must match `manifest.json`)

```
Virtual Card Helper
```

**Add-on URL** (slug)

```
virtual-card-helper
```

**Summary** (250 characters max)

```
Unofficial sidebar for your Capital One virtual card numbers. Not affiliated with or endorsed by Capital One.
```

**Description**

```
Keep the virtual card numbers on your Capital One account one click away, in a sidebar next to whatever site you're shopping on.

Virtual Card Helper is a free, independent, open-source extension. It is not made by, affiliated with, or endorsed by Capital One, and Capital One does not support it.

WHAT IT DOES
• Lists your virtual cards, with search, status filters and a cardholder filter
• Suggests the cards that match the site you're on
• Shows a card's number, expiry and security code, with copy buttons
• Creates new cards, locks and unlocks them, renames them and deletes them

HOW IT WORKS
1. Click the toolbar button to open the sidebar.
2. Sign in to Capital One as you normally would. The extension opens the page for you if you aren't signed in.
3. Your cards appear in the sidebar. To show a number or create a card, the extension briefly opens Capital One's own page, which may ask for a texted code once per session, then brings you back.

YOUR PRIVACY
• It only talks to Capital One, from your own signed-in tab. No other servers, no analytics, no tracking.
• It never sees your password or your texted codes. You enter those on Capital One's own pages.
• It never saves card numbers. Details you show stay in the sidebar for at most 3 minutes, then they're cleared.
• To suggest cards, it searches your cards on Capital One using the first five letters of the site you're on.
• Only your account nicknames and a few settings are saved, on your computer.

WHY FIREFOX ASKS ABOUT YOUR DATA
When you install it, Firefox lists the kinds of data the extension handles. All of it goes only to Capital One, as part of using your own account: cardholder names and card details (to show your cards), the current site's name (to suggest cards), and what Capital One's page displays (to read a card's details after you click Show). Nothing is sent anywhere else.

GOOD TO KNOW
• You need a Capital One credit card account and must sign in to Capital One yourself.
• It can't fill in checkout forms; you copy and paste.
• If Capital One changes its website, the extension may stop working until it's updated.

"Capital One" is a trademark of Capital One Financial Corporation, used here only to say which accounts this extension works with.

Questions or problems: caleb@calebdudleydesign.com
Source code and privacy policy: https://github.com/AstroCaleb/virtual-cards-extension
```

**Category:** Shopping

**Compatibility:** Firefox only (not Firefox for Android)

**License:** MIT License

**Homepage:** https://github.com/AstroCaleb/virtual-cards-extension

**Support email:** caleb@calebdudleydesign.com

**Support site:** https://github.com/AstroCaleb/virtual-cards-extension#questions-or-problems

**Contributions URL** (shows a "Support this developer" button): https://ko-fi.com/astro_caleb

**Tags:** shopping

**Privacy policy:** paste the text of [PRIVACY.md](../PRIVACY.md).

**Screenshots:** `store/screenshots/1-card-list.png`, `2-cardholder-filter.png` and
`3-card-details.png` (demo data only, from the Chrome recording; the sidebar looks the same).
Never use a capture of a real account.

## Data collection

Declared in `tools/firefox.json` as `data_collection_permissions.required`, the same four
types the Chrome Web Store listing declares:

| Firefox type | Why |
| --- | --- |
| `personallyIdentifyingInfo` | Cardholder names on the account are shown in the sidebar. |
| `financialAndPaymentInfo` | Virtual card numbers, expiry dates and security codes, shown on request. |
| `browsingActivity` | The current tab's address is read, and five letters of the site name are sent to Capital One as a search. |
| `websiteContent` | Reads the card details that Capital One's page displays. |

All of it goes only to Capital One, the service the user is signed in to.

## Notes to reviewer

```
This extension works only with a Capital One credit card account (myaccounts.capitalone.com), which the reviewer will likely not have. Without one, the sidebar opens Capital One's sign-in page and shows a sign-in message. The promo video (https://youtu.be/QBBEk2fUd-I) shows the full flow with sample data, recorded in Chrome; the Firefox sidebar is the same page.

No source code submission is needed: nothing is minified, bundled or transpiled. The package is the repository's files copied as they are, plus a manifest generated from manifest.json and tools/firefox.json by tools/build-firefox.mjs (node tools/build-firefox.mjs reproduces it). Source: https://github.com/AstroCaleb/virtual-cards-extension

The extension never handles credentials and makes no requests to any host other than myaccounts.capitalone.com. The data collection declaration lists what it handles for the user's own Capital One account; nothing goes anywhere else.
```

## Submitting

**The first version goes up by hand**, because creating the add-on needs the listing above:

1. Download `virtual-cards-extension-firefox.zip` from the GitHub release.
2. Go to https://addons.mozilla.org/developers/addon/submit/distribution, choose **On this
   site**, and upload the zip.
3. Choose **Firefox** only, and answer **No** to submitting source code.
4. Fill in the listing from this page.

### Automated uploads

After that, merging a release pull request runs the **Firefox Add-ons** job in
`.github/workflows/release.yml`. It builds and zips the release, uploads it, waits for
Mozilla's automatic validation, and submits it as a new listed version, using
`tools/firefox-addons.mjs`. If validation rejects it, the job fails with Mozilla's errors and
nothing is submitted.

Mozilla's API only accepts an API key, so unlike the Chrome Web Store this needs two secrets.
They live in a GitHub environment that only `main` can use, so no pull request can read them.

One-time setup, after the first version is submitted:

1. Generate an API key at https://addons.mozilla.org/developers/addon/api/key/. It shows a
   **JWT issuer** and a **JWT secret**. Never paste them anywhere except GitHub's secret settings in step 3.
2. In GitHub, go to Settings → Environments → **New environment**, name it
   `addons-mozilla-org`, set **Deployment branches** to **Selected branches**, and add `main`.
3. In that environment, add the secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`.
4. In Settings → Secrets and variables → Actions → **Variables**, add `AMO_ADDON_ID` set to
   `virtual-card-helper@astrocaleb`. The Firefox job is skipped until it exists.

To check where a version stands, use the Developer Hub, or run
`node tools/firefox-addons.mjs status` with the two secrets set in your shell.

## Version history

| Version | Date | Notes | Status |
| --- | --- | --- | --- |
| 1.2.0 | 2026-10-13 | First submission, by hand | Published 2026-10-16 |
