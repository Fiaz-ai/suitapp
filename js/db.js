/* =====================================================================
   db.js — IndexedDB data layer (local-first, MULTI-SHOP).
   Each shop has its OWN database ("suitapp_db_<shopId>") so shops are fully
   isolated with no per-record shopId columns. A small shared registry DB
   ("suitapp_shops") lists the shops created on this device.
   Per-shop stores: settings, users, customers, profiles, measurements,
   garments, styles, fabrics, orders, fittings, audit, meta.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.DB = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SHOPS_DB = 'suitapp_shops';
  var DB_VERSION = 1;
  var STORES = [
    'settings', 'users', 'customers', 'profiles', 'measurements',
    'garments', 'styles', 'fabrics', 'orders', 'fittings', 'audit', 'meta'
  ];
  var SHOPS_STORES = ['shops', 'meta'];

  var currentShopId = 'default';          // shop whose DB is active
  var dbPromises = {};                    // shopId -> Promise<db>
  var shopsDbPromise = null;

  function dbNameFor(shopId) { return 'suitapp_db_' + shopId; }

  function openShops() {
    if (shopsDbPromise) return shopsDbPromise;
    shopsDbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(SHOPS_DB, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        SHOPS_STORES.forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        });
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
    return shopsDbPromise;
  }

  function txShops(storeName, mode, fn) {
    return openShops().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(storeName, mode || 'readonly');
        var store = t.objectStore(storeName);
        var result;
        try { result = fn(store); } catch (err) { reject(err); return; }
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('tx aborted')); };
      });
    });
  }

  function open() {
    if (dbPromises[currentShopId]) return dbPromises[currentShopId];
    dbPromises[currentShopId] = new Promise(function (resolve, reject) {
      var req = indexedDB.open(dbNameFor(currentShopId), DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        STORES.forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) {
            var os = db.createObjectStore(name, { keyPath: 'id' });
            if (name === 'customers') os.createIndex('phone', 'phone', { unique: false });
            if (name === 'orders') os.createIndex('orderNo', 'orderNo', { unique: false });
            if (name === 'orders') os.createIndex('customerId', 'customerId', { unique: false });
            if (name === 'measurements') os.createIndex('customerId', 'customerId', { unique: false });
            if (name === 'audit') os.createIndex('ts', 'ts', { unique: false });
          }
        });
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
    return dbPromises[currentShopId];
  }

  /* ---------------- current shop ---------------- */
  function setCurrentShop(shopId) {
    if (!shopId) return;
    currentShopId = shopId;
  }
  function getCurrentShop() { return currentShopId; }

  /* ---------------- shop registry ---------------- */
  function listShops() {
    return txShops('shops', 'readonly', function (s) { return s.getAll(); })
      .then(function (req) { return req.result || []; })
      .catch(function () { return []; });
  }
  function getShop(id) {
    return txShops('shops', 'readonly', function (s) { return s.get(id); })
      .then(function (req) { return req.result; })
      .catch(function () { return undefined; });
  }
  function putShop(shop) {
    return txShops('shops', 'readwrite', function (s) { return s.put(shop); });
  }
  function countShops() {
    return listShops().then(function (shops) { return shops.length; });
  }

  /* Register a brand + shop on this device. Creates the shop's own DB,
     its settings, the default catalog, and the owner account.
     Returns { shopId, owner }. */
  function registerShop(opts) {
    opts = opts || {};
    var shopId = 'shop-' + Core.uid();
    var now = new Date().toISOString();
    setCurrentShop(shopId);
    var settings = defaultSettings();
    settings.id = 'shop';
    settings.shopName = opts.shopName || 'My Tailors';
    settings.brandName = opts.brandName || settings.shopName;
    settings.shopCity = opts.city || '';
    settings.shopAddress = opts.address || '';
    settings.shopPhone = opts.phone || '';
    settings.jazzcashAccount = opts.jazzcash || '';
    settings.easypaisaAccount = opts.easypaisa || '';

    // owner PIN + a recovery key (both hashed). The recovery key lets the
    // owner reset a forgotten PIN offline; it is shown once at registration.
    var ownerPin = opts.pin || '1111';
    var recoveryKey = Core.genRecoveryKey();
    return Promise.all([Core.hashPassword(ownerPin, Core.randomSalt(16)), Core.hashPasswordNew(recoveryKey)])
      .then(function (r) {
        var ph = r[0];
        settings.recovery = r[1];
        var jobs = [
          put('settings', settings),
          bulkPut('garments', defaultGarments()),
          bulkPut('styles', defaultStyles()),
          bulkPut('fabrics', defaultFabrics()),
          putShop({ id: shopId, brandName: settings.brandName, shopName: settings.shopName, city: settings.shopCity, phone: settings.shopPhone, ownerName: opts.ownerName || '', createdAt: now }),
          put('meta', { id: 'registered', n: 1 })
        ];
        var owner = {
          id: 'u-' + Core.uid(), name: opts.ownerName || 'Owner', phone: Core.normalizePhone(opts.ownerPhone || '') || '',
          role: 'owner', active: true, shopId: shopId, pass: ph
        };
        return put('users', owner).then(function () {
          return Promise.all(jobs).then(function () { return { shopId: shopId, owner: owner, recoveryKey: recoveryKey }; });
        });
      });
  }

  /* Load the clearly-labelled demo shop + demo records into a fresh shop. */
  function registerDemo() {
    var shopId = 'shop-demo-' + Core.uid();
    setCurrentShop(shopId);
    return registerShop({
      shopName: 'Al-Madina Tailors (DEMO)', brandName: 'Al-Madina Tailors',
      city: 'Lahore', phone: '03001234567', ownerName: 'Shop Owner', ownerPhone: '03001234567', pin: '1111'
    }).then(function (res) {
      var now = new Date();
      var day = 86400000;
      var cust1 = { id: 'c-1', name: 'Ahmed Raza', phone: '923001112222', email: '', city: 'Lahore', address: 'House 12, Gulberg', language: 'ur', consentUpdates: true, active: true, createdAt: new Date(now - 40 * day).toISOString(), createdBy: 'demo' };
      var cust2 = { id: 'c-2', name: 'Bilal Khan', phone: '923225558888', email: '', city: 'Lahore', address: 'Street 4, Model Town', language: 'en', consentUpdates: true, active: true, createdAt: new Date(now - 30 * day).toISOString(), createdBy: 'demo' };
      var prof1 = { id: 'p-1', customerId: 'c-1', label: 'Me', ownerName: 'Ahmed Raza', ageOrDOB: '', createdAt: new Date(now - 35 * day).toISOString() };
      var prof2 = { id: 'p-2', customerId: 'c-1', label: 'Son', ownerName: 'Hassan Raza', ageOrDOB: '2016', createdAt: new Date(now - 35 * day).toISOString() };
      var meas1 = { id: 'm-1', profileId: 'p-1', customerId: 'c-1', date: new Date(now - 35 * day).toISOString(), garmentId: 'g-shk', values: { chest: '40', waist: '34', hip: '40', length: '42', shoulder: '17', sleeve: '24', neck: '15' }, notes: '', measuredBy: 'owner' };
      var order1 = {
        id: 'o-1', orderNo: 'SK-DEMO001', customerId: 'c-1',
        customerSnapshot: { name: 'Ahmed Raza', phone: '923001112222' },
        items: [{ id: 'oi-1', garmentId: 'g-shk', garmentName: { en: 'Shalwar Kameez', ur: 'شلوار قمیض' }, category: 'men', styleId: 's-def', styleName: { en: 'Standard', ur: 'معیاری' }, fabricId: 'f-wash', fabricName: { en: 'Wash & Wear (Winter)', ur: 'واش اینڈ ویئر' }, fabricSource: 'shop', fabricPrice: 2500, price: 4000, qty: 1, measurements: meas1.values, profileId: 'p-1', note: '' }],
        stage: 'stitching', assignedTo: 'Shop Owner', tailorNotes: 'Fabric ok. Sleeve 1" extra.', customerNotes: '',
        estPrice: 4000, finalPrice: 4000, advance: 2000,
        payments: [{ id: 'pay-1', amount: 2000, method: 'cash', date: new Date(now - 30 * day).toISOString(), note: 'Advance', by: 'Shop Owner' }],
        requestedDate: null, promisedDate: new Date(now - 2 * day).toISOString().slice(0, 10),
        issues: [], createdAt: new Date(now - 30 * day).toISOString(), updatedAt: new Date(now - 3 * day).toISOString(),
        audit: [], demo: true
      };
      var order2 = {
        id: 'o-2', orderNo: 'SK-DEMO002', customerId: 'c-2',
        customerSnapshot: { name: 'Bilal Khan', phone: '923225558888' },
        items: [{ id: 'oi-2', garmentId: 'g-suit', garmentName: { en: 'Suit (2-piece)', ur: 'سوٹ' }, category: 'men', styleId: 's-def', styleName: { en: 'Standard', ur: 'معیاری' }, fabricId: 'f-cotton', fabricName: { en: 'Cotton (Summer)', ur: 'کپاس' }, fabricSource: 'shop', fabricPrice: 1800, price: 9000, qty: 1, measurements: { chest: '42', waist: '36', hip: '43', length: '30', sleeve: '25' }, profileId: null, note: '' }],
        stage: 'ready', assignedTo: 'Shop Owner', tailorNotes: '', customerNotes: '',
        estPrice: 9000, finalPrice: 9000, advance: 4500,
        payments: [{ id: 'pay-2', amount: 4500, method: 'easypaisa', date: new Date(now - 12 * day).toISOString(), note: 'Advance', by: 'Shop Owner' }],
        requestedDate: null, promisedDate: new Date(now + 1 * day).toISOString().slice(0, 10),
        issues: [], createdAt: new Date(now - 12 * day).toISOString(), updatedAt: new Date(now - 1 * day).toISOString(),
        audit: [], demo: true
      };
      var fit1 = { id: 'fit-1', orderId: 'o-2', date: new Date(now - 3 * day).toISOString().slice(0, 10), kind: 'fitting', result: 'ok', missed: false, notes: 'Fitting done, minor sleeve adjust.', createdAt: new Date(now - 3 * day).toISOString() };
      var writes = [
        bulkPut('customers', [cust1, cust2]), bulkPut('profiles', [prof1, prof2]),
        bulkPut('measurements', [meas1]), bulkPut('orders', [order1, order2]), bulkPut('fittings', [fit1])
      ];
      return Promise.all(writes).then(function () {
        return { shopId: shopId, owner: res.owner, recoveryKey: res.recoveryKey };
      });
    });
  }

  function tx(storeName, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(storeName, mode || 'readonly');
        var store = t.objectStore(storeName);
        var result;
        try { result = fn(store); }
        catch (err) { reject(err); return; }
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('tx aborted')); };
      });
    });
  }

  function getAll(storeName) {
    return tx(storeName, 'readonly', function (s) { return s.getAll(); })
      .then(function (req) { return req.result; })
      .catch(function () { return []; });
  }

  function get(storeName, id) {
    return tx(storeName, 'readonly', function (s) { return s.get(id); })
      .then(function (req) { return req.result; });
  }

  function put(storeName, obj) {
    return tx(storeName, 'readwrite', function (s) { return s.put(obj); });
  }

  function del(storeName, id) {
    return tx(storeName, 'readwrite', function (s) { return s.delete(id); });
  }

  function bulkPut(storeName, arr) {
    if (!arr || !arr.length) return Promise.resolve();
    return tx(storeName, 'readwrite', function (s) {
      arr.forEach(function (o) { s.put(o); });
      return arr.length;
    });
  }

  function clear(storeName) {
    return tx(storeName, 'readwrite', function (s) { return s.clear(); });
  }

  function nextCounter(counterKey) {
    return tx('meta', 'readwrite', function (s) {
      return s.get(counterKey);
    }).then(function (rec) {
      var n = (rec && rec.n) || 0;
      n += 1;
      return put('meta', { id: counterKey, n: n }).then(function () { return n; });
    });
  }

  /* ---------------- Default settings ---------------- */

  function defaultSettings() {
    return {
      id: 'shop',
      brandName: '',
      shopName: 'Al-Madina Tailors',
      shopPhone: '0300 1234567',
      shopAddress: 'Main Bazaar, Lahore',
      shopCity: '',
      jazzcashAccount: '',
      easypaisaAccount: '',
      logo: null,
      workingDays: [1, 2, 3, 4, 5, 6],          // Mon-Sat (Fri off by default)
      estimateDays: 7,
      workloadDaysPerOrder: 0,
      dueSoonDays: 2,
      defaultAdvancePct: 50,
      orderPolicies: 'Delivery in 7-10 working days. 50% advance. Final price confirmed after measurements.',
      stages: [
        { key: 'new',            en: 'New',                 ur: 'نیا' },
        { key: 'confirmed',      en: 'Confirmed',           ur: 'تصدیق شدہ' },
        { key: 'measurements',   en: 'Measurements Check',  ur: 'ناپ چیک' },
        { key: 'cutting',        en: 'Cutting',             ur: 'کٹائی' },
        { key: 'stitching',      en: 'Stitching',           ur: 'سلائی' },
        { key: 'fitting',        en: 'Fitting / Alteration',ur: 'فٹنگ / ترمیم' },
        { key: 'ready',          en: 'Ready for Delivery',  ur: 'ڈیلیوری کے لیے تیار' },
        { key: 'delivered',      en: 'Delivered',           ur: 'ڈیلیور شدہ' },
        { key: 'closed',         en: 'Closed',              ur: 'بند' }
      ]
    };
  }

  function defaultGarments() {
    var M = 'men', C = 'children';
    return [
      { id: 'g-shk', category: M, nameEn: 'Shalwar Kameez', nameUr: 'شلوار قمیض', active: true, fields: [
        { key: 'chest',  labelEn: 'Chest',  labelUr: 'سینہ',  unit: 'in', required: true },
        { key: 'waist',  labelEn: 'Waist',  labelUr: 'کمر',   unit: 'in', required: true },
        { key: 'hip',    labelEn: 'Hip',    labelUr: 'کولہے', unit: 'in', required: true },
        { key: 'length', labelEn: 'Kurta length', labelUr: 'قمیض کی لمبائی', unit: 'in', required: true },
        { key: 'shoulder', labelEn: 'Shoulder', labelUr: 'کندھا', unit: 'in', required: true },
        { key: 'sleeve', labelEn: 'Sleeve', labelUr: 'آستین', unit: 'in', required: true },
        { key: 'neck',   labelEn: 'Neck',   labelUr: 'گلا',   unit: 'in', required: false }
      ]},
      { id: 'g-kurta', category: M, nameEn: 'Kurta', nameUr: 'کرتا', active: true, fields: [
        { key: 'chest',  labelEn: 'Chest',  labelUr: 'سینہ',  unit: 'in', required: true },
        { key: 'length', labelEn: 'Kurta length', labelUr: 'قمیض کی لمبائی', unit: 'in', required: true },
        { key: 'shoulder', labelEn: 'Shoulder', labelUr: 'کندھا', unit: 'in', required: true },
        { key: 'sleeve', labelEn: 'Sleeve', labelUr: 'آستین', unit: 'in', required: true }
      ]},
      { id: 'g-waistcoat', category: M, nameEn: 'Waistcoat', nameUr: 'واسکٹ', active: true, fields: [
        { key: 'chest',  labelEn: 'Chest',  labelUr: 'سینہ',  unit: 'in', required: true },
        { key: 'length', labelEn: 'Length', labelUr: 'لمبائی', unit: 'in', required: true },
        { key: 'shoulder', labelEn: 'Shoulder', labelUr: 'کندھا', unit: 'in', required: true }
      ]},
      { id: 'g-trouser', category: M, nameEn: 'Trousers', nameUr: 'پتلون', active: true, fields: [
        { key: 'waist', labelEn: 'Waist', labelUr: 'کمر', unit: 'in', required: true },
        { key: 'hip',   labelEn: 'Hip',   labelUr: 'کولہے', unit: 'in', required: true },
        { key: 'length', labelEn: 'Length', labelUr: 'لمبائی', unit: 'in', required: true }
      ]},
      { id: 'g-shirt', category: M, nameEn: 'Shirt', nameUr: 'شرٹ', active: true, fields: [
        { key: 'chest', labelEn: 'Chest', labelUr: 'سینہ', unit: 'in', required: true },
        { key: 'neck',  labelEn: 'Neck',  labelUr: 'گلا',  unit: 'in', required: true },
        { key: 'length', labelEn: 'Length', labelUr: 'لمبائی', unit: 'in', required: true },
        { key: 'sleeve', labelEn: 'Sleeve', labelUr: 'آستین', unit: 'in', required: true }
      ]},
      { id: 'g-suit', category: M, nameEn: 'Suit (2-piece)', nameUr: 'سوٹ', active: true, fields: [
        { key: 'chest', labelEn: 'Chest', labelUr: 'سینہ', unit: 'in', required: true },
        { key: 'waist', labelEn: 'Waist', labelUr: 'کمر', unit: 'in', required: true },
        { key: 'hip',   labelEn: 'Hip',   labelUr: 'کولہے', unit: 'in', required: true },
        { key: 'length', labelEn: 'Jacket length', labelUr: 'جیکٹ کی لمبائی', unit: 'in', required: true },
        { key: 'sleeve', labelEn: 'Sleeve', labelUr: 'آستین', unit: 'in', required: true }
      ]},
      { id: 'g-c-shk', category: C, nameEn: "Boys' Shalwar Kameez", nameUr: 'بچوں کی شلوار قمیض', active: true, fields: [
        { key: 'chest',  labelEn: 'Chest',  labelUr: 'سینہ',  unit: 'in', required: true },
        { key: 'length', labelEn: 'Kurta length', labelUr: 'قمیض کی لمبائی', unit: 'in', required: true },
        { key: 'sleeve', labelEn: 'Sleeve', labelUr: 'آستین', unit: 'in', required: true }
      ]},
      { id: 'g-c-kurta', category: C, nameEn: "Boys' Kurta", nameUr: 'بچوں کا کرتا', active: true, fields: [
        { key: 'chest',  labelEn: 'Chest',  labelUr: 'سینہ',  unit: 'in', required: true },
        { key: 'length', labelEn: 'Kurta length', labelUr: 'قمیض کی لمبائی', unit: 'in', required: true },
        { key: 'sleeve', labelEn: 'Sleeve', labelUr: 'آستین', unit: 'in', required: true }
      ]},
      { id: 'g-c-trouser', category: C, nameEn: "Boys' Trousers", nameUr: 'بچوں کی پتلون', active: true, fields: [
        { key: 'waist',  labelEn: 'Waist',  labelUr: 'کمر',  unit: 'in', required: true },
        { key: 'length', labelEn: 'Length', labelUr: 'لمبائی', unit: 'in', required: true }
      ]}
    ];
  }

  function defaultStyles() {
    return [
      { id: 's-def', garmentId: null, nameEn: 'Standard', nameUr: 'معیاری', priceExtra: 0, active: true },
      { id: 's-collar', garmentId: null, nameEn: 'Band Collar', nameUr: 'بینڈ کالر', priceExtra: 300, active: true },
      { id: 's-embroider', garmentId: null, nameEn: 'Embroidered', nameUr: 'کڑھائی', priceExtra: 1000, active: true }
    ];
  }

  function defaultFabrics() {
    return [
      { id: 'f-wash', nameEn: 'Wash & Wear (Winter)', nameUr: 'واش اینڈ ویئر', pricePerOrder: 2500, stock: 40, active: true },
      { id: 'f-cotton', nameEn: 'Cotton (Summer)', nameUr: 'کپاس', pricePerOrder: 1800, stock: 60, active: true },
      { id: 'f-latha', nameEn: 'Latha', nameUr: 'لٹھا', pricePerOrder: 1500, stock: 80, active: true }
    ];
  }

  /* ---------------- Demo / seed data ----------------
     Clearly labeled DEMO so the owner can explore before going live.
     Remove via Settings → Clear demo data. */
  function demoSeed() {
    var now = new Date();
    var day = 86400000;
    var settings = defaultSettings();
    settings.shopName = 'Al-Madina Tailors (DEMO)';

    var owner = {
      id: 'u-owner', name: 'Shop Owner', phone: '923001234567',
      role: 'owner', active: true,
      pass: { salt: 'demo', hash: 'demo' }
    };

    var c1 = { id: 'c-1', name: 'Ahmed Raza', phone: '923001112222', email: '', city: 'Lahore', address: 'House 12, Gulberg', language: 'ur', consentUpdates: true, active: true, createdAt: new Date(now - 40 * day).toISOString(), createdBy: 'demo' };
    var c2 = { id: 'c-2', name: 'Bilal Khan', phone: '923225558888', email: '', city: 'Lahore', address: 'Street 4, Model Town', language: 'en', consentUpdates: true, active: true, createdAt: new Date(now - 30 * day).toISOString(), createdBy: 'demo' };

    var p1 = { id: 'p-1', customerId: 'c-1', label: 'Me', ownerName: 'Ahmed Raza', ageOrDOB: '', createdAt: new Date(now - 35 * day).toISOString() };
    var p2 = { id: 'p-2', customerId: 'c-1', label: 'Son', ownerName: 'Hassan Raza', ageOrDOB: '2016', createdAt: new Date(now - 35 * day).toISOString() };

    var m1 = { id: 'm-1', profileId: 'p-1', customerId: 'c-1', date: new Date(now - 35 * day).toISOString(), garmentId: 'g-shk', values: { chest: '40', waist: '34', hip: '40', length: '42', shoulder: '17', sleeve: '24', neck: '15' }, notes: '', measuredBy: 'owner' };

    var o1 = {
      id: 'o-1', orderNo: 'SK-' + 'DEMO001', customerId: 'c-1',
      customerSnapshot: { name: 'Ahmed Raza', phone: '03001112222' },
      items: [{
        id: 'oi-1', garmentId: 'g-shk', garmentName: { en: 'Shalwar Kameez', ur: 'شلوار قمیض' },
        category: 'men', styleId: 's-def', styleName: { en: 'Standard', ur: 'معیاری' },
        fabricId: 'f-wash', fabricName: { en: 'Wash & Wear (Winter)', ur: 'واش اینڈ ویئر' },
        fabricSource: 'shop', fabricPrice: 2500, price: 4000, qty: 1,
        measurements: m1.values, profileId: 'p-1', note: ''
      }],
      stage: 'stitching', assignedTo: 'u-owner',
      tailorNotes: 'Fabric ok. Sleeve 1" extra.', customerNotes: '',
      estPrice: 4000, finalPrice: 4000,
      advance: 2000, payments: [{ id: 'pay-1', amount: 2000, method: 'cash', date: new Date(now - 30 * day).toISOString(), note: 'Advance', by: 'owner' }],
      requestedDate: null,
      promisedDate: new Date(now - 2 * day).toISOString().slice(0, 10),
      issues: [], createdAt: new Date(now - 30 * day).toISOString(), updatedAt: new Date(now - 3 * day).toISOString(),
      audit: [], demo: true
    };

    var o2 = {
      id: 'o-2', orderNo: 'SK-' + 'DEMO002', customerId: 'c-2',
      customerSnapshot: { name: 'Bilal Khan', phone: '03225558888' },
      items: [{
        id: 'oi-2', garmentId: 'g-suit', garmentName: { en: 'Suit (2-piece)', ur: 'سوٹ' },
        category: 'men', styleId: 's-def', styleName: { en: 'Standard', ur: 'معیاری' },
        fabricId: 'f-cotton', fabricName: { en: 'Cotton (Summer)', ur: 'کپاس' },
        fabricSource: 'shop', fabricPrice: 1800, price: 9000, qty: 1,
        measurements: { chest: '42', waist: '36', hip: '43', length: '30', sleeve: '25' }, profileId: null, note: ''
      }],
      stage: 'ready', assignedTo: 'u-owner',
      tailorNotes: '', customerNotes: '',
      estPrice: 9000, finalPrice: 9000,
      advance: 4500, payments: [{ id: 'pay-2', amount: 4500, method: 'cash', date: new Date(now - 12 * day).toISOString(), note: 'Advance', by: 'owner' }],
      requestedDate: null,
      promisedDate: new Date(now + 1 * day).toISOString().slice(0, 10),
      issues: [], createdAt: new Date(now - 12 * day).toISOString(), updatedAt: new Date(now - 1 * day).toISOString(),
      audit: [], demo: true
    };

    var fit1 = { id: 'fit-1', orderId: 'o-2', date: new Date(now - 3 * day).toISOString().slice(0, 10), kind: 'fitting', result: 'ok', missed: false, notes: 'Fitting done, minor sleeve adjust.', createdAt: new Date(now - 3 * day).toISOString() };

    return {
      settings: settings,
      users: [owner],
      customers: [c1, c2],
      profiles: [p1, p2],
      measurements: [m1],
      garments: defaultGarments(),
      styles: defaultStyles(),
      fabrics: defaultFabrics(),
      orders: [o1, o2],
      fittings: [fit1],
      audit: [],
      meta: []
    };
  }

  /* Clear demo records (customers/orders/etc.) from the CURRENT shop.
     Catalog and staff accounts are kept. */
  function clearDemo() {
    var jobs = [
      clear('customers'), clear('profiles'), clear('measurements'),
      clear('orders'), clear('fittings')
    ];
    // Drop the "(DEMO)" label so the shop name is clean after clearing.
    return Promise.all(jobs).then(function () {
      return get('settings', 'shop').then(function (s) {
        if (s && s.shopName) {
          s.shopName = s.shopName.replace(/\s*\(DEMO\)/i, '').trim() || 'My Tailors';
          if (s.brandName) s.brandName = s.brandName.replace(/\s*\(DEMO\)/i, '').trim();
          return put('settings', s);
        }
      });
    });
  }

  /* Wipe every shop's data and the shop registry on this device. */
  function wipeAll() {
    return listShops().then(function (shops) {
      var ids = shops.map(function (s) { return s.id; });
      ids.push(currentShopId);
      var steps = ids.map(function (shopId) {
        setCurrentShop(shopId);
        var jobs = STORES.map(function (name) { return clear(name); });
        return Promise.all(jobs);
      });
      return Promise.all(steps).then(function () {
        return txShops('shops', 'readwrite', function (s) { return s.clear(); }).then(function () { return txShops('meta', 'readwrite', function (s) { return s.clear(); }); });
      });
    });
  }

  /* ---------------- Backup / restore (current shop) ---------------- */

  function exportAll() {
    var out = { app: 'suitapp', version: 2, exportedAt: new Date().toISOString(), shopId: currentShopId, data: {} };
    var jobs = STORES.map(function (name) {
      return getAll(name).then(function (rows) { out.data[name] = rows; });
    });
    return Promise.all(jobs).then(function () { return out; });
  }

  function importAll(obj) {
    if (!obj || obj.app !== 'suitapp' || !obj.data) return Promise.reject(new Error('bad backup'));
    var jobs = STORES.map(function (name) {
      return clear(name).then(function () { return bulkPut(name, obj.data[name] || []); });
    });
    return Promise.all(jobs);
  }

  return {
    open: open, getAll: getAll, get: get, put: put, del: del,
    bulkPut: bulkPut, clear: clear, nextCounter: nextCounter,
    defaultSettings: defaultSettings, defaultGarments: defaultGarments,
    defaultStyles: defaultStyles, defaultFabrics: defaultFabrics,
    setCurrentShop: setCurrentShop, getCurrentShop: getCurrentShop,
    listShops: listShops, getShop: getShop, putShop: putShop, countShops: countShops,
    registerShop: registerShop, registerDemo: registerDemo,
    clearDemo: clearDemo, wipeAll: wipeAll,
    exportAll: exportAll, importAll: importAll
  };
});
