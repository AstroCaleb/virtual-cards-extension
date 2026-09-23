# Chrome Web Store listing: Virtual Card Helper

Everything the Developer Dashboard asks for, ready to paste. Keep this in step with
`manifest.json` and [PRIVACY.md](../PRIVACY.md) whenever permissions or data handling change.

> Last updated: 2026-09-23

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

Source code, privacy policy and support: https://github.com/AstroCaleb/virtual-cards-extension
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
| Small promo tile | 440×280 | — | To make |
| Marquee promo tile | 1400×560 | — | Optional |

All screenshots use the demo data (John and Jane Doe, `.example` sites, `0000` numbers). Never
use a capture of a real account.

**Promo video:** https://youtu.be/QBBEk2fUd-I

**Homepage URL:** https://github.com/AstroCaleb/virtual-cards-extension

**Support URL:** https://github.com/AstroCaleb/virtual-cards-extension/issues

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
- **Visibility:** Public, or Unlisted (installable by link, hidden from store search)
- **Regions:** All regions, or just the United States, where `myaccounts.capitalone.com` accounts are

## Test instructions for the reviewer

```
This extension works only with a Capital One credit card account (myaccounts.capitalone.com), which the reviewer will likely not have. Without one, the panel opens Capital One's sign-in page and shows a sign-in message. The promo video (https://youtu.be/QBBEk2fUd-I) shows the full flow with sample data. The source is public at https://github.com/AstroCaleb/virtual-cards-extension. The extension never handles credentials and makes no requests to any host other than myaccounts.capitalone.com.
```

## Uploading

The store needs `manifest.json` at the root of the zip. The GitHub release zip keeps
everything inside a folder, so it is not the one to upload. The first upload must not contain
a `key` field (the manifest has none today). Once the item exists, copy its public key from
the dashboard's Package tab into `manifest.json` so unpacked installs share the store's ID.

## Version history

| Version | Date | Notes | Status |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-23 | First submission | Draft |
