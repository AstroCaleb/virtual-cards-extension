# Virtual Card Helper

**Your Capital One virtual cards, in a Chrome side panel.**

> [!IMPORTANT]
> **Virtual Card Helper is not made by, affiliated with, or endorsed by Capital One.** It's a free, independent project from one cardholder to the others. Capital One can't help you with it, so please don't ask them to.

<!-- Demo video: edit this file on github.com and drag virtual-cards-demo.mp4 onto this line. -->

## Why I made this

Capital One is shutting down Eno, its browser extension, on September 30, 2026. I used it constantly: a fresh virtual card number for every site, always one click away. I wasn't ready to give that up, and I know I'm not the only one. So I built my own, and I'm giving it away.

It's not a perfect replacement. You still sign in to Capital One yourself, and it can't fill in checkout forms for you. But it gets most of the way back.

Caleb

## What it does

- Shows all your virtual cards, with search and filters
- Suggests the right card for the site you're on
- Creates new cards and shows card numbers, with copy buttons
- Locks, unlocks, renames and deletes cards

## Install (about two minutes)

Virtual Card Helper isn't in the Chrome Web Store yet, so Chrome needs a setting called **Developer mode** to install it. The name sounds more serious than it is. It just lets you install an extension from a folder.

1. **Download [virtual-cards-extension.zip](https://github.com/AstroCaleb/virtual-cards-extension/releases/latest/download/virtual-cards-extension.zip)** and unzip it.
2. **Move the `virtual-cards-extension` folder somewhere it can stay**, like your Documents folder. Chrome runs the extension from that folder, so don't delete it.
3. In Chrome, type **`chrome://extensions`** into the address bar and press Enter.
4. Turn on **Developer mode** (top-right corner).
5. Click **Load unpacked** and choose the `virtual-cards-extension` folder.
6. Click the puzzle-piece icon in Chrome's toolbar, then the pin next to **Virtual Card Helper**.

Now click the Virtual Card Helper icon to open the panel. If you aren't signed in, it opens Capital One's sign-in page. Sign in as usual and it brings you back.

## Using it

- **It works through a Capital One tab.** It opens one in the background when it needs one. If Capital One signs you out, which it does after a while, just sign back in.
- **To see a card number**, click **Show**. It opens Capital One's own page for a moment, then brings you back with the number in the panel. Once per session, Capital One may text you a code first. You type it on their page, never in this extension.
- **Card numbers disappear from the panel after 3 minutes**, or as soon as you close it.

## Your privacy

This handles credit card numbers, so here is exactly what it does:

- **It only talks to Capital One.** Every request goes to `myaccounts.capitalone.com`, from your own signed-in tab, the same way their website does. There are no other servers, no analytics and no tracking. I don't run a server at all.
- **It never sees your password or your texted codes.** You type those into Capital One's own pages.
- **It never saves card numbers.** A number you show is kept in the panel for 3 minutes, then it's gone. It is never written to your computer.
- **What it does save, on your computer only:** the nicknames you give your accounts, Capital One's internal ID for each account (not a card number), your filter choice, and one setting. Removing the extension deletes all of it.
- **The one thing to know about:** to suggest cards for the site you're on, it searches your cards for the first five letters of that site's name. On amazon.com, it searches for "amazo". That search goes to Capital One, and only while the panel is open.

All of the code is in this repository, and it's short enough to read.

<details>
<summary><strong>Why Virtual Card Helper asks for each permission</strong></summary>

- **Read and change your data on myaccounts.capitalone.com.** This lets it talk to Capital One from your signed-in tab. It can't touch any other website.
- **Tabs.** It reads the address of the tab you're on so it can suggest cards, find your Capital One tab, and bring you back afterwards. Chrome's name for this permission is "Read your browsing history." It doesn't read your history, and it doesn't keep the addresses it sees.
- **Scripting.** Lets it reconnect to a Capital One tab that was already open before the extension was installed or updated.
- **Storage.** Saves the nicknames and settings listed above.
- **Side panel.** Shows the panel beside the page you're on.

</details>

## Updating

The extension doesn't update itself. When a new version comes out:

1. Download [virtual-cards-extension.zip](https://github.com/AstroCaleb/virtual-cards-extension/releases/latest/download/virtual-cards-extension.zip) again and unzip it.
2. Replace your old `virtual-cards-extension` folder with the new one. Keep it in the same place with the same name.
3. Go to `chrome://extensions` and click the reload arrow ↻ on Virtual Card Helper.

Your nicknames and settings carry over. To hear about new versions, click **Watch → Custom → Releases** at the top of this page. You'll need a free GitHub account.

## Good to know

- It's built and tested in Chrome 116 or newer, on a computer.
- If Capital One changes its website, the extension may stop working until I update it.
- It can't fill in checkout forms. You copy and paste.

## Questions or problems

[Open an issue](https://github.com/AstroCaleb/virtual-cards-extension/issues) and I'll do my best to help. **Never post card numbers, or screenshots that show your account.**

## The fine print

"Capital One" and "Eno" are trademarks of Capital One Financial Corporation. They're used here only to say which accounts Virtual Card Helper works with. This is an unofficial tool, so using it may go against Capital One's terms of use, and it could stop working at any time. Use it at your own risk. It's free and open source under the [MIT License](LICENSE), with no warranty.

<details>
<summary><strong>For developers</strong></summary>

Plain JavaScript with no build step. The repository root is the extension, so **Load unpacked** on a clone works directly.

Capital One's API has two halves. Listing, searching, renaming, locking and deleting are plain JSON, which a content script on `myaccounts.capitalone.com` calls from inside the signed-in page, where the session cookie applies. Creating and revealing are end-to-end encrypted to the page, so the extension opens Capital One's own screen and reads the details back once they render.

```bash
node tools/capture.test.mjs
```

After editing `sidepanel/`, reload the extension. After editing `content/` or `src/`, reload the extension **and** the Capital One tab.

Releases are automated. Commits to `main` that start with `fix:` or `feat:` open a release pull request, and merging it publishes a new version.

</details>
