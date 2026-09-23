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
  const EXPIRY = /\b(?:0[1-9]|1[0-2])\s*\/\s*\d{2}(?:\d{2})?\b/;
  const LABELLED_CVV = /(?:security code|cvv|cvc|cvn|card code)\D{0,24}?(\d{3,4})\b/i;
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

  function findDetails() {
    // innerText rather than textContent: it reflects what is actually visible, so
    // masked placeholders and offscreen templates do not match. Whitespace is flattened
    // because the number is often four separate elements.
    const text = (document.body?.innerText ?? '').replace(/\s+/g, ' ');
    if (!text) return null;

    let number = null;
    for (const match of text.matchAll(PAN)) {
      const digits = match[0].replace(/\D/g, '');
      if (digits.length >= 15 && digits.length <= 16 && luhn(digits)) {
        number = digits;
        break;
      }
    }
    if (!number) return null;

    return {
      number,
      expiry: (text.match(EXPIRY)?.[0] ?? '').replace(/\s/g, ''),
      cvv: text.match(LABELLED_CVV)?.[1] ?? '',
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
