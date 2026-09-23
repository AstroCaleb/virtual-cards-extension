// Everything that knows the shape of Capital One's API lives here. When they change
// something, this should be the only file that needs editing.
//
// Runs as a content script on myaccounts.capitalone.com so that fetch is same-origin
// and carries the session cookie. The same calls from the service worker would be
// cross-site and would arrive signed out.
(() => {
  const { origin, listRoute, securityRoute, securityLevel, homeRoute, accountsRoute } = globalThis.C1_CONFIG;
  const listPath = `/web-api/private/${listRoute}/commerce-virtual-numbers`;
  // Long enough for a slow gateway, short enough that a hung call does not leave the
  // panel saying "Loading…" forever.
  const REQUEST_TIMEOUT_MS = 20000;

  class ApiError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
    }
  }

  async function request(path, { method = 'GET', body, accept = 'application/json;v=2', route = 'vc/virtual-cards/manager', headers: extraHeaders = {} } = {}) {
    let response;
    try {
      response = await fetch(`${origin}${path}`, {
        method,
        credentials: 'include',
        headers: {
          accept,
          // Only when there is something to describe; a bodyless GET should not claim one.
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          'x-ui-routing-id': route,
          'cache-control': 'no-cache',
          pragma: 'no-cache',
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      if (cause.name === 'TimeoutError') throw new ApiError('TIMEOUT', `${method} ${path} did not answer in time.`);
      throw new ApiError('NETWORK', cause.message);
    }

    // Not necessarily signed out: some endpoints want headers the card list does not,
    // and refuse the call rather than the session.
    if (response.status === 401 || response.status === 403) {
      throw new ApiError('UNAUTHORIZED', `Capital One refused this call with ${response.status}.`);
    }
    if (!response.ok) {
      throw new ApiError(`HTTP_${response.status}`, `${method} ${path} returned ${response.status}.`);
    }
    // A timed-out session answers with the sign-in page rather than an error status.
    if (!(response.headers.get('content-type') ?? '').includes('json')) {
      throw new ApiError('SIGNED_OUT', 'Expected JSON and got a page, which usually means the session timed out.');
    }
    return response.json();
  }

  function toCard(entry, fromDeactivatedFilter = false) {
    const status = entry.tokenStatus ?? entry.derivedStatus ?? '';
    return {
      tokenReferenceId: entry.tokenReferenceId,
      cardReferenceId: entry.cardReferenceId,
      name: entry.tokenName ?? '',
      lastFour: entry.tokenLastFour ?? '',
      status,
      // Under the Deactivated filter every row is one by definition. Outside it, fall
      // back to the status wording, which we have not seen for a deleted card.
      deactivated: fromDeactivatedFilter || /delet|deactiv|closed|cancell?ed|inactive/i.test(status),
      locked: entry.tokenRules?.allowAuthorizations === false,
      expires: entry.formattedTokenExpirationDate ?? '',
      expired: entry.hasTokenExpired === true,
      merchant: entry.tokenRules?.merchantBinding?.merchantName ?? entry.mdxInfo?.name ?? '',
      merchantUrl: entry.mdxInfo?.merchantUrl ?? '',
      logo: entry.mdxInfo?.imageUrl ?? '',
      mdxId: entry.mdxInfo?.mdxId ?? null,
      mdxUrlId: entry.mdxInfo?.mdxUrlId ?? null,
    };
  }

  // referenceIdType 'CARD' with a cardholder's cardReferenceId lists just that
  // cardholder's virtual cards; 'ACCOUNT' with the arid lists everyone's.
  async function listCards({ referenceId, referenceIdType = 'ACCOUNT', search = '', tokenStatus = [], limit = 50, offset = 0 }) {
    const query = new URLSearchParams({ limit, offset, excludeUnbound: 'false' });
    const data = await request(`${listPath}?${query}`, {
      method: 'POST',
      body: {
        referenceId,
        referenceIdType,
        // [] means every state; ['ACTIVE'], ['EXPIRED'] or ['DELETED_NWFLIP'] narrow it.
        tokenStatus,
        // Server-side search, the same call the manager's search box makes.
        filterCriteria: search ? [{ field: 'TOKEN_NAME', operator: 'LIKE', value: search }] : [],
        sortCriteria: [],
      },
    });
    const fromDeactivatedFilter = tokenStatus.includes('DELETED_NWFLIP');
    return { total: data.count ?? 0, cards: (data.entries ?? []).map(entry => toCard(entry, fromDeactivatedFilter)) };
  }

  // Every credit card account on the profile. This is where the account reference the
  // rest of the API wants comes from, along with the product name that the update call
  // calls cardName. It also carries branding and balances, which the panel ignores.
  async function listAccounts() {
    const query = new URLSearchParams({ density: '4', retrieveBusinessName: 'true', versionUpgrade: 'true' });
    const data = await request(`/web-api/protected/${accountsRoute}/customer-accounts?${query}`, {
      accept: 'application/json;v=1',
      route: 'accountSummary',
      // The account summary page's own headers. c1-xhr is what marks this as a
      // first-party call: without it the gateway answers 401, whatever the session.
      headers: {
        'c1-xhr': 'true',
        'channel-type': 'WEB',
        'c1-card-accept-language': 'en-US',
        'content-type': 'application/json;v=1',
        disableerrorinterceptor: 'true',
        'client-correlation-id': `www-${crypto.randomUUID()}`,
      },
    });
    return (data.entries ?? [])
      .filter(entry => entry.accountReferenceId && entry.isAccountHidden !== true)
      .filter(entry => !entry.businessLine || entry.businessLine === 'CREDIT_CARDS')
      .map(entry => ({
        arid: entry.accountReferenceId,
        productName: entry.product?.productName ?? '',
        nickname: entry.accountNickname ?? '',
        lastFour: entry.lastFour ?? '',
        accountStatus: entry.accountStatus ?? '',
      }));
  }

  function toCardholder(card) {
    const eligibilities = card.eligibilities ?? {};
    return {
      cardReferenceId: card.cardReferenceId,
      name: card.cardEmbossedName ?? '',
      // cardNumber arrives masked, e.g. 515676xxxxxx7993.
      lastFour: (card.cardNumber ?? '').replace(/\D/g, '').slice(-4),
      role: card.cardHolderRole ?? '',
      network: card.cardNetworkType ?? '',
      locked: card.isCardLocked === true,
      // Capital One's own switches for what this cardholder's virtual numbers allow.
      // Absent means allowed; only an explicit false disables anything.
      can: {
        reveal: eligibilities.isUnmaskVNEligible !== false,
        lock: eligibilities.isLockUnlockVNEligible !== false,
        rename: eligibilities.isRenameBVCNEligible !== false,
        delete: eligibilities.isDeleteBVCNEligible !== false,
        create: eligibilities.isCreateBoundVNEligible !== false,
      },
    };
  }

  // Every physical card on the account with its cardholder name, masked number and
  // eligibilities. One call supplies the cardholder labels and the per-card last four
  // that updates need.
  async function listCardholders({ arid }) {
    const data = await request(`/web-api/private/${homeRoute}/vc-bff/home/get-initial-data`, {
      method: 'POST',
      route: 'vc/virtual-cards/home',
      // The page also sends merchantRecommendationsCard, which populates its "shop at"
      // suggestions. Omitted here because the panel does not use them.
      body: { accountReferenceId: arid },
    });
    return (data.cards ?? []).map(toCardholder);
  }

  // Capital One's UI sends the whole card object on every update, including the
  // physical card's name and last four, which the list response doesn't carry —
  // hence the per-account values the side panel asks for once.
  async function updateCard({ card, account, changes }) {
    if (!account?.cardName || !account?.cardLastFour) {
      // The panel fills these from the account lookup, so missing means that lookup
      // failed. There is no field to type them into any more.
      throw new ApiError('ACCOUNT_INCOMPLETE', 'Capital One did not report this account’s card name and last 4. Press Refresh and try again.');
    }
    await request(listPath, {
      method: 'PUT',
      route: 'vc/virtual-cards/manager/manage',
      body: {
        allowAuthorizations: !card.locked,
        cardLastFour: account.cardLastFour,
        cardName: account.cardName,
        cardReferenceId: card.cardReferenceId,
        isDeleted: false,
        mdxId: card.mdxId,
        mdxUrlId: card.mdxUrlId,
        tokenDuration: null,
        tokenLastFour: card.lastFour,
        tokenName: card.name,
        tokenReferenceId: card.tokenReferenceId,
        ...changes,
      },
    });
  }

  // False means Capital One wants a step-up (the text message) before it will hand
  // over card numbers. The extension never handles that itself: it sends you to
  // Capital One's own page, which opens its own tab for the code.
  async function isStepUpSatisfied() {
    const data = await request(`/web-api/private/${securityRoute}/edge/security/token?level=${encodeURIComponent(securityLevel)}`, {
      accept: 'application/json;v=1',
    });
    return data.appropriateLevel === true;
  }

  const pages = {
    manager: arid => `${origin}/vc/virtual-cards/manager?arid=${encodeURIComponent(arid)}`,
    // reveal=true opens the card with its number already shown (confirmed 2026-09-12).
    // Capital One's own UI only ever sends reveal=false.
    card: (arid, tokenReferenceId, reveal = false) =>
      `${origin}/vc/virtual-cards/manager/manage?tokenRef=${encodeURIComponent(tokenReferenceId)}&reveal=${reveal}&arid=${encodeURIComponent(arid)}`,
    create: arid => `${origin}/vc/create-virtual-card?arid=${encodeURIComponent(arid)}`,
  };

  globalThis.C1 = { listAccounts, listCards, listCardholders, updateCard, isStepUpSatisfied, pages, ApiError };
})();
