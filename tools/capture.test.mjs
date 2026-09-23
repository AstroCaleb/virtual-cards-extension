// Exercises content/capture.js against sample screens, since shape-matching page text
// is the most fragile part of the extension. Uses published test card numbers only.
//
// Run: node tools/capture.test.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
];

let failures = 0;
for (const { name, input, expect } of cases) {
  const [message] = run(input);
  const got = message?.payload ?? null;
  const ok = expect === null ? got === null : got && ['number', 'expiry', 'cvv'].every(k => got[k] === expect[k]);
  if (!ok) {
    failures++;
    // Sample data, so printing it is fine.
    console.error(`✗ ${name}\n  expected ${JSON.stringify(expect)}\n  got      ${JSON.stringify(got)}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

console.log(failures ? `\n${failures} failing` : `\n${cases.length} passing`);
process.exit(failures ? 1 : 0);
