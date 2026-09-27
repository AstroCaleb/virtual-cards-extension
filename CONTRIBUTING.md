# Contributing to Virtual Card Helper

Thanks for wanting to help. I maintain this on my own, and it handles people's card numbers, so I'm careful about what goes in. This page covers what I will and won't merge, how to try a change, and how releases work.

**Never post card numbers, security codes or screenshots of your account** in an issue or pull request, even your own. The tests use published test numbers like 4111 1111 1111 1111.

For anything bigger than a small fix, please open an issue first so we can agree on the approach before you put time in. If Capital One changed their site and something broke, an issue that describes what you see (without account details) helps a lot.

## What I won't merge

These are the promises in [PRIVACY.md](PRIVACY.md), and [the privacy check](#the-privacy-check) enforces most of them.

- **Talking to anything but Capital One.** Every request goes to `myaccounts.capitalone.com`, and merchant logos load only from Capital One's servers. No analytics, error reporting, CDNs, web fonts or servers of my own.
- **Keeping card details.** Card numbers, expiry dates and security codes stay in the panel's memory for at most 3 minutes. They're never saved, logged or sent anywhere.
- **Touching sign-in.** The extension never sees passwords or texted codes. You sign in and verify on Capital One's own pages.
- **Changing what Capital One's pages show.** The extension reads their pages but never rewrites them. A changed number or balance on a real account could mislead someone into acting on it.
- **More reach than it needs.** No new permissions or site access without a clear reason, and nothing that lets other extensions or websites talk to this one.
- **Code a reader can't follow.** No remote code, `eval`, minified or encoded code, dependencies or build step. It's plain JavaScript so anyone can read exactly what they're installing.

## Trying a change

1. Clone the repository. Its root is the extension.
2. Go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the clone. If you have the Chrome Web Store version, remove it first, because both use the same extension ID. Removing it clears its nicknames and settings.
3. Sign in to Capital One and open the panel.

After editing `sidepanel/`, reload the extension. After editing `content/` or `src/`, reload the extension **and** the Capital One tab.

If your change affects how the extension talks to Capital One, try more than the card list: rename or lock a card, then show a card number. A read that works doesn't prove a write will.

Then run the checks. They need only Node, with nothing to install:

```bash
node tools/capture.test.mjs
node tools/check-manifest.mjs
node tools/check-privacy.mjs
node tools/check-privacy.test.mjs
```

All four also run on every pull request.

## Pull request titles decide releases

Pull requests are squash-merged, so the title becomes the commit on `main`, and [release-please](https://github.com/googleapis/release-please) reads it:

- `fix:` releases a patch and `feat:` releases a minor version. Both publish a GitHub release and send that version to the Chrome Web Store for review.
- `docs:`, `ci:`, `chore:`, `test:` and `refactor:` don't release anything.

Choose by whether people get a changed extension. Write the rest of the title for them, because it becomes the line in the changelog, for example `fix: keep Show working after Capital One signs you out`.

Don't change the version in `manifest.json` or `.release-please-manifest.json`. The release pull request does that.

## If a change affects your data

If a change affects what the extension reads, saves or sends, the same pull request has to:

1. Update [PRIVACY.md](PRIVACY.md) and its "Last updated" date.
2. Update the disclosures in [store/CHROMEWEBSTORE.md](store/CHROMEWEBSTORE.md).
3. Raise `NOTICE_VERSION` in `sidepanel/panel.js`, so everyone sees the first-run notice again and agrees to the change.
4. Update the matching rule in `tools/check-privacy.mjs` if one has to change, and explain why in the description.

## The privacy check

`tools/check-privacy.mjs` reads the code that ships and fails a pull request if it:

- names any address other than Capital One's, or changes the manifest's permissions, sites or settings
- saves anything `PRIVACY.md` doesn't list, or lets card details reach storage, logs or Capital One's page
- adds a network, tab, clipboard or logging call beyond the ones already reviewed
- runs code built from text, turns text into page markup, or hides what it does (`eval`, `innerHTML`, `atob`, encoded strings, computed global names, minified lines)
- ships a file other than `.js`, `.html`, `.css` or `.png`, or changes what goes into the release zips
- contains something shaped like a real card number, or a HAR export, key or zip, anywhere in the repository

It runs twice on every pull request. **Checks** runs the pull request's own copy, so a change to the rules can be tested. **Privacy** runs `main`'s copy, which a pull request can't edit. If your change really does need a rule to change, update it in the same pull request and say why. The Privacy run will stay red until I've reviewed it, and that's expected.

It's a tripwire, not a proof. Someone determined could write code it misses, so every pull request still gets a careful read from me. The Privacy run also points out changes to the workflows, the check itself, and the files that instruct AI agents, because those deserve the closest look.

## Using an AI agent

[AGENTS.md](AGENTS.md) has the same rules in the form coding agents read. Point your agent at it, and review what it writes as carefully as your own code.

## Security

If you find a way the extension could leak card details or account data, please email me at [caleb@calebdudleydesign.com](mailto:caleb@calebdudleydesign.com) instead of opening a public issue.
