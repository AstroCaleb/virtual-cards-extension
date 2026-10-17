// Exercises content/capture.js against sample screens, since shape-matching page text
// is the most fragile part of the extension. Uses published test card numbers only.
//
// Run: node tools/capture.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'capture.js'), 'utf8');

// Runs capture.js in a stubbed page and returns whatever it tried to send.
function run({ innerText, pathname = '/vc/virtual-cards/manager/manage' }) {
  const sent = [];
  const context = {
    document: { documentElement: {}, body: { innerText } },
    location: { pathname },
    chrome: { runtime: { sendMessage: async message => void sent.push(message) } },
    MutationObserver: class {
      observe() {}
    },
    setTimeout,
    clearTimeout,
  };
  vm.runInContext(source, vm.createContext(context));
  return sent;
}

// Stands in for the rest of a page: enough text to put something out of reach of the card.
const FILLER = 'Rewards and recent activity for your account. '.repeat(6);

const cases = [
  {
    name: 'reveal screen, all on one line',
    input: { innerText: 'Virtual card number 4111 1111 1111 1111 Expiration 07/29 Security code 737' },
    expect: { number: '4111111111111111', expiry: '07/29', cvv: '737' },
  },
  {
    name: 'number split across elements, one per line',
    input: { innerText: 'Card number\n4111\n1111\n1111\n1111\nExpires\n07/29\nCVV\n737' },
    expect: { number: '4111111111111111', expiry: '07/29', cvv: '737' },
  },
  {
    name: 'create confirmation screen',
    input: { innerText: 'Virtual card created 5555 5555 5555 4444 Exp 12/28 Security code 123', pathname: '/vc/create-virtual-card' },
    expect: { number: '5555555555554444', expiry: '12/28', cvv: '123' },
  },
  {
    name: 'fifteen-digit card',
    input: { innerText: 'Card 3782 822463 10005 Expiration 01/30 Security code 1234' },
    expect: { number: '378282246310005', expiry: '01/30', cvv: '1234' },
  },
  {
    name: 'masked card sends nothing',
    input: { innerText: 'Virtual card •••• •••• •••• 1234 Expiration 07/29' },
    expect: null,
  },
  {
    name: 'card list page sends nothing even with a number present',
    input: { innerText: '4111 1111 1111 1111', pathname: '/vc/virtual-cards/manager' },
    expect: null,
  },
  {
    name: 'digits that fail the checksum send nothing',
    input: { innerText: 'Reference 1234 5678 9012 3456 Expiration 07/29' },
    expect: null,
  },
  {
    name: 'date just before the card does not beat the expiry after it',
    input: { innerText: 'Last used 09/26 Virtual card number 4111 1111 1111 1111 Expiration 07/29 Security code 737' },
    expect: { number: '4111111111111111', expiry: '07/29', cvv: '737' },
  },
  {
    name: 'date far from the card is not taken as its expiry',
    input: { innerText: `Virtual card number 4111 1111 1111 1111 Security code 737 ${FILLER} Offer ends 09/26` },
    expect: { number: '4111111111111111', expiry: '', cvv: '737' },
  },
  {
    name: 'checksum-valid number elsewhere on the page does not beat the card',
    input: { innerText: `Reference 4012 8888 8888 1881 ${FILLER} Virtual card number 4111 1111 1111 1111 Expiration 07/29 Security code 737` },
    expect: { number: '4111111111111111', expiry: '07/29', cvv: '737' },
  },
  {
    name: "one number never takes the next number's expiry",
    input: { innerText: 'Reference 4012 8888 8888 1881 Virtual card number 5555 5555 5555 4444 Exp 12/28 Security code 123' },
    expect: { number: '5555555555554444', expiry: '12/28', cvv: '123' },
  },
  {
    name: 'two numbers with no expiry near either send nothing',
    input: { innerText: 'Reference 4012 8888 8888 1881 Card 4111 1111 1111 1111' },
    expect: null,
  },
];

for (const { name, input, expect } of cases) {
  test(name, () => {
    const [message] = run(input);
    // Spread into this realm: the payload's prototype is the sandbox's own Object, which
    // a strict deepEqual would count as a difference. Sample data, so printing it is fine.
    const got = message ? { ...message.payload } : null;
    assert.deepEqual(got, expect);
  });
}
