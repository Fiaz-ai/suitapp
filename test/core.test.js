/* test/core.test.js — Node test harness for the pure domain logic.
   Run: node test/core.test.js  (zero dependencies; uses Node's built-in assert + crypto)
   These tests exercise the business rules without a browser. */
'use strict';
const assert = require('assert');
const Core = require('../js/core.js');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

console.log('\n== Order numbers ==');
{
  const d = new Date(2026, 10, 16); // 2026-11-16
  eq(Core.genOrderNo(d, 1), 'SK-20261116-001', 'per-day counter pads to 3 digits');
  eq(Core.genOrderNo(d, 42), 'SK-20261116-042', 'counter 42');
}

console.log('\n== Phone normalization ==');
{
  eq(Core.normalizePhone('0300 1234567'), '923001234567', 'leading 0 with space');
  eq(Core.normalizePhone('03001234567'), '923001234567', 'leading 0');
  eq(Core.normalizePhone('+923001234567'), '923001234567', 'with +92');
  eq(Core.normalizePhone('923001234567'), '923001234567', 'raw 92');
  ok(Core.normalizePhone('12345') === null, 'rejects short number');
  ok(Core.normalizePhone('123456789012') === null, 'rejects non-PK 12-digit');
  ok(Core.isValidPhone('03001112222'), 'valid phone true');
}

console.log('\n== Money ==');
{
  eq(Core.fmtPKR(12500), 'Rs. 12,500', 'formats with thousands separator');
  eq(Core.fmtPKR(0), 'Rs. 0', 'zero');
  eq(Core.fmtPKR(-500), '-Rs. 500', 'negative');
}

console.log('\n== Working days & delivery suggestion ==');
{
  const s = { workingDays: [1, 2, 3, 4, 5, 6], estimateDays: 7, workloadDaysPerOrder: 0 };
  const start = new Date(2026, 10, 16); // Monday
  const d = Core.suggestDeliveryDate(start, s, 0);
  ok(Core.isWorkingDay(d, s), 'suggested date is a working day');
  eq(Core.daysBetween(start, d), 8, '7 working days from Monday lands on 8 calendar days (skip Sun)');
  const s2 = { workingDays: [1, 2, 3, 4, 5, 6], estimateDays: 7, workloadDaysPerOrder: 5 };
  const d2 = Core.suggestDeliveryDate(start, s2, 5);
  ok(d2.getTime() > d.getTime(), 'workload pushes delivery later (workloadDaysPerOrder=5, 5 orders)');
}

console.log('\n== Order totals ==');
{
  const order = {
    items: [{ qty: 2, price: 4000 }],
    finalPrice: 0,
    payments: [{ amount: 2000 }, { amount: 1500 }]
  };
  const tt = Core.calcTotals(order);
  eq(tt.est, 8000, 'est = qty × price');
  eq(tt.final, 8000, 'final defaults to est when not set');
  eq(tt.paid, 3500, 'paid sums payments');
  eq(tt.balance, 4500, 'balance = final - paid');
  const order2 = { items: [{ qty: 1, price: 4000 }], finalPrice: 6000, payments: [{ amount: 6000 }] };
  eq(Core.calcTotals(order2).final, 6000, 'explicit final price wins');
}

console.log('\n== Status computation ==');
{
  const s = { stages: Core.DEFAULT_STAGES, dueSoonDays: 2 };
  const today = new Date(2026, 10, 16);
  const o = {
    stage: 'stitching',
    promisedDate: Core.toYMD(new Date(2026, 10, 14)), // overdue
    items: [{ qty: 1, price: 4000 }], finalPrice: 0, payments: [{ amount: 4000 }]
  };
  eq(Core.computeStatus(o, s, today).key, 'overdue', 'past promised date → overdue');
  o.promisedDate = Core.toYMD(new Date(2026, 10, 17));
  eq(Core.computeStatus(o, s, today).key, 'due_soon', 'within dueSoonDays → due_soon');
  o.promisedDate = Core.toYMD(new Date(2026, 11, 1));
  eq(Core.computeStatus(o, s, today).key, 'stitching', 'normal stage when not urgent');
  o.payments = [];
  eq(Core.computeStatus(o, s, today).key, 'unpaid', 'unpaid balance flagged');
}

console.log('\n== Stage transitions ==');
{
  const s = { stages: Core.DEFAULT_STAGES };
  eq(Core.nextStageKey('new', s), 'confirmed', 'new → confirmed');
  eq(Core.nextStageKey('closed', s), null, 'closed has no next');
  eq(Core.stageLabel('stitching', 'ur', s), 'سلائی', 'Urdu stage label');
}

console.log('\n== Measurement validation ==');
{
  const g = { fields: [{ key: 'chest', required: true }, { key: 'waist', required: false }] };
  eq(Core.validateMeasurements(g, { chest: '40', waist: '34' }).length, 0, 'valid measurements pass');
  eq(Core.validateMeasurements(g, { chest: '', waist: '' }).length, 1, 'missing required flagged');
  eq(Core.validateMeasurements(g, { chest: 'abc', waist: '' }).length, 1, 'non-numeric flagged');
}

console.log('\n== Sanitize ==');
{
  eq(Core.sanitize('<script>alert(1)</script>'), 'scriptalert(1)/script', 'strips angle brackets');
}

console.log('\n== Pure-JS SHA-256 (known-answer vectors) ==');
{
  eq(Core.sha256Hex(new Uint8Array(0)),
     'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
     'SHA-256("")');
  eq(Core.sha256Hex(new TextEncoder().encode('abc')),
     'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
     'SHA-256("abc")');
}

console.log('\n== Messages (English + Urdu) ==');
{
  const ctx = {
    shop: { shopName: 'Al-Madina', phone: '03001234567' },
    order: { orderNo: 'SK-20261116-001', promisedDate: '2026-11-23' },
    totals: { final: 4000, paid: 2000, balance: 2000 },
    customerName: 'Ahmed', stageLabel: 'Stitching', promisedLabel: '23 Nov 2026'
  };
  const en = Core.buildMessage('confirmation', ctx, 'en');
  ok(en.indexOf('SK-20261116-001') !== -1, 'confirmation includes order no (en)');
  ok(en.indexOf('Rs. 4,000') !== -1, 'confirmation includes total (en)');
  const ur = Core.buildMessage('ready', ctx, 'ur');
  ok(ur.indexOf('خوشخبری') !== -1, 'Urdu ready message uses Urdu greeting');
  const pm = Core.buildMessage('payment', ctx, 'en');
  ok(pm.indexOf('Balance: Rs. 2,000') !== -1, 'payment message shows balance');
}

console.log('\n== WhatsApp link ==');
{
  eq(Core.waLink('03001234567', 'hi'), 'https://wa.me/923001234567?text=hi', 'wa.me link normalized');
  ok(Core.waLink('', 'hi') === null, 'no link without valid phone');
}

console.log('\n== Password hashing (PBKDF2) ==');
(async () => {
  try {
    const pw = '1234';
    const hashed = await Core.hashPasswordNew(pw);
    ok(hashed.salt && hashed.hash && hashed.hash.length === 64, 'produces salt + 64-hex hash');
    ok(hashed.iter > 0, 'stores iteration count');
    ok(await Core.verifyPassword(pw, hashed.salt, hashed.hash, hashed.iter), 'correct password verifies');
    ok(!(await Core.verifyPassword('wrong', hashed.salt, hashed.hash, hashed.iter)), 'wrong password rejected');
    const hashed2 = await Core.hashPasswordNew(pw);
    ok(hashed2.salt !== hashed.salt, 'different salt per hash');
  } catch (e) {
    failed++; console.error('  ✗ password hashing error: ' + e.message);
  }

  console.log('\n== JS fallback PBKDF2 == WebCrypto PBKDF2 (same bytes) ==');
  try {
    const pw = 'demo-pin-1234', saltHex = Core.randomSalt(16), iters = 1000;
    // WebCrypto path (Node has crypto.subtle)
    const web = await Core.pbkdf2(pw, saltHex, iters, 256);
    // pure-JS fallback path (what the phone uses over http)
    const js = Core.pbkdf2JsHex(pw, saltHex, iters);
    eq(js, web, 'pure-JS PBKDF2 output is byte-identical to WebCrypto');
    // and a second password to guard against coincidence
    const js2 = Core.pbkdf2JsHex('other', saltHex, iters);
    ok(js2 !== web, 'different password gives different hash');
  } catch (e) {
    failed++; console.error('  ✗ fallback comparison error: ' + e.message);
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
