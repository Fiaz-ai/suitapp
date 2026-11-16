/* test/fallback.test.js — simulates the phone-over-plain-http condition:
   browsers disable crypto.subtle (Web Crypto) on non-HTTPS origins, so the
   app must fall back to pure-JS PBKDF2 for PIN/password hashing.
   Run: node test/fallback.test.js */
'use strict';
const assert = require('assert');

// Simulate insecure context: crypto exists (getRandomValues works) but subtle is absent.
Object.defineProperty(global, 'crypto', {
  value: { getRandomValues: function (arr) { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; } },
  configurable: true
});

const Core = require('../js/core.js');

let passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ ' + m); } }

(async () => {
  ok(Core.hasWebCrypto() === false, 'crypto.subtle absent (as on http)');
  try {
    const pw = '1234';
    const h = await Core.hashPasswordNew(pw);
    ok(h.salt && h.hash && h.hash.length === 64, 'hash produced without Web Crypto');
    ok(h.iter > 0, 'iteration count stored');
    ok(await Core.verifyPassword(pw, h.salt, h.hash, h.iter), 'login works via pure-JS fallback');
    ok(!(await Core.verifyPassword('bad', h.salt, h.hash, h.iter)), 'wrong PIN rejected');
    // round-trip with a non-ASCII password too
    const h2 = await Core.hashPasswordNew('پاکستان!123');
    ok(await Core.verifyPassword('پاکستان!123', h2.salt, h2.hash, h2.iter), 'Urdu password round-trips');
  } catch (e) {
    failed++; console.error('  ✗ error: ' + e.stack);
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
