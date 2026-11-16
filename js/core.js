/* =====================================================================
   core.js — Pure domain logic for the suit-stitching app.
   No DOM access, no IndexedDB: this file is browser- AND Node-testable.
   All business rules that need shop-specific configuration live here so
   they can be tuned without touching UI code.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.Core = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- IDs & counters ---------------- */

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 8);
  }

  function pad(n, len) {
    n = String(n);
    while (n.length < len) n = '0' + n;
    return n;
  }

  /* Order number: SK-YYYYMMDD-### (per-day counter). */
  function genOrderNo(date, countForDay) {
    var d = date || new Date();
    var y = d.getFullYear(), m = pad(d.getMonth() + 1, 2), dd = pad(d.getDate(), 2);
    return 'SK-' + y + m + dd + '-' + pad(countForDay, 3);
  }

  /* ---------------- Dates & working days ---------------- */

  function toYMD(d) {
    var t = new Date(d.getTime());
    return t.getFullYear() + '-' + pad(t.getMonth() + 1, 2) + '-' + pad(t.getDate(), 2);
  }

  function addDays(d, n) {
    var t = new Date(d.getTime());
    t.setDate(t.getDate() + n);
    return t;
  }

  function isWorkingDay(d, settings) {
    var wd = (settings && settings.workingDays) || [1,2,3,4,5,6]; // Mon-Sat default
    return wd.indexOf(d.getDay()) !== -1;
  }

  /* Suggest a delivery date: skip non-working days; workload pushes it out.
     estimateDays = base days per order (owner-configurable). */
  function suggestDeliveryDate(startDate, settings, ordersInProgress) {
    var s = settings || {};
    var base = (s.estimateDays && s.estimateDays > 0) ? s.estimateDays : 7;
    var workload = s.workloadDaysPerOrder || 0;
    var load = workload * (ordersInProgress || 0);
    var total = base + load;
    var d = startDate ? new Date(startDate.getTime()) : new Date();
    var guard = 0;
    while (total > 0 && guard < 400) {
      d = addDays(d, 1);
      if (isWorkingDay(d, s)) total--;
      guard++;
    }
    return d;
  }

  function daysBetween(a, b) {
    var ms = (b.getTime() - a.getTime());
    return Math.round(ms / 86400000);
  }

  function startOfDay(d) {
    var t = new Date(d.getTime());
    t.setHours(0, 0, 0, 0);
    return t;
  }

  /* ---------------- Money (PKR) ---------------- */

  function fmtPKR(n) {
    n = Number(n) || 0;
    var neg = n < 0; n = Math.abs(n);
    var s = Math.round(n).toString();
    var out = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + 'Rs. ' + out;
  }

  /* ---------------- Phone (Pakistan) ---------------- */

  /* Accepts: 03001234567, +923001234567, 923001234567, 3001234567.
     Returns normalized "92XXXXXXXXXX" (12 digits) or null. */
  function normalizePhone(raw) {
    if (!raw) return null;
    var s = String(raw).replace(/[^0-9]/g, '');
    if (s.length === 11 && s[0] === '0') s = '92' + s.slice(1);      // 03001234567
    else if (s.length === 10 && s[0] !== '0') s = '92' + s;          // 3001234567
    else if (s.length === 12 && s.slice(0, 2) === '92') { /* ok */ } // 923001234567
    else return null;
    if (s.length !== 12 || s.slice(0, 2) !== '92') return null;
    return s;
  }

  function isValidPhone(raw) { return normalizePhone(raw) !== null; }

  /* wa.me link (manual send — never automated). */
  function waLink(phone, text) {
    var p = normalizePhone(phone);
    if (!p) return null;
    return 'https://wa.me/' + p + (text ? '?text=' + encodeURIComponent(text) : '');
  }

  /* ---------------- Order totals & status ---------------- */

  function calcTotals(order) {
    var est = 0;
    (order.items || []).forEach(function (it) {
      est += (Number(it.qty) || 0) * (Number(it.price) || 0);
    });
    var finalP = Number(order.finalPrice) > 0 ? Number(order.finalPrice) : est;
    var paid = 0;
    (order.payments || []).forEach(function (p) { paid += Number(p.amount) || 0; });
    return {
      est: est,
      final: finalP,
      paid: paid,
      balance: finalP - paid
    };
  }

  function paymentTotal(order) {
    var paid = 0;
    (order.payments || []).forEach(function (p) { paid += Number(p.amount) || 0; });
    return paid;
  }

  /* Derived urgency from a stage key + dates. */
  function computeStatus(order, settings, today) {
    var s = settings || {};
    var stages = (s.stages && s.stages.length) ? s.stages : DEFAULT_STAGES;
    var stageIdx = stages.indexOf(order.stage);
    var done = order.stage === 'closed' || order.stage === 'delivered';
    var todayD = today || new Date();

    if (done) return { key: order.stage, urgent: false };

    var due = order.promisedDate ? new Date(order.promisedDate) : null;
    var overdue = false, dueSoon = false;
    if (due) {
      var diff = daysBetween(startOfDay(todayD), startOfDay(due));
      if (diff < 0) overdue = true;
      else if (diff <= (s.dueSoonDays || 2)) dueSoon = true;
    }
    var balance = calcTotals(order).balance;
    var unpaid = balance > 0;

    if (overdue) return { key: 'overdue', urgent: true, balance: balance };
    if (dueSoon) return { key: 'due_soon', urgent: true, balance: balance };
    if (unpaid) return { key: 'unpaid', urgent: true, balance: balance };
    return { key: order.stage, urgent: false, balance: balance };
  }

  var DEFAULT_STAGES = [
    { key: 'new',            en: 'New',                ur: 'نیا' },
    { key: 'confirmed',      en: 'Confirmed',          ur: 'تصدیق شدہ' },
    { key: 'measurements',   en: 'Measurements Check', ur: 'ناپ چیک' },
    { key: 'cutting',        en: 'Cutting',            ur: 'کٹائی' },
    { key: 'stitching',      en: 'Stitching',          ur: 'سلائی' },
    { key: 'fitting',        en: 'Fitting / Alteration', ur: 'فٹنگ / ترمیم' },
    { key: 'ready',          en: 'Ready for Delivery', ur: 'ڈیلیوری کے لیے تیار' },
    { key: 'delivered',      en: 'Delivered',          ur: 'ڈیلیور شدہ' },
    { key: 'closed',         en: 'Closed',             ur: 'بند' }
  ];

  function nextStageKey(stageKey, settings) {
    var stages = (settings && settings.stages && settings.stages.length)
      ? settings.stages : DEFAULT_STAGES;
    var keys = stages.map(function (s) { return s.key; });
    var i = keys.indexOf(stageKey);
    if (i === -1) return null;
    return keys[i + 1] || null;
  }

  function stageLabel(key, lang, settings) {
    var stages = (settings && settings.stages && settings.stages.length)
      ? settings.stages : DEFAULT_STAGES;
    for (var i = 0; i < stages.length; i++) {
      if (stages[i].key === key) return lang === 'ur' ? (stages[i].ur || stages[i].en) : stages[i].en;
    }
    return key;
  }

  /* ---------------- Validation ---------------- */

  function sanitize(str) {
    return String(str == null ? '' : str).replace(/[<>]/g, '').trim();
  }

  function validateMeasurements(garment, values) {
    var errors = [];
    if (!garment || !garment.fields) return errors;
    garment.fields.forEach(function (f) {
      var v = values ? values[f.key] : '';
      if (f.required && (v === undefined || v === null || String(v).trim() === '')) {
        errors.push(f.key);
      } else if (String(v).trim() !== '' && isNaN(Number(v))) {
        errors.push(f.key + ':numeric');
      }
    });
    return errors;
  }

  /* ---------------- Customer messages (Urdu/English) ---------------- */

  /* Builds a ready-to-copy WhatsApp/chat message. type in:
     confirmation, progress, fitting, ready, payment, received */
  function buildMessage(type, ctx, lang) {
    var L = lang === 'ur' ? UR : EN;
    var shop = ctx.shop || {};
    var o = ctx.order || {};
    var t = ctx.totals || {};
    var name = ctx.customerName || '';
    var orderNo = o.orderNo || '';
    var stage = ctx.stageLabel || '';
    var promised = o.promisedDate ? ctx.promisedLabel : '';
    var lines = [];

    function add(text) { if (text) lines.push(text); }
    function blank() { lines.push(''); }

    if (type === 'confirmation') {
      add(L.greet(name));
      add(L.thanks);
      blank();
      add(L.orderNo + orderNo);
      if (promised) add(L.promised + promised);
      if (t.balance > 0) { add(L.total + fmtPKR(t.final)); add(L.balance + fmtPKR(t.balance)); }
      blank();
      add(L.status + stage);
      add(shop.shopName ? shop.shopName : '');
      if (shop.phone) add(L.shopContact + shop.phone);
    } else if (type === 'progress') {
      add(L.greet(name));
      add(L.progressMsg);
      blank();
      add(L.orderNo + orderNo);
      add(L.status + stage);
      if (promised) add(L.promised + promised);
      blank();
      if (shop.shopName) add(shop.shopName);
      if (shop.phone) add(L.shopContact + shop.phone);
    } else if (type === 'fitting') {
      add(L.greet(name));
      add(L.fittingMsg);
      blank();
      add(L.orderNo + orderNo);
      if (ctx.fittingDate) add(L.fittingOn + ctx.fittingDate);
      add(L.shopContact + (shop.phone || ''));
    } else if (type === 'ready') {
      add(L.greet(name));
      add(L.readyMsg);
      blank();
      add(L.orderNo + orderNo);
      if (t.balance > 0) { add(L.balance + fmtPKR(t.balance)); add(L.payOnPickup); }
      add(L.shopContact + (shop.phone || ''));
    } else if (type === 'payment') {
      add(L.greet(name));
      add(L.paymentMsg);
      blank();
      add(L.orderNo + orderNo);
      add(L.balance + fmtPKR(t.balance));
      add(L.shopContact + (shop.phone || ''));
    } else if (type === 'received') {
      add(L.greet(name));
      add(L.receivedMsg);
      blank();
      add(L.orderNo + orderNo);
      add(L.amountPaid + fmtPKR(t.paid));
      if (t.balance > 0) add(L.remaining + fmtPKR(t.balance));
      else add(L.fullyPaid);
    }
    return lines.join('\n');
  }

  var EN = {
    greet: function (n) { return 'Salaam, ' + n + '!'; },
    thanks: 'Thank you for your order.',
    orderNo: 'Order No: ',
    promised: 'Expected delivery: ',
    total: 'Total: ',
    balance: 'Balance: ',
    status: 'Status: ',
    shopContact: 'Shop contact: ',
    progressMsg: 'Your order status has been updated.',
    fittingMsg: 'Please come for your fitting/alteration appointment.',
    fittingOn: 'Appointment: ',
    readyMsg: 'Good news! Your order is ready for delivery/pickup.',
    payOnPickup: 'Please pay the remaining balance on pickup.',
    paymentMsg: 'A payment is pending on your order.',
    receivedMsg: 'Payment received on your order. Thank you!',
    amountPaid: 'Amount paid: ',
    remaining: 'Remaining: ',
    fullyPaid: 'Your order is fully paid. Thank you!'
  };

  var UR = {
    greet: function (n) { return 'السلام علیکم، ' + n + '!'; },
    thanks: 'آپ کے آرڈر کا شکریہ۔',
    orderNo: 'آرڈر نمبر: ',
    promised: 'متوقع ڈیلیوری: ',
    total: 'کل: ',
    balance: 'باقی: ',
    status: 'حالت: ',
    shopContact: 'دکان کا رابطہ: ',
    progressMsg: 'آپ کے آرڈر کی حالت تبدیل ہو گئی ہے۔',
    fittingMsg: 'براہ کرم اپنی فٹنگ/ترمیم کے لیے تشریف لائیں۔',
    fittingOn: 'ملاقات: ',
    readyMsg: 'خوشخبری! آپ کا آرڈر ڈیلیوری کے لیے تیار ہے۔',
    payOnPickup: 'براہ کرم وصولی کے وقت باقی رقم ادا کریں۔',
    paymentMsg: 'آپ کے آرڈر پر ادائیگی باقی ہے۔',
    receivedMsg: 'آپ کے آرڈر کی ادائیگی موصول ہو گئی۔ شکریہ!',
    amountPaid: 'ادا شدہ: ',
    remaining: 'باقی: ',
    fullyPaid: 'آپ کا آرڈر مکمل ادا ہو گیا۔ شکریہ!'
  };

  /* ---------------- Password hashing (PBKDF2) ----------------
     Uses Web Crypto when available (HTTPS/localhost). Falls back to a
     pure-JS SHA-256/HMAC/PBKDF2 when crypto.subtle is missing — e.g. plain
     http on a phone, where browsers disable Web Crypto. Client-side only:
     acceptable for a local-first app; a server would use bcrypt server-side. */

  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    // fallback UTF-8 encoder (rare old browsers)
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    }
    return new Uint8Array(out);
  }

  function randomSalt(len) {
    len = len || 16;
    var bytes = new Uint8Array(len);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (var i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    return bytesToHex(bytes);
  }

  function bytesToHex(b) {
    var s = '';
    for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2);
    return s;
  }

  function hexToBytes(h) {
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }

  /* ---- pure-JS SHA-256 (FIPS 180-4) ---- */
  var K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256(bytes) {
    var len = bytes.length;
    var bitLenHi = Math.floor(len / 0x20000000);
    var bitLenLo = (len << 3) >>> 0;
    var total = (Math.ceil((len + 9) / 64)) * 64;
    var msg = new Uint8Array(total);
    msg.set(bytes);
    msg[len] = 0x80;
    var dv = new DataView(msg.buffer);
    dv.setUint32(total - 8, bitLenHi);
    dv.setUint32(total - 4, bitLenLo);
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var w = new Int32Array(64);
    var i, t;
    for (i = 0; i < total; i += 64) {
      for (t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t-15],7) ^ rotr(w[t-15],18) ^ (w[t-15] >>> 3);
        var s1 = rotr(w[t-2],17) ^ rotr(w[t-2],19) ^ (w[t-2] >>> 10);
        w[t] = (w[t-16] + s0 + w[t-7] + s1) >>> 0;
      }
      var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        var S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
      }
      H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
      H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
    }
    var out = new Uint8Array(32);
    var odv = new DataView(out.buffer);
    for (i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
    return out;
  }

  function concatBytes(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a); out.set(b, a.length);
    return out;
  }

  function hmacSha256(keyBytes, msgBytes) {
    var block = 64;
    var key = keyBytes.length > block ? sha256(keyBytes) : keyBytes;
    var ipad = new Uint8Array(block), opad = new Uint8Array(block);
    for (var i = 0; i < block; i++) {
      var kb = i < key.length ? key[i] : 0;
      ipad[i] = kb ^ 0x36; opad[i] = kb ^ 0x5c;
    }
    return sha256(concatBytes(opad, sha256(concatBytes(ipad, msgBytes))));
  }

  function pbkdf2Js(passwordBytes, saltBytes, iterations, keyLenBits) {
    var hLen = 32, dkLen = keyLenBits / 8;
    var numBlocks = Math.ceil(dkLen / hLen);
    var dk = new Uint8Array(numBlocks * hLen);
    var saltLen = saltBytes.length;
    for (var block = 1; block <= numBlocks; block++) {
      var sp = new Uint8Array(saltLen + 4);
      sp.set(saltBytes);
      new DataView(sp.buffer).setUint32(saltLen, block);
      var u = hmacSha256(passwordBytes, sp);
      var t = new Uint8Array(u);
      for (var it = 1; it < iterations; it++) {
        u = hmacSha256(passwordBytes, u);
        for (var x = 0; x < hLen; x++) t[x] ^= u[x];
      }
      dk.set(t, (block - 1) * hLen);
    }
    return dk.slice(0, dkLen);
  }

  function hasWebCrypto() {
    return !!(typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.importKey === 'function');
  }

  function pbkdf2(password, saltHex, iterations, keyLenBits) {
    iterations = iterations || 100000;
    keyLenBits = keyLenBits || 256;
    var pw = utf8Bytes(password);
    var salt = hexToBytes(saltHex);
    if (hasWebCrypto()) {
      return crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits'])
        .then(function (key) {
          return crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
            key, keyLenBits);
        })
        .then(function (bits) { return bytesToHex(new Uint8Array(bits)); });
    }
    // pure-JS fallback (http / older browsers): fewer iterations for speed
    return Promise.resolve(bytesToHex(pbkdf2Js(pw, salt, iterations, keyLenBits)));
  }

  function hashPassword(password, saltHex, iterations) {
    var iter = iterations || (hasWebCrypto() ? 100000 : 30000);
    return pbkdf2(password, saltHex, iter).then(function (h) {
      return { salt: saltHex, hash: h, iter: iter };
    });
  }

  function hashPasswordNew(password) {
    var salt = randomSalt(16);
    return hashPassword(password, salt);
  }

  function verifyPassword(password, saltHex, hashHex, iterations) {
    var iter = iterations || 100000;
    return pbkdf2(password, saltHex, iter).then(function (h) { return h === hashHex; });
  }

  /* ---------------- Exports ---------------- */
  return {
    uid: uid, pad: pad, genOrderNo: genOrderNo,
    toYMD: toYMD, addDays: addDays, isWorkingDay: isWorkingDay,
    suggestDeliveryDate: suggestDeliveryDate, daysBetween: daysBetween, startOfDay: startOfDay,
    fmtPKR: fmtPKR, normalizePhone: normalizePhone, isValidPhone: isValidPhone, waLink: waLink,
    calcTotals: calcTotals, paymentTotal: paymentTotal, computeStatus: computeStatus,
    DEFAULT_STAGES: DEFAULT_STAGES, nextStageKey: nextStageKey, stageLabel: stageLabel,
    sanitize: sanitize, validateMeasurements: validateMeasurements, buildMessage: buildMessage,
    hashPasswordNew: hashPasswordNew, hashPassword: hashPassword, verifyPassword: verifyPassword,
    randomSalt: randomSalt, pbkdf2: pbkdf2,
    hasWebCrypto: hasWebCrypto, sha256Hex: function (b) { return bytesToHex(sha256(b)); },
    pbkdf2JsHex: function (pw, saltHex, iter) { return bytesToHex(pbkdf2Js(utf8Bytes(pw), hexToBytes(saltHex), iter || 1, 256)); }
  };
});
