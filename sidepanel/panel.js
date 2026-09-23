// Side panel UI. It holds no card data of its own: every call goes to the content
// script running on myaccounts.capitalone.com, which is the only place with the session.
const CAPITAL_ONE_MATCH = 'https://myaccounts.capitalone.com/*';
const CAPITAL_ONE_HOME = 'https://myaccounts.capitalone.com/accountSummary';
const ACCOUNTS_KEY = 'accounts';
const STATUS_FILTER_KEY = 'statusFilter';
const AUTO_OPEN_KEY = 'autoOpen';
const NOTICE_KEY = 'noticeAccepted';
// Raise this when what the panel does with your data changes, so the notice asks again.
const NOTICE_VERSION = 1;
const TAB_READY_TIMEOUT_MS = 20000;

// The values Capital One's own Status filter sends. [] means every state.
const STATUS_FILTERS = {
  all: [],
  active: ['ACTIVE'],
  expired: ['EXPIRED'],
  deactivated: ['DELETED_NWFLIP'],
};

// Capital One's own Deactivated filter misses cards whose status reads "Inactive" (two
// seen on 2026-09-15; INACTIVE and Inactive as filter values both returned nothing). So for
// these two filters the server's answer is topped up with whatever the unfiltered list
// carries the matching flag for. Additive only: nothing the server returns is dropped.
const TOP_UP = {
  expired: card => card.expired,
  deactivated: card => card.deactivated,
};
// The server answers 400 to a limit above its own page size, so a full list is paged.
const PAGE_SIZE = 50;
const MAX_PAGES = 10;

// Its offset is a page number, not a row count: the response carries maxPage alongside
// it, and offset=50 is refused while offset=1 is the second page (2026-09-15, 54 cards).
// A page after the first that fails ends the walk with what was gathered, rather than
// failing the whole filter. The first page's errors still surface.
async function listAll(scope) {
  const all = [];
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    let batch;
    try {
      ({ cards: batch, total } = await callBridge('list', { ...scope, limit: PAGE_SIZE, offset: page }));
    } catch (error) {
      if (page === 0) throw error;
      console.warn(`Page ${page + 1} of the card list failed (${error.code}); using ${all.length} of ${total} cards.`);
      break;
    }
    all.push(...batch);
    if (!batch.length || all.length >= total) break;
  }
  return all;
}

const CARDHOLDER_ALL = 'all';
const SUGGEST_LIMIT = 4;
const SUGGEST_DEBOUNCE_MS = 400;
const CAPTURE_TTL_MS = 3 * 60 * 1000;
// Signing in takes a while, so watch for a usable tab rather than making you press Refresh.
const WAIT_POLL_MS = 2000;
const WAIT_TIMEOUT_MS = 3 * 60 * 1000;
const COPY_LABELS = { number: 'Card number', expiry: 'Expiry', cvv: 'Security code' };

const els = {
  account: document.getElementById('account'),
  cardholder: document.getElementById('cardholder'),
  cardholderField: document.getElementById('cardholder-field'),
  refresh: document.getElementById('refresh'),
  setup: document.getElementById('account-setup'),
  label: document.getElementById('account-label'),
  cardName: document.getElementById('card-name'),
  cardLastFour: document.getElementById('card-last-four'),
  autoOpen: document.getElementById('auto-open'),
  search: document.getElementById('search'),
  statusFilter: document.getElementById('status-filter'),
  create: document.getElementById('create'),
  status: document.getElementById('status'),
  captured: document.getElementById('captured'),
  capturedDivider: document.getElementById('captured-divider'),
  capturedName: document.getElementById('captured-name'),
  capturedNumber: document.getElementById('captured-number'),
  capturedExpiry: document.getElementById('captured-expiry'),
  capturedCvv: document.getElementById('captured-cvv'),
  capturedToggle: document.getElementById('captured-toggle'),
  capturedDismiss: document.getElementById('captured-dismiss'),
  capturedCountdown: document.getElementById('captured-countdown'),
  cards: document.getElementById('cards'),
  template: document.getElementById('card-template'),
  suggested: document.getElementById('suggested'),
  suggestedTitle: document.getElementById('suggested-title'),
  suggestedCards: document.getElementById('suggested-cards'),
  suggestedTemplate: document.getElementById('suggested-template'),
  notice: document.getElementById('notice'),
  noticeAccept: document.getElementById('notice-accept'),
};

let accounts = {};
let accountOverrides = {}; // only what the user typed; everything else comes from Capital One
let cardholders = [];
let cardholderById = new Map();
let lookupErrors = []; // surfaced in the status line so failures are not silent
let cards = [];
let searchTimer;
let armedDelete = null; // the one card whose Delete is waiting for a confirming click
let captured = null; // card details read off Capital One's page: memory only
let pendingCard = null; // the card we asked Capital One to open, so the capture can be named
let capturedRevealed = false;
let captureTimer;
let countdownTimer;
let needsData = true; // cleared once a load succeeds
let waitTimer = null;
let autoOpen = true;
let autoOpenedTabId = null; // one unprompted tab is enough; never pile them up
let returnToTab = null; // where you were before any detour over to Capital One
let suggestTimer;
const suggestionCache = new Map(); // host -> matches, so browsing does not re-query

// Takes a string, or an array of strings and nodes when the message needs a link.
// Counts and progress are centred; longer messages stay left where they read better.
function setStatus(content, tone = 'info', align = 'left') {
  els.status.replaceChildren(...(Array.isArray(content) ? content : [content]));
  els.status.dataset.tone = tone;
  els.status.dataset.align = align;
  delete els.status.dataset.busy;
}

// For the stretches where the panel is waiting on something slow enough that silence
// reads as broken. Pulses, because motion says "working" better than words do.
function setWorking(text) {
  setStatus(text, 'info', 'center');
  els.status.dataset.busy = 'true';
}

// target=_blank so it opens a tab instead of navigating the panel itself. It points at
// the servicing host, not www: signing in from the marketing site leaves you on a tab
// the panel cannot use, which is what NO_TAB means.
function capitalOneLink(text = 'Capital One') {
  const link = document.createElement('a');
  link.href = CAPITAL_ONE_HOME;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = text;
  link.addEventListener('click', () => waitForCapitalOne());
  return link;
}

// Fills the panel in as soon as a Capital One tab shows up. tabs.onUpdated does most of
// the work; this covers what it misses, and stops after a few minutes rather than
// polling forever.
function waitForCapitalOne() {
  if (waitTimer) return;
  // Deliberately does not touch the status line: the message it would replace is the one
  // holding the sign-in link, and without that this becomes a dead end.
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  waitTimer = setInterval(async () => {
    if (Date.now() > deadline) {
      stopWaiting();
      return;
    }
    if (!(await findCapitalOneTab())) return;
    stopWaiting();
    await reload();
  }, WAIT_POLL_MS);
}

function stopWaiting() {
  clearInterval(waitTimer);
  waitTimer = null;
}

// Opens Capital One in a background tab when the panel needs one, so keeping a tab
// around is not your job. It never steals focus — except when Capital One wants you to
// sign in, which you cannot act on if you cannot see it.
async function ensureCapitalOneTab() {
  const existing = await findCapitalOneTab();
  if (existing) {
    autoOpenedTabId = null;
    return existing;
  }
  if (!autoOpen || autoOpenedTabId !== null) return null;

  const created = await chrome.tabs.create({ url: CAPITAL_ONE_HOME, active: false });
  autoOpenedTabId = created.id;
  // This can take a while, and the tab is invisible, so say what is happening.
  setWorking('Opening Capital One in a background tab…');

  const ready = await waitForTabReady(created.id);
  if (ready) return ready;

  // It settled somewhere other than the servicing host, which in practice means the
  // sign-in page. Bring it forward rather than leaving it hidden, remembering where you
  // were so we can put you back afterwards.
  try {
    await rememberCurrentTab();
    await chrome.tabs.update(created.id, { active: true });
  } catch {
    // Tab closed while we waited.
  }
  return null;
}

// Notes where you are before sending you to Capital One. Skips Capital One's own pages,
// since being returned to one of those defeats the point.
async function rememberCurrentTab() {
  try {
    const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!current?.url || current.url.startsWith('https://myaccounts.capitalone.com/')) return;
    returnToTab = { tabId: current.id, windowId: current.windowId };
  } catch {
    // Nothing worth remembering.
  }
}

// Puts you back where you were before the detour — after a sign-in completes, or once the
// card details have been captured. Both wait for proof the errand is actually finished: a
// URL change is not, since Capital One can land on an interstitial you still need to answer.
async function returnToPreviousTab() {
  if (!returnToTab) return;
  const target = returnToTab;
  returnToTab = null;

  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    // If you already navigated away yourself, moving you again would be the rude option.
    if (active?.url && !active.url.startsWith('https://myaccounts.capitalone.com/')) return;
    await chrome.tabs.update(target.tabId, { active: true });
    await chrome.windows.update(target.windowId, { focused: true });
  } catch {
    // That tab is gone now; leave the focus where it is.
  }
}

// Resolves with the tab once it finishes loading on the servicing host, or null.
function waitForTabReady(tabId) {
  return new Promise(resolve => {
    let timer;
    const onUpdated = (id, changeInfo, tab) => {
      if (id !== tabId || changeInfo.status !== 'complete') return;
      finish(tab.url?.startsWith('https://myaccounts.capitalone.com/') ? tab : null);
    };
    function finish(result) {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(result);
    }
    timer = setTimeout(() => finish(null), TAB_READY_TIMEOUT_MS);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

// The full sequence: which accounts exist, which one the tab is on, who holds the cards,
// then the cards themselves. Several things can ask for it at once — the Refresh button,
// the tab watcher, the sign-in poll — so a reload already in flight is shared rather than
// run twice over the same data.
let reloading = null;
function reload() {
  if (!reloading) reloading = doReload().finally(() => (reloading = null));
  return reloading;
}

async function doReload() {
  // Best effort. If it cannot get a tab, the calls below fail with NO_TAB and the panel
  // falls back to asking you to sign in.
  try {
    await ensureCapitalOneTab();
  } catch (error) {
    console.warn('Could not open Capital One:', error.message);
  }
  await loadAccounts();
  await syncWithTab();
  await loadCardholders();
  await refresh();
  // Deliberately not awaited: the list is already on screen, and blocking here would also
  // hold up the hand-back to your previous tab after a sign-in.
  if (!needsData) loadSuggestions().catch(() => {});
}

function currentArid() {
  return els.account.value || null;
}

function currentAccount() {
  const arid = currentArid();
  return arid ? accounts[arid] : null;
}

async function findCapitalOneTab() {
  const [tab] = await chrome.tabs.query({ url: CAPITAL_ONE_MATCH });
  return tab ?? null;
}

// Talks to the content script, injecting it first if this tab predates the extension.
async function callBridge(type, payload = {}) {
  const tab = await findCapitalOneTab();
  if (!tab) {
    const error = new Error('No Capital One tab is open.');
    error.code = 'NO_TAB';
    throw error;
  }

  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type, payload });
  } catch {
    // Chrome refuses to inject into a tab that is on an error page or still loading, in
    // which case the raw message ("Cannot access contents of url…") is no help to anyone.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/config.js', 'src/c1-api.js', 'content/bridge.js'],
      });
      response = await chrome.tabs.sendMessage(tab.id, { type, payload });
    } catch {
      const error = new Error('The Capital One tab did not answer.');
      error.code = 'NO_BRIDGE';
      throw error;
    }
  }

  if (!response?.ok) {
    const error = new Error(response?.error ?? 'The Capital One page did not answer.');
    error.code = response?.code ?? 'UNKNOWN';
    throw error;
  }
  return response.data;
}

async function openCapitalOne(url) {
  const tab = await findCapitalOneTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { url, active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url });
}

// The one message shown whenever there is no usable tab. It stays on screen while the
// panel watches for one, so there is always something to click.
function signInPrompt() {
  // A tab we opened is already in front of them showing the sign-in page, so pointing at
  // a link that opens a second one would be daft.
  if (autoOpenedTabId !== null) {
    return 'Capital One is asking you to sign in. Finish in the tab that just opened and this panel will fill in.';
  }
  return ['Sign in to ', capitalOneLink(), ' and this panel will fill in on its own.'];
}

function describe(error) {
  switch (error.code) {
    case 'NO_TAB':
      return signInPrompt();
    case 'SIGNED_OUT':
      return ['That session timed out. Sign in to ', capitalOneLink(), ' again, then hit Refresh.'];
    case 'UNAUTHORIZED':
      return 'Capital One refused that call. The session is fine; the request is missing something it wants.';
    case 'ACCOUNT_INCOMPLETE':
      return error.message;
    case 'NETWORK':
      return 'Could not reach Capital One.';
    case 'TIMEOUT':
      return 'Capital One took too long to answer. Try again in a moment.';
    case 'NO_BRIDGE':
      return 'The Capital One tab did not answer. Reload that tab, then hit Refresh.';
    default:
      return error.message;
  }
}

async function loadAccounts() {
  const stored = await chrome.storage.local.get(ACCOUNTS_KEY);
  accountOverrides = stored[ACCOUNTS_KEY] ?? {};

  lookupErrors = [];
  let discovered = [];
  try {
    discovered = await callBridge('accounts');
  } catch (error) {
    // Not fatal: an account picked up from a page URL still works, just unlabelled.
    // NO_TAB is a "not yet", not a broken endpoint, so it is not worth reporting.
    if (error.code !== 'NO_TAB') lookupErrors.push(`accounts ${error.code ?? error.message}`);
    console.warn('Account lookup failed:', error.code, error.message);
  }

  accounts = {};
  for (const account of discovered) {
    const override = accountOverrides[account.arid] ?? {};
    const described = [account.productName, account.lastFour && `••${account.lastFour}`].filter(Boolean).join(' ');
    accounts[account.arid] = {
      ...account,
      label: override.label || account.nickname || described || 'Account',
      // What the update call calls cardName is the product name: Savor, Venture.
      cardName: override.cardName || account.productName || '',
      cardLastFour: override.cardLastFour || account.lastFour || '',
    };
  }
  for (const [arid, override] of Object.entries(accountOverrides)) {
    if (!accounts[arid]) accounts[arid] = { arid, label: 'Account', ...override };
  }

  const previous = els.account.value;
  els.account.replaceChildren();
  for (const [arid, account] of Object.entries(accounts)) {
    els.account.append(new Option(account.label, arid));
  }
  if (previous && accounts[previous]) els.account.value = previous;
  renderAccountSetup();
}

// Follows whichever account the Capital One tab is showing, so switching cards over
// there switches the panel too. Returns true when the selection actually changed.
async function syncWithTab() {
  let arid;
  try {
    ({ arid } = await callBridge('ping'));
  } catch {
    return false; // no tab open, or its content script isn't up yet
  }
  if (!arid) return false;

  if (!accounts[arid]) {
    // In a page URL but not in the account lookup: keep it for this session.
    accounts[arid] = { arid, label: 'Account', cardName: '', cardLastFour: '' };
    els.account.append(new Option(accounts[arid].label, arid));
  }
  if (els.account.value === arid) return false;
  els.account.value = arid;
  renderAccountSetup();
  return true;
}

// Cardholder names and per-card eligibilities, from Capital One's own virtual card
// home payload. Failing here is not fatal: the panel just loses the labels and leaves
// every action enabled.
async function loadCardholders() {
  const arid = currentArid();
  cardholders = [];
  cardholderById = new Map();

  if (arid) {
    try {
      cardholders = await callBridge('cardholders', { arid });
      cardholderById = new Map(cardholders.map(holder => [holder.cardReferenceId, holder]));
    } catch (error) {
      // Not fatal: no labels, and every action stays enabled.
      if (error.code !== 'NO_TAB') lookupErrors.push(`cardholders ${error.code ?? error.message}`);
      console.warn('Cardholder lookup failed:', error.code, error.message);
    }
  }

  const previous = els.cardholder.value;
  els.cardholder.replaceChildren(new Option('All cardholders', CARDHOLDER_ALL));
  for (const holder of cardholders) {
    els.cardholder.append(new Option(`${holder.name} ••${holder.lastFour}`, holder.cardReferenceId));
  }
  if (previous && [...els.cardholder.options].some(option => option.value === previous)) {
    els.cardholder.value = previous;
  }
  els.cardholderField.hidden = cardholders.length < 2;
}

function renderAccountSetup() {
  const account = currentAccount();
  els.setup.hidden = !account;
  if (!account) return;
  els.label.value = account.label ?? '';
  // Read-only: Capital One's update call expects these exact values.
  els.cardName.textContent = account.cardName || '—';
  els.cardLastFour.textContent = account.cardLastFour ? `••${account.cardLastFour}` : '—';
}

async function saveAccount(changes) {
  const arid = currentArid();
  if (!arid) return;
  accountOverrides[arid] = { ...accountOverrides[arid], ...changes };
  accounts[arid] = { ...accounts[arid], ...changes };
  await chrome.storage.local.set({ [ACCOUNTS_KEY]: accountOverrides });
  if (changes.label !== undefined) {
    const option = [...els.account.options].find(option => option.value === arid);
    if (option) option.textContent = changes.label;
  }
}

// Built as nodes rather than one string so "Locked" can carry its own weight and icon.
// Plain strings become text nodes, so API-supplied names are never parsed as markup.
// The merchant's logo, falling back to its first letter the way Capital One's own list
// does. The URL comes from an API response, so it has to be an https capitalone.com one
// before it becomes a src.
function renderLogo(node, card) {
  const tile = node.querySelector('.card-logo');
  const letter = (card.merchant || card.name || '?').trim().charAt(0).toUpperCase() || '?';

  const useLetter = () => {
    const span = document.createElement('span');
    span.className = 'card-logo-letter';
    span.textContent = letter;
    tile.replaceChildren(span);
  };

  let source = '';
  try {
    const url = new URL(card.logo);
    if (url.protocol === 'https:' && /(^|\.)capitalone\.com$/i.test(url.hostname)) source = url.href;
  } catch {
    // No logo, or not a URL at all.
  }
  if (!source) {
    // Empty is normal for an unbound card; a non-empty one that failed the check is not.
    if (card.logo) console.warn('Logo URL rejected:', card.logo);
    useLetter();
    return;
  }

  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.addEventListener('error', useLetter, { once: true });
  image.src = source;
  tile.replaceChildren(image);
}

// The emoji is hidden from assistive tech, which would otherwise read the picture and
// the word: "locked padlock Locked".
function stateFlag(icon, label) {
  const flag = document.createElement('strong');
  flag.className = 'card-flag';
  const glyph = document.createElement('span');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = icon;
  flag.append(glyph, ` ${label}`);
  return flag;
}

function renderMeta(node, card, holderName = '') {
  // A line each for what the card is, whose it is, and what state it is in. One line
  // wrapped badly in a column this narrow.
  const identity = node.querySelector('.card-meta');
  const holder = node.querySelector('.card-holder');
  const state = node.querySelector('.card-status');
  for (const line of [identity, holder, state]) line.replaceChildren();

  const identityBits = [];
  if (card.lastFour) identityBits.push(`•••• ${card.lastFour}`);
  // The merchant URL as Capital One stores it, which is what its own manager shows.
  if (card.merchantUrl || card.merchant) identityBits.push(card.merchantUrl || card.merchant);
  identityBits.forEach((bit, i) => identity.append(i ? ` · ${bit}` : bit));
  identity.hidden = identityBits.length === 0;

  holder.textContent = holderName;
  holder.hidden = !holderName;

  const stateBits = [];
  if (card.expires) stateBits.push(`exp ${card.expires}`);
  stateBits.forEach((bit, i) => state.append(i ? ` · ${bit}` : bit));

  const flags = [];
  if (card.expired) flags.push(stateFlag('⚠️', 'Expired'));
  if (card.deactivated) flags.push(stateFlag('🚫', 'Deactivated'));
  if (card.locked) flags.push(stateFlag('🔒', 'Locked'));
  for (const flag of flags) {
    if (state.childNodes.length) state.append(' · ');
    state.append(flag);
  }
  state.hidden = state.childNodes.length === 0;
}

// Takes the card's own account, not the selected one, so a suggestion from the other
// account opens correctly.
async function revealCard(card, arid) {
  pendingCard = card;
  await rememberCurrentTab(); // so the captured details can send you back
  // reveal=true only works on a session that has already cleared the texted-code check.
  // Asking for it otherwise errors the page out.
  let verified = false;
  try {
    ({ satisfied: verified } = await callBridge('stepUp'));
  } catch {
    verified = false; // if we can't tell, let Capital One's page do the asking
  }
  await openCapitalOne(C1_PAGES.card(arid, card.tokenReferenceId, verified));
  setStatus(
    verified
      ? 'Opened the card with its number showing. It will appear here once it renders.'
      : 'Opened the card. Capital One will want to verify you first before card details are available.',
  );
}

// The site in the frontmost tab, as a hostname and a search term: www.newegg.com gives
// "newegg.com" and "newegg".
async function activeSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const { hostname } = new URL(tab?.url ?? '');
    if (!hostname || hostname.endsWith('capitalone.com')) return { host: '', term: '' };
    const host = hostname.replace(/^www\./, '');
    const labels = host.split('.');
    // Second-to-last label, unless that is a short one like the "co" of co.uk.
    let term = labels.at(-2) ?? labels[0];
    if (term.length <= 3 && labels.length > 2) term = labels.at(-3) ?? term;
    return { host, term };
  } catch {
    return { host: '', term: '' }; // chrome:// pages, blank tabs
  }
}

// How well a card actually belongs to this site, best first. The search itself is
// deliberately loose, so this is what keeps the good matches at the top.
function suggestionScore(card, host) {
  if (bindingMatches(card, host)) return 3;
  const name = (card.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const flatHost = host.replace(/[^a-z0-9]/g, '');
  if (!name) return 0;
  // "Dunkin" against dunkindonuts.com, or "newegg.com" against newegg.com.
  if (flatHost.includes(name) || name.includes(flatHost)) return 2;
  return 1; // matched the search but the name says nothing about the site
}

function bindingMatches(card, host) {
  const bound = (card.merchantUrl ?? '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
  return Boolean(bound) && (bound === host || bound.endsWith(`.${host}`) || host.endsWith(`.${bound}`));
}

// Cards that look like they belong to the site you are on: named after it, or bound to it
// by Capital One. The name search runs per account and server-side, so a card sitting past
// the 50-card page, or on the account you have not selected, still surfaces.
async function loadSuggestions() {
  const { host, term } = await activeSite();
  if (!host || !term || !Object.keys(accounts).length) {
    renderSuggestions([]);
    return;
  }
  if (suggestionCache.has(host)) {
    renderSuggestions(suggestionCache.get(host));
    return;
  }

  // A prefix, not the whole label: a card named "Dunkin" can never be found by searching
  // "dunkindonuts", but "dunki" finds it. Scoring below sorts out the looseness.
  const searchTerm = term.slice(0, 5);

  // Every account at once rather than one after another, and a small page: this runs
  // while you are waiting to see the section, so the round trips should overlap.
  const searches = await Promise.all(
    Object.entries(accounts).map(async ([arid, account]) => {
      try {
        const { cards: matches } = await callBridge('list', {
          referenceId: arid,
          referenceIdType: 'ACCOUNT',
          search: searchTerm,
          tokenStatus: STATUS_FILTERS.active,
          limit: SUGGEST_LIMIT * 2,
        });
        return matches.map(card => ({ card, arid, account }));
      } catch {
        return []; // one account failing should not cost the others
      }
    }),
  );

  const found = new Map();
  for (const match of searches.flat()) {
    if (!found.has(match.card.tokenReferenceId)) found.set(match.card.tokenReferenceId, match);
  }

  // Cards Capital One bound to this merchant, which a name search would never find.
  for (const card of cards) {
    if (found.has(card.tokenReferenceId) || !bindingMatches(card, host)) continue;
    found.set(card.tokenReferenceId, { card, arid: currentArid(), account: currentAccount() });
  }

  const matches = [...found.values()]
    .map(match => ({ ...match, score: suggestionScore(match.card, host) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SUGGEST_LIMIT);
  suggestionCache.set(host, matches);
  renderSuggestions(matches);
}

function renderSuggestions(matches) {
  els.suggestedCards.replaceChildren();
  els.suggested.hidden = matches.length === 0;
  if (!matches.length) return;

  els.suggestedTitle.textContent = matches.length === 1 ? 'Suggested card' : 'Suggested cards';
  const selected = currentArid();

  for (const { card, arid, account } of matches) {
    const node = els.suggestedTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.locked = String(card.locked);
    renderLogo(node, card);
    node.querySelector('.card-name').textContent = card.name || '(unnamed)';

    const meta = node.querySelector('.card-meta');
    const bits = [];
    if (card.lastFour) bits.push(`•••• ${card.lastFour}`);
    // Only worth naming the account when it is not the one already selected.
    if (arid !== selected && account?.label) bits.push(account.label);
    if (card.locked) bits.push('Locked');
    bits.forEach((bit, i) => meta.append(i ? ` · ${bit}` : bit));

    node.querySelector('[data-action="reveal"]').addEventListener('click', () => revealCard(card, arid));
    els.suggestedCards.append(node);
  }
}

function scheduleSuggestions() {
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(loadSuggestions, SUGGEST_DEBOUNCE_MS);
}

// Empties the list so switching looks like loading, rather than showing the previous
// account's cards until the new ones land. Deliberately not used for search, where
// clearing on every keystroke would flicker worse than briefly stale rows.
function clearCardList() {
  cards = [];
  renderCards();
}

function renderCards() {
  els.cards.replaceChildren();
  armedDelete = null; // the button it pointed at is gone
  const arid = currentArid();

  for (const card of cards) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.dataset.locked = String(card.locked);
    node.dataset.deactivated = String(card.deactivated);
    node.dataset.expired = String(card.expired);
    // textContent throughout: card and merchant names come from the API.
    renderLogo(node, card);
    node.querySelector('.card-name').textContent = card.name || '(unnamed)';
    // Whose card it is only matters when the list mixes cardholders.
    const mixed = cardholders.length > 1 && els.cardholder.value === CARDHOLDER_ALL;
    renderMeta(node, card, mixed ? cardholderById.get(card.cardReferenceId)?.name : '');

    const lockButton = node.querySelector('[data-action="lock"]');
    lockButton.textContent = card.locked ? 'Unlock' : 'Lock';

    // Capital One's own eligibility flags say what a cardholder may do, and a
    // deactivated card is already deleted so nothing applies to it either way. The meta
    // line names both reasons, which is what explains the dead buttons.
    const can = cardholderById.get(card.cardReferenceId)?.can;
    const allowed = {
      reveal: can?.reveal !== false,
      lock: can?.lock !== false && !card.deactivated,
      rename: can?.rename !== false && !card.deactivated,
      delete: can?.delete !== false && !card.deactivated,
    };
    for (const [action, ok] of Object.entries(allowed)) {
      node.querySelector(`[data-action="${action}"]`).disabled = !ok;
    }

    node.querySelector('[data-action="reveal"]').addEventListener('click', () => revealCard(card, arid));

    lockButton.addEventListener('click', async () => {
      const restore = setCardBusy(node, lockButton, card.locked ? 'Unlocking…' : 'Locking…');
      if (!(await mutate(card, { allowAuthorizations: card.locked }))) restore();
    });
    node.querySelector('[data-action="rename"]').addEventListener('click', () => startRename(node, card));
    // Two-step rather than confirm(), which a side panel may refuse to show.
    const deleteButton = node.querySelector('[data-action="delete"]');
    const armedMessage = `Click again to delete ${card.name || `the card ending ${card.lastFour}`}. This cannot be undone.`;
    let disarmTimer;

    const disarm = () => {
      clearTimeout(disarmTimer);
      deleteButton.textContent = 'Delete';
      deleteButton.classList.remove('armed');
      if (armedDelete === disarm) armedDelete = null;
      // Only clear it if nothing newer has taken the status line.
      if (els.status.textContent === armedMessage) setStatus('');
    };

    deleteButton.addEventListener('click', async () => {
      if (armedDelete !== disarm) {
        armedDelete?.(); // only one card is armed at a time
        armedDelete = disarm;
        deleteButton.textContent = 'Confirm?';
        deleteButton.classList.add('armed');
        setStatus(armedMessage);
        disarmTimer = setTimeout(disarm, 5000);
        return;
      }
      disarm();

      // Swap the buttons for a message of the same height, so the row neither
      // collapses nor looks untouched while the delete is in flight. Measured
      // rather than hardcoded because the buttons wrap in a narrow panel.
      const actions = node.querySelector('.card-actions');
      actions.style.minHeight = `${actions.offsetHeight}px`;
      const busy = document.createElement('p');
      busy.className = 'card-busy';
      busy.textContent = 'Deleting…';
      actions.replaceChildren(busy);

      const deleted = await mutate(card, { isDeleted: true });
      if (!deleted) renderCards(); // put the buttons back, leaving the error on screen
    });

    els.cards.append(node);
  }
}

// Disables a card's buttons and shows progress on the one that was pressed, so the
// feedback is where the click happened and not only in the status line far above.
function setCardBusy(node, button, label) {
  const buttons = [...node.querySelectorAll('.card-actions button')];
  const wasDisabled = buttons.map(other => other.disabled);
  const original = button.textContent;

  for (const other of buttons) other.disabled = true;
  button.textContent = label;
  button.classList.add('is-busy');
  button.setAttribute('aria-busy', 'true');

  return () => {
    buttons.forEach((other, i) => {
      other.disabled = wasDisabled[i];
    });
    button.textContent = original;
    button.classList.remove('is-busy');
    button.removeAttribute('aria-busy');
  };
}

function startRename(node, card) {
  if (node.querySelector('.rename-form')) return;
  const form = document.createElement('form');
  form.className = 'rename-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = card.name;
  input.maxLength = 40;
  input.setAttribute('aria-label', 'New card name');

  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'link';
  cancel.textContent = 'Cancel';

  // Send focus back to Rename, so keyboard users are not dropped at the top of the list.
  const close = () => {
    form.remove();
    node.querySelector('[data-action="rename"]')?.focus();
  };

  cancel.addEventListener('click', close);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });

  form.append(input, save, cancel);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const tokenName = input.value.trim();
    if (!tokenName || tokenName === card.name) {
      close();
      return;
    }

    const restore = setCardBusy(node, save, 'Saving…');
    input.disabled = true;
    cancel.disabled = true;
    // On success the list re-renders and this row is replaced, so only failure restores.
    if (!(await mutate(card, { tokenName }))) {
      restore();
      input.disabled = false;
      cancel.disabled = false;
      input.focus();
    }
  });

  // Into the body, not the card itself, which is now a row with the logo beside it.
  node.querySelector('.card-body').append(form);
  input.focus();
  input.select();
}

// Returns whether the change went through, so a caller can restore its row.
async function mutate(card, changes) {
  // The update call wants the physical card's last four, which differs per cardholder,
  // so prefer what Capital One reports for this card over the account-level value.
  const holder = cardholderById.get(card.cardReferenceId);
  const account = { ...currentAccount(), ...(holder?.lastFour ? { cardLastFour: holder.lastFour } : {}) };
  setWorking('Saving…');
  try {
    await callBridge('update', { card, account, changes });
    suggestionCache.clear(); // a rename or delete can change what matches a site
    setStatus('Saved.', 'info', 'center');
    await refresh();
    return true;
  } catch (error) {
    setStatus(describe(error), 'error');
    return false;
  }
}

// Only the newest refresh may touch the list: a slow search response arriving after a
// faster one would otherwise put stale rows on screen.
let refreshSeq = 0;

async function refresh() {
  const seq = ++refreshSeq;
  const arid = currentArid();
  if (!arid) {
    // No accounts means the lookup could not run, which means no usable tab.
    setStatus(signInPrompt());
    waitForCapitalOne();
    return;
  }
  setWorking('Loading…');
  try {
    // Filtering by cardholder is the same call aimed at their card rather than the account.
    const holder = els.cardholder.value;
    const byHolder = Boolean(holder) && holder !== CARDHOLDER_ALL;
    const scope = {
      referenceId: byHolder ? holder : arid,
      referenceIdType: byHolder ? 'CARD' : 'ACCOUNT',
      search: els.search.value.trim(),
    };
    let { cards: loaded, total } = await callBridge('list', {
      ...scope,
      tokenStatus: STATUS_FILTERS[els.statusFilter.value] ?? [],
    });

    const matches = TOP_UP[els.statusFilter.value];
    if (matches) {
      const all = await listAll({ ...scope, tokenStatus: [] });
      const seen = new Set(loaded.map(card => card.tokenReferenceId));
      const extra = all.filter(card => matches(card) && !seen.has(card.tokenReferenceId));
      loaded = [...loaded, ...extra];
      total += extra.length;
    }
    if (seq !== refreshSeq) return;
    cards = loaded;
    renderCards();
    needsData = false;
    const counted = cards.length === total ? `${total} card${total === 1 ? '' : 's'}` : `${cards.length} of ${total} cards`;
    if (lookupErrors.length) setStatus(`${counted}. Lookup failed: ${lookupErrors.join(', ')}.`);
    else setStatus(counted, 'info', 'center');
  } catch (error) {
    if (seq !== refreshSeq) return;
    needsData = true;
    cards = [];
    renderCards();
    setStatus(describe(error), 'error');
    // No tab yet: start watching instead of leaving it to you to press Refresh.
    if (error.code === 'NO_TAB') waitForCapitalOne();
  }
}

async function suggestedName() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const { hostname } = new URL(tab?.url ?? '');
    if (hostname && !hostname.endsWith('capitalone.com')) return hostname.replace(/^www\./, '');
  } catch {
    // Chrome pages and blank tabs have no usable URL.
  }
  return '';
}

// Details captured from Capital One's own screen. They live in this variable and in
// this panel's DOM, nowhere else: no chrome.storage, no logging, gone when it closes.
// No scraping needed: the panel knows which card it opened. The last four is checked in
// case what came back is a different card, and a created card falls back to the list.
function nameForCapture(details) {
  const lastFour = details.number.slice(-4);
  if (pendingCard?.lastFour === lastFour) return pendingCard.name;
  return cards.find(card => card.lastFour === lastFour)?.name ?? '';
}

// A card created moments ago is in no loaded list, so go and ask for it by last four.
// Capital One caches that list, so this can legitimately come back empty.
async function findCapturedName(details) {
  const arid = currentArid();
  if (!arid) return;

  const all = await listAll({ referenceId: arid, referenceIdType: 'ACCOUNT', tokenStatus: STATUS_FILTERS.active });

  const lastFour = details.number.slice(-4);
  const match = all.find(card => card.lastFour === lastFour);
  // The panel may have been dismissed, or moved on to another card, while we looked.
  if (!match?.name || captured?.number !== details.number) return;
  captured.label = match.name;
  renderCaptured();
}

function showCaptured(details) {
  captured = { ...details, label: nameForCapture(details) };
  capturedRevealed = false; // always arrives hidden, however the last one was left
  renderCaptured();
  els.captured.hidden = false;
  els.capturedDivider.hidden = false;
  clearTimeout(captureTimer);
  captureTimer = setTimeout(clearCaptured, CAPTURE_TTL_MS);
  startCountdown(Date.now() + CAPTURE_TTL_MS);

  // The errand is done and the details are in the panel, so there is no reason to leave
  // you sitting on Capital One. Not awaited: the details are already on screen.
  returnToPreviousTab().catch(() => {});

  // Nothing in the loaded list matched, which is exactly what a just-created card looks like.
  if (!captured.label) findCapturedName(details).catch(() => {});
}

// Counts down to the same deadline as captureTimer, so the number on screen and the
// moment the details vanish never disagree. Derived from a timestamp rather than
// decremented, because a throttled background tab can fire intervals late.
function startCountdown(deadline) {
  clearInterval(countdownTimer);
  const tick = () => {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    els.capturedCountdown.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (left === 0) clearInterval(countdownTimer);
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

// Masked unless revealed. Copy buttons read `captured`, not what is on screen, so they
// work either way.
function renderCaptured() {
  if (!captured) return;
  els.capturedName.textContent = captured.label ?? '';
  els.capturedName.hidden = !captured.label;

  const groups = captured.number.match(/\d{1,4}/g) ?? [];
  const maskedNumber = [...groups.slice(0, -1).map(group => '•'.repeat(group.length)), groups.at(-1)].join(' ');

  els.capturedNumber.textContent = capturedRevealed ? groups.join(' ') : maskedNumber;
  els.capturedExpiry.textContent = !captured.expiry ? '—' : capturedRevealed ? captured.expiry : '••/••';
  els.capturedCvv.textContent = !captured.cvv ? '—' : capturedRevealed ? captured.cvv : '•••';
  els.capturedToggle.textContent = capturedRevealed ? 'Hide' : 'Show';
  els.capturedToggle.setAttribute('aria-pressed', String(capturedRevealed));
}

function clearCaptured() {
  clearTimeout(captureTimer);
  clearInterval(countdownTimer);
  els.capturedCountdown.textContent = '';
  captured = null;
  capturedRevealed = false;
  pendingCard = null;
  els.captured.hidden = true;
  els.capturedDivider.hidden = true;
  els.capturedName.hidden = true;
  els.capturedName.textContent = '';
  for (const el of [els.capturedNumber, els.capturedExpiry, els.capturedCvv]) el.textContent = '';
}

// Nothing reaches Capital One, and no Capital One tab is opened, until you have read what
// the panel does and agreed. Stored as a version, so a change in data handling asks again.
async function awaitNotice() {
  const { [NOTICE_KEY]: agreed = 0 } = await chrome.storage.local.get(NOTICE_KEY);
  if (agreed >= NOTICE_VERSION) return;
  els.notice.hidden = false;
  await new Promise(resolve => els.noticeAccept.addEventListener('click', resolve, { once: true }));
  await chrome.storage.local.set({ [NOTICE_KEY]: NOTICE_VERSION });
  els.notice.hidden = true;
}

async function init() {
  await awaitNotice();

  const prefs = await chrome.storage.local.get([STATUS_FILTER_KEY, AUTO_OPEN_KEY]);
  if (prefs[STATUS_FILTER_KEY] in STATUS_FILTERS) els.statusFilter.value = prefs[STATUS_FILTER_KEY];
  autoOpen = prefs[AUTO_OPEN_KEY] !== false; // on unless turned off
  els.autoOpen.checked = autoOpen;

  await reload();

  els.account.addEventListener('change', async () => {
    renderAccountSetup();
    clearCardList();
    await loadCardholders();
    await refresh();
  });

  // The glow needs the cursor's position within the hovered card. Bound once at the top
  // rather than per list, so the suggestions get it too. The frame check comes first
  // because it is cheaper than walking up the tree.
  let glowFrame;
  document.addEventListener('pointermove', event => {
    if (glowFrame) return;
    const card = event.target.closest?.('.card');
    if (!card) return;
    glowFrame = requestAnimationFrame(() => {
      glowFrame = null;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--y', `${event.clientY - rect.top}px`);
    });
  });
  els.cardholder.addEventListener('change', async () => {
    clearCardList();
    await refresh();
  });
  els.refresh.addEventListener('click', reload);

  // Follow the Capital One tab. Chrome reports single-page navigations here, which is
  // how switching accounts in the manager reaches us.
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!changeInfo.url || !tab.url?.startsWith('https://myaccounts.capitalone.com/')) return;

    // A tab just became usable: sign-in finished, or one was opened. Load everything.
    const wasWaiting = Boolean(waitTimer);
    stopWaiting();
    if (wasWaiting || needsData) {
      await reload();
      // Cards loaded, so the sign-in really did take. Hand the tab back.
      if (!needsData) await returnToPreviousTab();
      return;
    }

    // Otherwise this is the account being switched in the tab we are already following.
    if (!(await syncWithTab())) return;
    await loadCardholders();
    await refresh();
  });

  // The content script records accounts it sees even while this panel is closed.
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && changes[ACCOUNTS_KEY]) await loadAccounts();
  });
  els.label.addEventListener('change', () => saveAccount({ label: els.label.value.trim() || 'Account' }));

  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refresh, 250);
  });

  els.statusFilter.addEventListener('change', async () => {
    await chrome.storage.local.set({ [STATUS_FILTER_KEY]: els.statusFilter.value });
    clearCardList();
    await refresh();
  });

  // Keep the suggestions pointed at whatever site you are looking at.
  chrome.tabs.onActivated.addListener(scheduleSuggestions);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.active) scheduleSuggestions();
  });

  els.autoOpen.addEventListener('change', async () => {
    autoOpen = els.autoOpen.checked;
    await chrome.storage.local.set({ [AUTO_OPEN_KEY]: autoOpen });
    if (autoOpen && needsData) await reload();
  });

  els.capturedDismiss.addEventListener('click', clearCaptured);

  els.capturedToggle.addEventListener('click', () => {
    capturedRevealed = !capturedRevealed;
    renderCaptured();
  });

  els.captured.addEventListener('click', async event => {
    const field = event.target.closest('[data-copy]')?.dataset.copy;
    if (!field || !captured?.[field]) return;
    try {
      await navigator.clipboard.writeText(captured[field]);
      setStatus(`${COPY_LABELS[field]} copied. It stays on the clipboard until something replaces it.`);
    } catch {
      setStatus('Chrome refused the clipboard. Select the value and copy it by hand.', 'error');
    }
  });

  // The capture content script sends details the moment Capital One renders them.
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'CARD_DETAILS') showCaptured(message.payload);
  });

  els.create.addEventListener('click', async () => {
    const arid = currentArid();
    if (!arid) return;
    pendingCard = null; // a card that does not exist yet cannot be named from the list
    await rememberCurrentTab();
    const name = await suggestedName();
    if (name) {
      try {
        await navigator.clipboard.writeText(name);
      } catch {
        // Clipboard can be refused; the page still opens.
      }
    }
    await openCapitalOne(C1_PAGES.create(arid));
    setStatus(name ? `Opened Capital One. "${name}" is on your clipboard for the card name.` : 'Opened Capital One.');
  });
}

// The page URL builders, duplicated from src/c1-api.js because that file only runs
// inside the Capital One tab.
const C1_PAGES = {
  card: (arid, tokenReferenceId, reveal = false) =>
    `https://myaccounts.capitalone.com/vc/virtual-cards/manager/manage?tokenRef=${encodeURIComponent(tokenReferenceId)}&reveal=${reveal}&arid=${encodeURIComponent(arid)}`,
  create: arid => `https://myaccounts.capitalone.com/vc/create-virtual-card?arid=${encodeURIComponent(arid)}`,
};

init();
