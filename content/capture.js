// Reads card details off Capital One's own reveal and create-confirmation screens.
// The page decrypts them; this only reads what is already rendered, matched by shape
// rather than by CSS selector so their markup can change without breaking it.
//
// Nothing is kept or logged here. Details go straight to the side panel, which holds
// them in memory only. The de-duplication fingerprint deliberately uses the last four
// digits rather than the whole number.
(() => {
  const ROUTES = /\/vc\/(?:virtual-cards\/manager\/manage|create-virtual-card)/;
  const PAN = /(?:\d[ -]?){12,18}\d/g;
  const EXPIRY = /\b(?:0[1-9]|1[0-2])\s*\/\s*\d{2}(?:\d{2})?\b/g;
  const LABELLED_CVV = /(?:security code|cvv|cvc|cvn|card code)\D{0,24}?(\d{3,4})\b/gi;
  // How far from the number an expiry or security code may start, in characters of page
  // text. Room for labels and Copy buttons between them, but not for a date somewhere
  // else on the page. They usually follow the number, so less is allowed before it.
  const NEAR_AFTER = 160;
  const NEAR_BEFORE = 80;
  const SCAN_DELAY_MS = 300;

  function luhn(digits) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = Number(digits[digits.length - 1 - i]);
      if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
      sum += d;
    }
    return sum % 10 === 0;
  }

  // The match for pattern nearest the number, after it first, then before it. The range
  // stops at any neighbouring number, so one number never takes another's details.
  function near(text, pattern, card) {
    pattern.lastIndex = card.end;
    const after = pattern.exec(text);
    if (after && after.index < Math.min(card.end + NEAR_AFTER, card.next)) return after;

    let before = null;
    pattern.lastIndex = Math.max(card.start - NEAR_BEFORE, card.previous);
    for (let match; (match = pattern.exec(text)) && match.index + match[0].length <= card.start; ) before = match;
    return before;
  }

  function findDetails() {
    // innerText rather than textContent: it reflects what is actually visible, so
    // masked placeholders and offscreen templates do not match. Whitespace is flattened
    // because the number is often four separate elements.
    const text = (document.body?.innerText ?? '').replace(/\s+/g, ' ');
    if (!text) return null;

    const cards = [];
    for (const match of text.matchAll(PAN)) {
      const digits = match[0].replace(/\D/g, '');
      if (digits.length >= 15 && digits.length <= 16 && luhn(digits)) {
        cards.push({ number: digits, start: match.index, end: match.index + match[0].length });
      }
    }
    cards.forEach((card, i) => {
      card.previous = cards[i - 1]?.end ?? 0;
      card.next = cards[i + 1]?.start ?? text.length;
    });

    // About one in ten random 16-digit numbers passes the checksum, so the card is the one
    // with an expiry beside it. A lone number with none nearby is still sent, with the
    // expiry left blank rather than borrowed from elsewhere on the page.
    const card = cards.find(c => near(text, EXPIRY, c)) ?? (cards.length === 1 ? cards[0] : null);
    if (!card) return null;

    return {
      number: card.number,
      expiry: (near(text, EXPIRY, card)?.[0] ?? '').replace(/\s/g, ''),
      cvv: near(text, LABELLED_CVV, card)?.[1] ?? '',
    };
  }

  let lastPath = location.pathname;
  let lastSeen = '';

  function scan() {
    if (!ROUTES.test(location.pathname)) return;
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      lastSeen = '';
    }

    const details = findDetails();
    if (!details) return;

    const fingerprint = `${details.number.slice(-4)}|${details.expiry}`;
    if (fingerprint === lastSeen) return;
    lastSeen = fingerprint;

    chrome.runtime
      .sendMessage({ type: 'CARD_DETAILS', payload: details })
      .catch(() => {}); // nothing listening means the side panel is closed
  }

  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, SCAN_DELAY_MS);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  scan();
})();
