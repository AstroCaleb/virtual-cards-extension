// Runs on myaccounts.capitalone.com and does the API calls on the side panel's
// behalf, because only code running on this origin gets the session cookie.
(() => {
  const ACCOUNTS_KEY = 'accounts';

  function currentArid() {
    return new URL(location.href).searchParams.get('arid');
  }

  // The account reference sits in the page URL. Remember each one seen so the panel
  // can offer both cards (Savor and Venture) without the user pasting anything.
  async function rememberAccount() {
    const arid = currentArid();
    if (!arid) return;
    const { [ACCOUNTS_KEY]: accounts = {} } = await chrome.storage.local.get(ACCOUNTS_KEY);
    if (accounts[arid]) return;
    // Just a marker that this account exists. Its label and card name come from the
    // account lookup, and only what the user types is stored here.
    accounts[arid] = {};
    await chrome.storage.local.set({ [ACCOUNTS_KEY]: accounts });
  }

  const handlers = {
    ping: async () => ({ href: location.href, arid: currentArid() }),
    accounts: async () => C1.listAccounts(),
    // Named rather than spread so nothing unexpected reaches the API, but everything the
    // panel actually sends has to be listed here — limit was missing, and was dropped.
    list: async ({ referenceId, referenceIdType, search, tokenStatus, limit, offset }) =>
      C1.listCards({ referenceId, referenceIdType, search, tokenStatus, limit, offset }),
    cardholders: async ({ arid }) => C1.listCardholders({ arid }),
    update: async ({ card, account, changes }) => {
      await C1.updateCard({ card, account, changes });
      return { ok: true };
    },
    stepUp: async () => ({ satisfied: await C1.isStepUpSatisfied() }),
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = handlers[message?.type];
    if (!handler) return undefined;
    (async () => {
      try {
        sendResponse({ ok: true, data: await handler(message.payload ?? {}) });
      } catch (error) {
        sendResponse({ ok: false, code: error.code ?? 'UNKNOWN', error: error.message });
      }
    })();
    return true; // keeps the channel open for the async response
  });

  rememberAccount();
  addEventListener('popstate', rememberAccount);
  // The manager is a single-page app: switching accounts rewrites the URL through
  // history.pushState, which fires no event of its own, so watch for it.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    rememberAccount();
  }, 1000);
})();
