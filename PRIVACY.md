# Privacy policy

**Virtual Card Helper**, a free, unofficial Chrome extension by Caleb Dudley. It is not made by, affiliated with, or endorsed by Capital One.

Last updated: September 23, 2026

## The short version

Virtual Card Helper talks only to Capital One, from your own signed-in browser tab. I don't run a server, and the extension has no analytics, no tracking and no third-party services. It never saves card numbers, and it never sees your password or your texted codes.

## What it handles, and why

**Your virtual card list.** Card names, last four digits, expiry dates, lock status, cardholder names and the merchant a card is tied to. The extension asks Capital One for these so it can show your cards in the panel. It keeps them only while the panel is open and does not save them.

**Full card details.** The card number, expiry date and security code, only when you click **Show** or create a new card. The extension reads them from Capital One's own page once that page displays them. They stay in the panel's memory for at most 3 minutes, or until you close the panel. They are never saved, logged or sent anywhere.

**The site you're on.** The extension reads the address of your current tab for three things: suggesting cards for that site, finding your Capital One tab, and bringing you back to the page you were on. To suggest cards, it sends the first five letters of the site's name to Capital One as a card search. On amazon.com, for example, it searches for "amazo". It sends nothing else about your browsing anywhere, and it doesn't save the addresses it sees.

**Your clipboard.** Clicking **Copy** puts that card detail on your clipboard. Clicking **New card** puts the current site's address there, so you can paste it as the card's name. Whatever you copy stays on your clipboard until you copy something else, just like any other copy.

**Saved on your computer.** The extension uses Chrome's local storage, which stays on your computer and is never synced. It saves:

- the nicknames you give your accounts
- Capital One's internal reference for each account, taken from the page address (not a card number)
- your status filter choice
- whether to open Capital One automatically when the panel needs it
- that you agreed to the notice shown the first time you open the panel

**Never handled.** Your Capital One password and one-time codes. You sign in and verify on Capital One's own pages, and the extension has no access to either.

## Who it's shared with

Only Capital One, as part of using your own account. Every request goes to `myaccounts.capitalone.com` over HTTPS, the same way Capital One's website makes them. Merchant logos load only from Capital One's servers. Capital One's own privacy policy covers what they do with activity on your account.

Nothing is sold, shared with anyone else, or used for anything other than the features described here. Nothing is used for advertising, credit decisions or lending.

## How long it's kept, and how to delete it

Full card details last at most 3 minutes, in memory only. Saved settings stay until you remove the extension. Removing it from `chrome://extensions` deletes all of them.

## Changes

If the way the extension handles your data ever changes, I'll update this page and describe the change in the release notes before it ships, and the panel will show its notice again so you can agree to the change. Every past version of this page is in the repository's history.

## Contact

Questions about privacy go to [the project's issues page](https://github.com/AstroCaleb/virtual-cards-extension/issues). Please never post card numbers or screenshots that show your account.
