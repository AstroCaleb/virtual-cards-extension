// Numeric path segments from Capital One's API, read off DevTools → Network on the
// virtual card manager page. See docs/api-notes.md.
globalThis.C1_CONFIG = {
  origin: 'https://myaccounts.capitalone.com',

  // /web-api/private/<listRoute>/commerce-virtual-numbers — list, update
  listRoute: '25419',

  // /web-api/tiger/protected/<cardDataRoute>/commerce-virtual-numbers — create, reveal
  cardDataRoute: '222543',

  // /web-api/private/<securityRoute>/edge/security/token — step-up check
  securityRoute: '1594903',

  // /web-api/private/<homeRoute>/vc-bff/home/get-initial-data — cardholders and eligibilities
  homeRoute: '1151838',

  // /web-api/protected/<accountsRoute>/customer-accounts — accounts and product names
  accountsRoute: '636178',

  // The ?level= value on that step-up check.
  securityLevel: '3.1',
};
