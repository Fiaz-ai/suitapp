/* test/ui-smoke.js — headless smoke test for the UI code paths.
   Uses a permissive fake DOM + in-memory IndexedDB so app.js/staff.js boot,
   login and view rendering run end-to-end WITHOUT a browser.
   This checks for runtime errors and gross logic failures — it does NOT
   validate pixels/layout. Run: node test/ui-smoke.js */
'use strict';
const path = require('path');

/* ---------- in-memory IndexedDB ---------- */
function fakeIDB() {
  const stores = new Map(); // name -> Map(id -> obj)
  function ensure(name) { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); }
  function store(name, mode) {
    const m = ensure(name);
    const q = { store: m, reqs: [] };
    const wrap = (p) => { const r = { onsuccess: null, onerror: null, result: undefined }; q.reqs.push(r); p.then(v => { r.result = v; if (r.onsuccess) r.onsuccess(); }); return r; };
    return {
      get: (id) => wrap(Promise.resolve(m.get(id) || undefined)),
      getAll: () => wrap(Promise.resolve(Array.from(m.values()))),
      put: (o) => wrap(Promise.resolve(m.set(o.id, o))),
      delete: (id) => wrap(Promise.resolve(m.delete(id))),
      clear: () => wrap(Promise.resolve(m.clear())),
      _raw: m
    };
  }
  const dbHandle = {
    createObjectStore: (name) => { ensure(name); return { createIndex: () => {} }; },
    objectStoreNames: { contains: () => true },
    objectStore: (name) => store(name),
    transaction: (name, mode) => {
      const tx = {};
      tx.objectStore = () => store(name, mode);
      // Real IDB fires oncomplete after the request completes; emulate that.
      setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
      return tx;
    }
  };
  return {
    open: () => {
      const req = {};
      // Real IDB fires onsuccess with the db on the request target.
      setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: { result: dbHandle } }); }, 0);
      return req;
    },
    _stores: stores
  };
}

/* ---------- permissive fake DOM ---------- */
const _stubs = new Map();
function stub(sel) {
  if (!_stubs.has(sel)) {
    const s = {
      _sel: sel, innerHTML: '', value: '', checked: false, textContent: '', className: '',
      style: {}, files: [], listeners: {}, children: [],
      classList: { _set: new Set(), add(c){this._set.add(c);}, remove(c){this._set.delete(c);}, toggle(c,f){f?this._set.add(c):this._set.delete(c);}, contains(c){return this._set.has(c);} },
      addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
      removeEventListener() {}, appendChild() {}, remove() {}, click() { (this.listeners.click||[]).forEach(fn=>fn({target:this,stopPropagation(){},preventDefault(){}})); },
      setAttribute() {}, getAttribute(n) { return this._attr && this._attr[n] != null ? this._attr[n] : null; },
      querySelector(sel2) { return stub(sel2); },
      querySelectorAll() { return []; },
      focus() {}, close() {}
    };
    _stubs.set(sel, s);
  }
  return _stubs.get(sel);
}
function fire(sel, ev) {
  const targets = [stub(sel)];
  const sm = smart(sel); // cached; may be the same as the querySelectorAll result
  if (targets.indexOf(sm) === -1) targets.push(sm);
  targets.forEach(s => (s.listeners[ev] || []).forEach(fn => fn({ target: s, stopPropagation(){}, preventDefault(){}, getAttribute: s.getAttribute })));
  return stub(sel);
}

/* Smart stub for elements generated via innerHTML (querySelectorAll can't see
   them in this shim). Cached per selector so fire() hits the same instance.
   Returns plausible attribute values per selector type. */
const _smartCache = new Map();
function smart(sel) {
  if (_smartCache.has(sel)) return _smartCache.get(sel);
  const s = {
    _sel: sel, value: '40', checked: true, textContent: '', className: '', style: {}, files: [], listeners: {},
    classList: { _set: new Set(), add(c){this._set.add(c);}, remove(c){this._set.delete(c);}, toggle(c,f){f?this._set.add(c):this._set.delete(c);}, contains(c){return this._set.has(c);} },
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    removeEventListener() {}, appendChild() {}, remove() {}, focus() {},
    click() { (this.listeners.click||[]).forEach(fn=>fn({target:this,stopPropagation(){},preventDefault(){}})); },
    setAttribute() {},
    getAttribute(n) {
      const map = { 'data-gid':'g-shk','data-cat':'men','data-tab':'customer','data-id':'o-1','data-m':'progress','data-sid':'s-def','data-fid':'f-wash','data-pid':'p-1','data-fkey':'chest','data-pin':'u-owner','data-del':'u-owner','data-fi':'0','data-fk':'key','data-remove':'0','data-day':'1' };
      return map[n] || null;
    },
    querySelector(q2) { return smart(q2); }, querySelectorAll() { return []; }
  };
  _smartCache.set(sel, s);
  return s;
}

global.indexedDB = fakeIDB();
global.window = {
  addEventListener: () => {}, scrollTo: () => {}, Core: null, DB: null, I18N: null,
  indexedDB: global.indexedDB,
  open: () => ({ document: { write: () => {}, close: () => {}, focus: () => {} }, focus: () => {}, print: () => {} })
};
global.document = {
  documentElement: { lang: 'en', dir: 'ltr' },
  body: { appendChild() {} },
  querySelector: (s) => {
    // selectors with child/attr structure target innerHTML-generated elements
    if (s.indexOf(' ') !== -1 || s.indexOf('[') !== -1) return smart(s);
    return stub(s);
  },
  querySelectorAll: (s) => {
    if (s === '.overlay') return [];
    if (s.indexOf(' ') !== -1 || s.indexOf('[') !== -1) return [smart(s)];
    return [];
  },
  createElement: (tag) => tag === 'template' ? { content: { firstElementChild: stub('tpl') } } : stub('el:' + tag),
  addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') global.__domReady = fn; },
  write: () => {}, close: () => {}, focus: () => {}
};
global.localStorage = { _d: {}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
Object.defineProperty(global, 'navigator', { value: { clipboard: { writeText: () => Promise.resolve() } }, configurable: true });
global.confirm = () => true;
global.Blob = class { constructor(){ this._b=''; } };
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
global.FileReader = class { readAsText(){ if (this.onload) this.onload({ target: { result: '{}' } }); } };

/* ---------- load app modules ---------- */
const Core = require('../js/core.js');
global.window.Core = Core; global.Core = Core;
global.window.I18N = require('../js/i18n.js');
global.window.DB = require('../js/db.js');
require('../js/app.js');
require('../js/staff.js');
const App = global.window.App;

let passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ ' + m); } }

(async () => {
  try {
    console.log('\n== Boot (first run) ==');
    await global.__domReady();       // fires DOMContentLoaded -> boot()
    await new Promise(r => setTimeout(r, 300)); // boot -> register view (0 shops)
    const view = stub('#view');
    ok(typeof view.innerHTML === 'string', 'boot rendered into #view');
    ok(view.innerHTML.indexOf('IIK') !== -1, 'register view shows the IIK brand on first run');

    console.log('\n== Register demo shop + owner login ==');
    const demo = await global.window.DB.registerDemo();
    App.session = { userId: demo.owner.id, role: 'owner', name: demo.owner.name, shopId: demo.shopId };
    App.saveSession();
    App.navigate('dashboard');
    await new Promise(r => setTimeout(r, 100));
    ok(App.session && App.session.role === 'owner', 'owner logged in via shop registration');
    ok(stub('#view').innerHTML.indexOf('Dashboard') !== -1 || stub('#view').innerHTML.indexOf('ڈیش') !== -1, 'dashboard rendered');

    console.log('\n== Register a second shop (multi-brand) ==');
    const demo2 = await global.window.DB.registerShop({ brandName: 'IIK Tailors', shopName: 'IIK Tailors Main', city: 'Karachi', phone: '0211112222', ownerName: 'Owner Two', ownerPhone: '03005557777', pin: '2222' });
    const shops = await global.window.DB.listShops();
    ok(shops.length === 2, 'two shops registered on device');
    // back to the demo shop (which has orders) for the remaining flows
    global.window.DB.setCurrentShop(demo.shopId);
    App.setShop(demo.shopId);
    App.session.shopId = demo.shopId; App.saveSession();

    console.log('\n== Navigate staff views ==');
    for (const v of ['customers', 'orders', 'catalog', 'reports', 'settings']) {
      try { App.navigate(v); await new Promise(r => setTimeout(r, 30)); ok(true, v + ' rendered without throwing'); }
      catch (e) { ok(false, v + ' threw: ' + e.message); }
    }
    ok(stub('#oList').innerHTML.indexOf('SK-DEMO001') !== -1, 'staff orders list shows demo order no');

    console.log('\n== Open an order (manage) ==');
    const orders = await App.loadAll('orders');
    ok(orders.length > 0, 'demo orders exist');
    App.navigate('order-manage', { id: orders[0].id });
    await new Promise(r => setTimeout(r, 30));
    ok(stub('#view').innerHTML.indexOf(orders[0].orderNo) !== -1, 'order manage shows order no');

    console.log('\n== Open a customer ==');
    const custs = await App.loadAll('customers');
    App.navigate('customer-detail', { id: custs[0].id });
    await new Promise(r => setTimeout(r, 30));
    ok(stub('#view').innerHTML.indexOf(custs[0].name) !== -1, 'customer detail shows name');

    console.log('\n== Customer signup + wizard ==');
    // logout owner, sign up a fresh customer
    App.session = null; App.saveSession();
    App.navigate('auth');
    fire('#toSignup', 'click'); // customer tab is the default
    stub('#su-name').value = 'Test Customer';
    stub('#su-phone').value = '03009998888';
    stub('#su-pass').value = 'pass1234';
    fire('#su-go', 'click');
    await new Promise(r => setTimeout(r, 500));
    ok(App.session && App.session.role === 'customer', 'customer signed up and logged in');

    App.navigate('home');
    ok(stub('#view').innerHTML.indexOf('Test Customer') !== -1, 'customer home greets by name');

    console.log('\n== Wizard: pick garment ==');
    App.navigate('order-wizard', { customerId: 'c-' + App.session.userId });
    await new Promise(r => setTimeout(r, 60));
    fire('#garList .card', 'click');
    await new Promise(r => setTimeout(r, 60));
    const stepHtml = stub('#view').innerHTML;
    ok(stepHtml.indexOf('Style') !== -1 && stepHtml.indexOf('Fabric') !== -1 ||
       stepHtml.indexOf('اسٹائل') !== -1, 'wizard advanced to style step');

    console.log('\n== Shop takes measurements → staff updates them ==');
    try {
      const DBm = global.window.DB;
      global.window.DB.setCurrentShop(demo.shopId);
      App.setShop(demo.shopId);
      // owner session (guard requires staff/owner)
      App.session = { userId: demo.owner.id, role: 'owner', name: demo.owner.name, shopId: demo.shopId };
      App.saveSession();
      // an order whose item needs the shop to measure
      const pending = {
        id: 'o-pend', orderNo: 'SK-PEND001', customerId: 'c-1',
        customerSnapshot: { name: 'Ahmed Raza', phone: '923001112222' },
        items: [{ id: 'oi-p', garmentId: 'g-shk', garmentName: { en: 'Shalwar Kameez', ur: 'شلوار قمیض' }, category: 'men', styleId: 's-def', styleName: { en: 'Standard', ur: 'معیاری' }, fabricId: 'f-wash', fabricName: { en: 'Wash & Wear (Winter)', ur: 'واش اینڈ ویئر' }, fabricSource: 'shop', fabricPrice: 2500, price: 4000, qty: 1, measurements: {}, profileId: null, note: '', needShopMeasure: true }],
        stage: 'new', assignedTo: '', tailorNotes: '', customerNotes: '',
        estPrice: 4000, finalPrice: 0, advance: 0, payments: [], requestedDate: null,
        promisedDate: '2026-11-30', issues: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), audit: [], demo: false
      };
      await DBm.put('orders', pending); App._dbCache = {};
      App.navigate('order-manage', { id: 'o-pend' });
      await new Promise(r => setTimeout(r, 60));
      ok(stub('#view').innerHTML.indexOf('pending at shop') !== -1 || stub('#view').innerHTML.indexOf('باقی') !== -1, 'order shows "measurements pending"');
      fire('[data-meas]', 'click');
      await new Promise(r => setTimeout(r, 40));
      fire('#mm-save', 'click');
      await new Promise(r => setTimeout(r, 80));
      const updated = await DBm.get('orders', 'o-pend');
      ok(updated.items[0].needShopMeasure === false, 'staff entry clears the pending flag');
      ok(Object.keys(updated.items[0].measurements || {}).length > 0, 'measurements recorded on the order item');
      const measRecs = await DBm.getAll('measurements');
      ok(measRecs.some(function (r) { return r.garmentId === 'g-shk' && r.measuredBy === 'Shop Owner'; }), 'append-only measurement record written');
    } catch (e) { ok(false, 'measurement flow threw: ' + e.message); }

    console.log('\n== Export/backup shape ==');
    const backup = await require('../js/db.js').exportAll();
    ok(backup.app === 'suitapp' && backup.data.orders.length > 0, 'backup JSON has app marker and orders');

  } catch (e) {
    failed++; console.error('  ✗ unexpected error: ' + (e && e.stack || e));
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
