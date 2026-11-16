/* =====================================================================
   app.js — Boot, router, auth, customer experience, order wizard.
   Global App object; staff.js extends it with staff views.
   ===================================================================== */
(function () {
  'use strict';

  var Core = window.Core, DB = window.DB, I18N = window.I18N;
  var App = window.App = { views: {}, state: {}, _dbCache: {} };

  /* ---------------- tiny DOM helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  App.$ = $; App.$all = $all; App.el = el; App.esc = esc;

  /* ---------------- state & persistence ---------------- */
  App.lang = 'en';
  App.session = null; // { userId, role, name }

  function loadSession() {
    try {
      var s = localStorage.getItem('suitapp_session');
      if (s) App.session = JSON.parse(s);
      var l = localStorage.getItem('suitapp_lang');
      if (l === 'ur' || l === 'en') App.lang = l;
    } catch (e) {}
  }
  function saveSession() {
    try {
      if (App.session) localStorage.setItem('suitapp_session', JSON.stringify(App.session));
      else localStorage.removeItem('suitapp_session');
      localStorage.setItem('suitapp_lang', App.lang);
    } catch (e) {}
  }
  App.saveSession = saveSession;

  function t(key) {
    var d = I18N[App.lang] || I18N.en;
    return d[key] != null ? d[key] : (I18N.en[key] != null ? I18N.en[key] : key);
  }
  App.t = t;

  function setLang(l) { App.lang = l === 'ur' ? 'ur' : 'en'; document.documentElement.lang = App.lang; document.documentElement.dir = App.lang === 'ur' ? 'rtl' : 'ltr'; saveSession(); renderHeader(); }
  App.setLang = setLang;

  function money(n) { return Core.fmtPKR(n); }

  function fmtDate(v) {
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString(App.lang === 'ur' ? 'ur-PK' : 'en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function fmtDateTime(v) {
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString(App.lang === 'ur' ? 'ur-PK' : 'en-PK', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  App.fmtDate = fmtDate; App.fmtDateTime = fmtDateTime; App.money = money;

  /* ---------------- cached DB reads ---------------- */
  function loadAll(name) {
    if (App._dbCache[name]) return Promise.resolve(App._dbCache[name]);
    return DB.getAll(name).then(function (rows) { App._dbCache[name] = rows; return rows; });
  }
  function invalidate(name) {
    if (App._dbCache[name]) App._dbCache[name] = null;
    if (App._dbCache['settings']) App._dbCache['settings'] = null;
  }
  App.loadAll = loadAll; App.invalidate = invalidate;

  function getSettings() {
    return loadAll('settings').then(function (rows) {
      return rows[0] || DB.defaultSettings();
    });
  }
  App.getSettings = getSettings;

  function roleLabel(role) {
    var m = { owner: 'role_owner', manager: 'role_manager', staff: 'role_staff', tailor: 'role_tailor', customer: 'role_customer' };
    return t(m[role] || 'role_customer');
  }
  App.roleLabel = roleLabel;

  function can(role, action) {
    if (role === 'owner' || role === 'manager') return true;
    if (role === 'staff') return ['dashboard', 'customers', 'orders', 'catalog', 'reports', 'settings'].indexOf(action) !== -1;
    if (role === 'tailor') return ['dashboard', 'orders'].indexOf(action) !== -1;
    return false;
  }
  App.can = can;

  /* ---------------- toast & sheet ---------------- */
  var toastTimer = null;
  function toast(msg, type) {
    var elt = $('#toast');
    if (!elt) return;
    elt.textContent = msg;
    elt.className = 'show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { elt.className = ''; }, 2400);
  }
  App.toast = toast;

  function showSheet(html, opts) {
    opts = opts || {};
    closeSheet();
    var ov = el('<div class="overlay' + (opts.centered ? ' centered' : '') + '"><div class="sheet">' + html + '</div></div>');
    ov.addEventListener('click', function (e) { if (e.target === ov && !opts.sticky) closeSheet(); });
    document.body.appendChild(ov);
    return ov;
  }
  App.showSheet = showSheet;
  function closeSheet() {
    $all('.overlay').forEach(function (o) { o.remove(); });
  }
  App.closeSheet = closeSheet;

  /* ---------------- header / bottom nav ---------------- */
  function renderHeader() {
    var hdr = $('#topbar');
    if (!hdr) return;
    getSettings().then(function (s) {
      var name = s.brandName || s.shopName || 'IIK';
      hdr.innerHTML =
        '<span class="brand"><span class="name">' + esc(name) + '</span>' +
        '<span class="sub">' + esc(t('tagline')) + '</span></span>' +
        '<button class="icon-btn no-print" id="langBtn" title="' + esc(t('lang_label')) + '">' + esc(t('lang_label')) + '</button>' +
        (App.session ? '<button class="icon-btn no-print" id="logoutBtn" title="' + esc(t('sign_out')) + '">⏻</button>' : '');
      $('#langBtn').addEventListener('click', function () { setLang(App.lang === 'en' ? 'ur' : 'en'); });
      var lo = $('#logoutBtn');
      if (lo) lo.addEventListener('click', function () { logout(); });
    });
  }

  function navItems() {
    if (!App.session) return [];
    var role = App.session.role;
    if (role === 'customer') {
      return [
        { key: 'home', label: t('nav_home'), ic: '🏠' },
        { key: 'orders', label: t('nav_orders'), ic: '🧾' },
        { key: 'profile', label: t('nav_profile'), ic: '👤' }
      ];
    }
    return [
      { key: 'dashboard', label: t('nav_dashboard'), ic: '📊' },
      { key: 'customers', label: t('nav_customers'), ic: '👥' },
      { key: 'orders', label: t('nav_orders'), ic: '🧾' },
      { key: 'catalog', label: t('nav_catalog'), ic: '🧵' },
      { key: 'more', label: t('nav_more'), ic: '⋯' }
    ];
  }

  function renderNav() {
    var nav = $('#bottomnav');
    if (!nav) return;
    var items = navItems();
    nav.innerHTML = items.map(function (it) {
      return '<button data-nav="' + it.key + '" class="' + (App.state.view === it.key ? 'active' : '') + '"><span class="ic">' + it.ic + '</span>' + esc(it.label) + '</button>';
    }).join('');
    $all('#bottomnav button').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-nav');
        if (k === 'more') navigate('settings');
        else navigate(k);
      });
    });
  }

  /* ---------------- router ---------------- */
  function navigate(view, params) {
    App.state.view = view; App.state.params = params || {};
    saveSession();
    renderHeader(); renderNav();
    var main = $('#view');
    var fn = App.views[view];
    if (!fn) { main.innerHTML = '<div class="card center">' + esc(t('empty')) + '</div>'; return; }
    try {
      fn(main, App.state.params);
    } catch (e) {
      main.innerHTML = '<div class="card center">' + esc(t('loading_error')) + '<br><small>' + esc(e.message) + '</small></div>';
    }
    window.scrollTo(0, 0);
  }
  App.navigate = navigate;

  /* ---------------- auth ---------------- */
  function logout() {
    App.session = null; saveSession();
    navigate('auth');
  }
  App.logout = logout;

  function loginCustomer(user) {
    App.session = { userId: user.id, role: 'customer', name: user.name, shopId: user.shopId || App.state.authShopId || DB.getCurrentShop() };
    saveSession(); navigate('home');
  }

  App.views.auth = authView;

  function authView(root) {
    root.innerHTML =
      '<div class="hero"><h1>' + esc(t('app_name')) + '</h1><p>' + esc(t('tagline')) + '</p></div>' +
      '<div id="authShopSel"></div>' +
      '<div class="card"><div class="tabs">' +
      '<button class="active" data-tab="customer">' + esc(t('customer_login')) + '</button>' +
      '<button data-tab="staff">' + esc(t('staff_login')) + '</button>' +
      '</div><div id="authbody"></div></div>';

    App.ensureAuthShop().then(function () {
      return DB.listShops();
    }).then(function (shops) {
      var box = $('#authShopSel');
      if (!box) return;
      if (shops.length > 1) {
        box.innerHTML = '<div class="field"><label>' + esc(t('shop')) + '</label><select class="input" id="authShop">' +
          shops.map(function (sh) { return '<option value="' + sh.id + '"' + (sh.id === App.state.authShopId ? ' selected' : '') + '>' + esc(sh.brandName || sh.shopName) + '</option>'; }).join('') +
          '</select></div>';
        $('#authShop').addEventListener('change', function () {
          App.state.authShopId = this.value; DB.setCurrentShop(this.value);
        });
      } else {
        box.innerHTML = '<div class="banner info">' + esc(t('you_are_at')) + ' <strong>' + esc((shops[0] && (shops[0].brandName || shops[0].shopName)) || '') + '</strong></div>';
      }
    });

    function showTab(tab) {
      var body = $('#authbody');
      $all('.tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === tab); });
      if (tab === 'customer') customerAuth(body);
      else App.staffAuth(body);
    }
    $all('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
    });
    showTab('customer');
  }

  function customerAuth(root) {
    root.innerHTML =
      '<div class="row mb"><button class="btn sm" id="toLogin">' + esc(t('sign_in')) + '</button>' +
      '<button class="btn sm" id="toSignup">' + esc(t('sign_up')) + '</button>' +
      '<button class="btn sm" id="toLookup">' + esc(t('track_order')) + '</button></div>' +
      '<div id="authForm"></div>';

    $('#toLogin').addEventListener('click', function () { customerLoginForm(); });
    $('#toSignup').addEventListener('click', function () { customerSignupForm(); });
    $('#toLookup').addEventListener('click', function () { lookupForm(); });
    customerLoginForm();
  }

  function customerLoginForm() {
    $('#authForm').innerHTML =
      '<h2>' + esc(t('login_title')) + '</h2>' +
      '<div class="field"><label>' + esc(t('phone')) + '</label><input class="input" id="lg-phone" inputmode="tel" placeholder="' + esc(t('enter_phone')) + '"></div>' +
      '<div class="field"><label>' + esc(t('password')) + '</label><input class="input" id="lg-pass" type="password" placeholder="' + esc(t('enter_password')) + '"></div>' +
      '<div id="lg-err"></div>' +
      '<button class="btn primary block" id="lg-go">' + esc(t('sign_in')) + '</button>' +
      '<div class="center mt"><small>' + esc(t('no_account')) + '</small></div>';

    $('#lg-go').addEventListener('click', function () {
      var phone = Core.normalizePhone($('#lg-phone').value);
      if (!phone) { $('#lg-err').innerHTML = '<div class="alert-inline">' + esc(t('phone_invalid')) + '</div>'; return; }
      loadAll('users').then(function (users) {
        var u = users.find(function (x) { return x.role === 'customer' && Core.normalizePhone(x.phone) === phone; });
        if (!u || !u.pass) { $('#lg-err').innerHTML = '<div class="alert-inline">' + esc(t('wrong_credentials')) + '</div>'; return; }
        return Core.verifyPassword($('#lg-pass').value, u.pass.salt, u.pass.hash, u.pass.iter).then(function (ok) {
          if (!ok) { $('#lg-err').innerHTML = '<div class="alert-inline">' + esc(t('wrong_credentials')) + '</div>'; return; }
          if (u.shopId) DB.setCurrentShop(u.shopId);
          loginCustomer(u);
        });
      });
    });
  }

  function customerSignupForm() {
    $('#authForm').innerHTML =
      '<h2>' + esc(t('register_title')) + '</h2>' +
      '<div class="field"><label>' + esc(t('name')) + '</label><input class="input" id="su-name"></div>' +
      '<div class="field"><label>' + esc(t('phone')) + '</label><input class="input" id="su-phone" inputmode="tel" placeholder="' + esc(t('enter_phone')) + '"></div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>' + esc(t('city')) + '</label><input class="input" id="su-city"></div>' +
      '<div class="field"><label>' + esc(t('email')) + '</label><input class="input" id="su-email" type="email"></div></div>' +
      '<div class="field"><label>' + esc(t('address')) + '</label><input class="input" id="su-address"></div>' +
      '<div class="field"><label>' + esc(t('password')) + '</label><input class="input" id="su-pass" type="password"></div>' +
      '<div id="su-err"></div>' +
      '<button class="btn primary block" id="su-go">' + esc(t('sign_up')) + '</button>';

    $('#su-go').addEventListener('click', function () {
      var name = Core.sanitize($('#su-name').value);
      var phone = Core.normalizePhone($('#su-phone').value);
      var pass = $('#su-pass').value;
      if (!name) { $('#su-err').innerHTML = '<div class="alert-inline">' + esc(t('name_required')) + '</div>'; return; }
      if (!phone) { $('#su-err').innerHTML = '<div class="alert-inline">' + esc(t('phone_invalid')) + '</div>'; return; }
      if (pass.length < 4) { $('#su-err').innerHTML = '<div class="alert-inline">' + esc(t('password_short')) + '</div>'; return; }
      loadAll('users').then(function (users) {
        if (users.some(function (u) { return u.phone === phone && u.role === 'customer'; })) {
          $('#su-err').innerHTML = '<div class="alert-inline">' + esc(t('wrong_credentials')) + '</div>'; return;
        }
        Core.hashPasswordNew(pass).then(function (ph) {
          var shopId = (App.session && App.session.shopId) || App.state.authShopId || DB.getCurrentShop();
          if (shopId) DB.setCurrentShop(shopId);
          var id = Core.uid('u');
          var cust = {
            id: 'c-' + id, name: name, phone: phone,
            email: Core.sanitize($('#su-email').value), city: Core.sanitize($('#su-city').value),
            address: Core.sanitize($('#su-address').value), language: App.lang,
            consentUpdates: true, active: true, createdAt: new Date().toISOString(), createdBy: 'self'
          };
          var user = { id: id, name: name, phone: phone, role: 'customer', active: true, shopId: shopId || undefined, pass: ph };
          invalidate('users'); invalidate('customers');
          DB.bulkPut('users', [user]).then(function () {
            return DB.put('customers', cust).then(function () { return logAudit('customer', cust.id, 'created', '', cust.name, 'signup'); });
          }).then(function () { loginCustomer(user); });
        });
      });
    });
  }

  function lookupForm() {
    $('#authForm').innerHTML =
      '<h2>' + esc(t('lookup_title')) + '</h2><p class="muted">' + esc(t('lookup_sub')) + '</p>' +
      '<div class="field"><label>' + esc(t('order_no')) + '</label><input class="input mono" id="lk-no" placeholder="SK-20260101-001"></div>' +
      '<div class="field"><label>' + esc(t('phone')) + '</label><input class="input" id="lk-phone" inputmode="tel"></div>' +
      '<div id="lk-err"></div>' +
      '<button class="btn primary block" id="lk-go">' + esc(t('lookup_btn')) + '</button>';

    $('#lk-go').addEventListener('click', function () {
      var no = Core.sanitize($('#lk-no').value).toUpperCase();
      var phone = Core.normalizePhone($('#lk-phone').value);
      if (!phone) { $('#lk-err').innerHTML = '<div class="alert-inline">' + esc(t('phone_invalid')) + '</div>'; return; }
      loadAll('orders').then(function (orders) {
        var o = orders.find(function (x) { return x.orderNo === no && x.customerSnapshot && Core.normalizePhone(x.customerSnapshot.phone) === phone; });
        if (!o) { $('#lk-err').innerHTML = '<div class="alert-inline">' + esc(t('wrong_credentials')) + '</div>'; return; }
        var guest = { userId: 'guest-' + o.customerId, role: 'guest', name: o.customerSnapshot.name, guestOrder: o.id };
        App.session = guest; saveSession();
        navigate('order-detail', { id: o.id, guest: true });
      });
    });
  }

  /* ---------------- audit ---------------- */
  function logAudit(entity, entityId, field, oldVal, newVal, reason) {
    var e = {
      id: Core.uid('a'), ts: new Date().toISOString(),
      by: App.session ? (App.session.name + ' (' + App.session.role + ')') : 'system',
      entity: entity, entityId: entityId, field: field,
      old: oldVal == null ? '' : String(oldVal), new: newVal == null ? '' : String(newVal),
      reason: reason || ''
    };
    invalidate('audit');
    return DB.put('audit', e);
  }
  App.logAudit = logAudit;

  /* ================= CUSTOMER HOME ================= */
  App.views.home = function (root) {
    var me = App.session;
    if (me.role !== 'customer') { navigate('dashboard'); return; }
    DB.get('customers', 'c-' + me.userId).then(function (cust) {
      if (!cust) { navigate('dashboard'); return; }
      loadAll('orders').then(function (orders) {
        var mine = orders.filter(function (o) { return o.customerId === cust.id; })
          .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
        loadAll('profiles').then(function (profiles) {
          var myProfiles = profiles.filter(function (p) { return p.customerId === cust.id; });
          renderHome(root, cust, mine, myProfiles);
        });
      });
    });
  };

  function orderBadge(order) {
    return getSettings().then(function (s) {
      var st = Core.computeStatus(order, s);
      var cls = st.key === 'overdue' ? 'danger' : (st.urgent ? 'warn' : 'dark');
      var label = st.key === 'overdue' ? t('status_overdue') :
        st.key === 'due_soon' ? t('status_due_soon') :
        st.key === 'unpaid' ? t('status_unpaid') : Core.stageLabel(order.stage, App.lang, s);
      return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
    });
  }
  App.orderBadge = orderBadge;

  function renderHome(root, cust, orders, profiles) {
    root.innerHTML =
      '<div class="hero"><h1>' + esc(t('shop_hello')) + ' ' + esc(cust.name) + '</h1>' +
      '<p>' + esc(t('shop_welcome')) + ' ' + esc(t('app_name')) + '</p></div>' +
      '<div class="card tinted"><div class="row wrap">' +
      '<button class="btn accent" id="newOrderBtn">➕ ' + esc(t('new_order')) + '</button>' +
      '<button class="btn" id="trackBtn">🔎 ' + esc(t('track_order')) + '</button></div></div>' +
      '<div class="section-title">' + esc(t('recent_orders')) + '</div>' +
      '<div id="recentList"></div>';

    $('#newOrderBtn').addEventListener('click', function () { navigate('order-wizard', { customerId: cust.id }); });
    $('#trackBtn').addEventListener('click', function () { navigate('order-wizard', { customerId: cust.id }); });

    if (!orders.length) {
      $('#recentList').innerHTML = '<div class="card"><div class="empty"><div class="ic">🧵</div><p>' + esc(t('no_orders')) + '</p></div></div>';
    } else {
      $('#recentList').innerHTML = orders.slice(0, 5).map(function (o) {
        return '<div class="card tap" data-id="' + o.id + '"><div class="card-row"><div class="grow">' +
          '<div class="mono">' + esc(o.orderNo) + '</div>' +
          '<div class="muted">' + esc(fmtDate(o.createdAt)) + ' · ' + esc(money(Core.calcTotals(o).final)) + '</div></div>' +
          '<span id="badge-' + o.id + '"></span></div></div>';
      }).join('');
      $all('#recentList .card').forEach(function (c) {
        c.addEventListener('click', function () { navigate('order-detail', { id: c.getAttribute('data-id') }); });
        orderBadge(orders.find(function (o) { return o.id === c.getAttribute('data-id'); })).then(function (h) {
          var b = $('#badge-' + c.getAttribute('data-id')); if (b) b.innerHTML = h;
        });
      });
    }
  }

  /* ================= ORDER WIZARD ================= */
  var wizard = null; // working state

  App.views['order-wizard'] = function (root, params) {
    if (App.session.role !== 'customer') { navigate('dashboard'); return; }
    DB.get('customers', 'c-' + App.session.userId).then(function (cust) {
      if (!cust) { navigate('dashboard'); return; }
      wizard = { customer: cust, items: [], item: null, step: 1, useProfile: null, measurements: {}, fabricSource: 'shop', staffMode: false };
      root.innerHTML = '';
      renderWizard(root);
    });
  };

  function wizardStepHtml(step) {
    var steps = [['garment', 'step_garment'], ['style', 'step_style'], ['measure', 'step_measure'], ['review', 'step_review']];
    var idx = step - 1;
    var total = steps.length;
    return '<div class="card tinted"><div class="row"><div class="grow"><strong>' + esc(t('wizard_step', { n: step, total: total }).replace('{n}', step).replace('{total}', total)) + '</strong></div>' +
      '<span class="tag">' + esc(steps[idx][1] ? t(steps[idx][1]) : steps[idx][0]) + '</span></div>' +
      '<div class="progress-track mt"><div style="width:' + Math.round(step / total * 100) + '%"></div></div></div>';
  }

  function renderWizard(root) {
    var s = wizard.step;
    wizard._root = root;
    var sync = true;
    var inner = '';
    if (s === 1) inner = wizardGarmentStep();
    else if (s === 2) inner = wizardStyleStep();
    else if (s === 3) inner = wizardMeasureStep();
    else { sync = false; inner = '<div class="card center">' + esc(t('loading')) + '</div>'; }

    root.innerHTML = '<h2>' + esc(t('new_order')) + '</h2>' + wizardStepHtml(s) + '<div id="wizBody">' + inner + '</div>' +
      '<div class="btn-row mt"><button class="btn" id="wizBack">' + esc(t('back')) + '</button>' +
      '<button class="btn primary" id="wizNext">' + (s < 4 ? esc(t('next')) : esc(t('place_order'))) + '</button></div>';

    if (!sync) {
      wizardReviewStep().then(function (html) {
        var b = $('#wizBody'); if (b) b.innerHTML = html;
      }).catch(function () { var b = $('#wizBody'); if (b) b.innerHTML = '<div class="card center">' + esc(t('loading_error')) + '</div>'; });
    }

    $('#wizBack').addEventListener('click', function () {
      if (s === 1) { navigate('home'); return; }
      wizard.step--; renderWizard(root);
    });
    $('#wizNext').addEventListener('click', function () {
      if (s === 1) { wizard.step = 2; renderWizard(root); }
      else if (s === 2) { if (wizardStyleValidate()) { wizard.step = 3; renderWizard(root); } }
      else if (s === 3) {
        wizardMeasureValidate().then(function (ok) { if (ok) { wizard.step = 4; renderWizard(root); } });
      }
      else submitOrder(root);
    });
  }

  function wizardGarmentStep() {
    var body = '<div id="garPick"><div class="field"><label>' + esc(t('choose_garment')) + '</label>' +
      '<div class="chip-row" id="catChips">' +
      '<button class="chip selected" data-cat="men">' + esc(t('men_category')) + '</button>' +
      '<button class="chip" data-cat="children">' + esc(t('children_category')) + '</button></div></div>' +
      '<div id="garList" class="mt"></div></div>';
    // Render async
    setTimeout(function () {
      $all('#catChips .chip').forEach(function (c) {
        c.addEventListener('click', function () {
          $all('#catChips .chip').forEach(function (x) { x.classList.remove('selected'); });
          c.classList.add('selected');
          renderGarmentList(c.getAttribute('data-cat'));
        });
      });
      renderGarmentList('men');
    }, 0);
    return body;
  }

  function renderGarmentList(cat) {
    loadAll('garments').then(function (gs) {
      var list = gs.filter(function (g) { return g.category === cat && g.active !== false; });
      var box = $('#garList');
      if (!list.length) { box.innerHTML = '<div class="card"><div class="empty"><p>' + esc(t('no_garments')) + '</p></div></div>'; return; }
      box.innerHTML = list.map(function (g) {
        var name = App.lang === 'ur' && g.nameUr ? g.nameUr : g.nameEn;
        return '<div class="card tap" data-gid="' + g.id + '">' + esc(name) + '</div>';
      }).join('');
      $all('#garList .card').forEach(function (c) {
        c.addEventListener('click', function () {
          wizard.item = { garmentId: c.getAttribute('data-gid') };
          wizard.measurements = {}; wizard.useProfile = null; wizard.fabricSource = 'shop';
          wizard.step = 2;
          renderWizard(wizard._root);
        });
      });
    });
  }

  /* step 2: style & fabric for current item */
  function wizardStyleStep() {
    var gid = wizard.item.garmentId;
    var body = '<div id="styleBox" class="hidden"></div><div id="fabricBox" class="hidden"></div>';
    setTimeout(function () {
      loadAll('garments').then(function (gs) {
        var g = gs.find(function (x) { return x.id === gid; });
        loadAll('styles').then(function (styles) {
          var list = styles.filter(function (st) { return st.active !== false && (!st.garmentId || st.garmentId === gid || st.garmentId === null); });
          var box = $('#styleBox');
          box.classList.remove('hidden');
          box.innerHTML = '<div class="field"><label>' + esc(t('choose_style')) + '</label><div class="chip-row" id="styleChips">' +
            (list.length ? list.map(function (st) {
              var name = App.lang === 'ur' && st.nameUr ? st.nameUr : st.nameEn;
              var extra = st.priceExtra ? ' (+' + money(st.priceExtra) + ')' : '';
              return '<button class="chip" data-sid="' + st.id + '">' + esc(name) + extra + '</button>';
            }).join('') : '<span class="muted">' + esc(t('no_styles')) + '</span>') +
            '</div></div>';
          $all('#styleChips .chip').forEach(function (c) {
            c.addEventListener('click', function () {
              $all('#styleChips .chip').forEach(function (x) { x.classList.remove('selected'); });
              c.classList.add('selected');
              wizard.item.styleId = c.getAttribute('data-sid');
            });
          });
        });
        loadAll('fabrics').then(function (fab) {
          var list = fab.filter(function (f) { return f.active !== false; });
          var box = $('#fabricBox');
          box.classList.remove('hidden');
          box.innerHTML = '<div class="field"><label>' + esc(t('choose_fabric')) + '</label>' +
            '<div class="check"><input type="radio" name="fsrc" value="shop" checked id="fsrc-shop"><label for="fsrc-shop">' + esc(t('fabric_shop')) + '</label></div>' +
            '<div class="check"><input type="radio" name="fsrc" value="customer" id="fsrc-cust"><label for="fsrc-cust">' + esc(t('fabric_customer')) + '</label></div>' +
            '<div id="fabricPick" class="mt">' +
            (list.length ? '<div class="chip-row" id="fabricChips">' + list.map(function (f) {
              var name = App.lang === 'ur' && f.nameUr ? f.nameUr : f.nameEn;
              return '<button class="chip" data-fid="' + f.id + '">' + esc(name) + ' · ' + money(f.pricePerOrder) + '</button>';
            }).join('') + '</div>' : '<span class="muted">' + esc(t('no_fabrics')) + '</span>') +
            '</div></div>';
          $all('#fabricChips .chip').forEach(function (c) {
            c.addEventListener('click', function () {
              $all('#fabricChips .chip').forEach(function (x) { x.classList.remove('selected'); });
              c.classList.add('selected');
              wizard.item.fabricId = c.getAttribute('data-fid');
            });
          });
          $all('input[name=fsrc]').forEach(function (r) {
            r.addEventListener('change', function () {
              wizard.fabricSource = r.value;
              $('#fabricPick').classList.toggle('hidden', r.value === 'customer');
            });
          });
        });
      });
    }, 0);
    return body;
  }

  function wizardStyleValidate() {
    if (!wizard.item.styleId) { toast(t('select'), 'danger'); return false; }
    if (wizard.fabricSource === 'shop' && !wizard.item.fabricId) { toast(t('select_fabric'), 'danger'); return false; }
    return true;
  }

  /* step 3: measurements */
  function wizardMeasureStep() {
    var gid = wizard.item.garmentId;
    var body = '<div id="measBox" class="hidden"></div>';
    setTimeout(function () {
      loadAll('garments').then(function (gs) {
        var g = gs.find(function (x) { return x.id === gid; });
        loadAll('profiles').then(function (profiles) {
          var mine = profiles.filter(function (p) { return p.customerId === wizard.customer.id; });
          var box = $('#measBox');
          box.classList.remove('hidden');
          var profHtml = mine.length
            ? '<div class="field"><label>' + esc(t('use_profile')) + '</label><div class="chip-row" id="profChips">' +
              mine.map(function (p) { return '<button class="chip" data-pid="' + p.id + '">' + esc(p.label + (p.ownerName ? ' — ' + p.ownerName : '')) + '</button>'; }).join('') +
              '</div></div>' : '';
          var fieldsHtml = '<div class="field"><label>' + esc(t('garment_fields')) + '</label><div class="form-grid" id="measFields">' +
            (g.fields || []).map(function (f) {
              var lb = App.lang === 'ur' && f.labelUr ? f.labelUr : f.labelEn;
              return '<div class="field"><label>' + esc(lb) + (f.required ? ' <span class="req">*</span>' : '') + '</label>' +
                '<input class="input" data-fkey="' + esc(f.key) + '" inputmode="decimal" placeholder="' + esc(f.unit || 'in') + '"></div>';
            }).join('') + '</div></div>';
          box.innerHTML = profHtml +
            '<div class="card tinted"><strong>' + esc(t('measure_help')) + '</strong><div class="check"><input type="radio" name="mhelp" id="mh-self" checked><label for="mh-self">' + esc(t('measure_help_yes')) + '</label></div>' +
            '<div class="check"><input type="radio" name="mhelp" id="mh-shop"><label for="mh-shop">' + esc(t('measure_help_no')) + '</label></div>' +
            '<p class="hint">' + esc(t('mf_note')) + '</p></div>' +
            '<div id="measWrap">' + fieldsHtml + '</div>' +
            '<div class="banner info hidden" id="shopMeasureNote">' + esc(t('meas_at_shop')) + '</div>' +
            '<div class="field mt"><label>' + esc(t('design_note')) + '</label><textarea class="input" id="itemNote"></textarea></div>';

          // "I need the shop to measure" → hide the fields, no longer required
          function setMeasureHelp(v) {
            wizard.measureHelp = v;
            $('#measWrap').classList.toggle('hidden', v === 'shop');
            $('#shopMeasureNote').classList.toggle('hidden', v !== 'shop');
          }
          $('#mh-self').addEventListener('change', function () { setMeasureHelp('self'); });
          $('#mh-shop').addEventListener('change', function () { setMeasureHelp('shop'); });
          if (wizard.measureHelp === 'shop') setMeasureHelp('shop');

          $all('#profChips .chip').forEach(function (c) {
            c.addEventListener('click', function () {
              $all('#profChips .chip').forEach(function (x) { x.classList.remove('selected'); });
              c.classList.add('selected');
              wizard.useProfile = c.getAttribute('data-pid');
              loadAll('measurements').then(function (recs) {
                var rec = recs.filter(function (r) { return r.profileId === wizard.useProfile && r.garmentId === gid; })
                  .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); })[0];
                if (rec) {
                  wizard.measurements = rec.values || {};
                  $all('#measFields .input').forEach(function (inp) {
                    inp.value = wizard.measurements[inp.getAttribute('data-fkey')] || '';
                  });
                }
              });
            });
          });
        });
      });
    }, 0);
    return body;
  }

  function wizardMeasureValidate() {
    var gid = wizard.item.garmentId;
    wizard.item.note = Core.sanitize($('#itemNote').value);
    // shop will take the measurements → not required, marked pending
    if (wizard.measureHelp === 'shop') {
      wizard.measurements = {};
      wizard.item.needShopMeasure = true;
      return Promise.resolve(true);
    }
    wizard.item.needShopMeasure = false;
    return loadAll('garments').then(function (gs) {
      var g = gs.find(function (x) { return x.id === gid; });
      var vals = {};
      $all('#measFields .input').forEach(function (inp) {
        vals[inp.getAttribute('data-fkey')] = Core.sanitize(inp.value);
      });
      var errors = Core.validateMeasurements(g, vals);
      if (errors.length) { toast(t('all_required'), 'danger'); return false; }
      wizard.measurements = vals;
      return true;
    });
  }

  /* step 4: review */
  function wizardReviewStep() {
    var it = wizard.item;
    return loadAll('garments').then(function (gs) {
      var g = gs.find(function (x) { return x.id === it.garmentId; });
      return loadAll('styles').then(function (stl) {
        var st = stl.find(function (x) { return x.id === it.styleId; });
        return loadAll('fabrics').then(function (fab) {
          var f = fab.find(function (x) { return x.id === it.fabricId; });
          return getSettings().then(function (s) {
            var fabricPrice = wizard.fabricSource === 'shop' && f ? Number(f.pricePerOrder) || 0 : 0;
            var base = Number(s.basePriceByGarment && s.basePriceByGarment[it.garmentId]) || 3500;
            var price = base + (st ? Number(st.priceExtra) || 0 : 0) + fabricPrice;
            var name = App.lang === 'ur' && g.nameUr ? g.nameUr : g.nameEn;
            var sn = st && (App.lang === 'ur' && st.nameUr ? st.nameUr : st.nameEn) || '';
            var fn = f && (App.lang === 'ur' && f.nameUr ? f.nameUr : f.nameEn) || '';
            wizard.item.price = price;
            wizard.item.garmentName = { en: g.nameEn, ur: g.nameUr };
            wizard.item.category = g.category;
            wizard.item.styleName = st ? { en: st.nameEn, ur: st.nameUr } : null;
            wizard.item.fabricName = f ? { en: f.nameEn, ur: f.nameUr } : null;
            wizard.item.fabricPrice = fabricPrice;
            return '<div class="card"><div class="section-title" style="margin-top:0">' + esc(t('review_summary')) + '</div>' +
              '<div class="kv"><span class="k">' + esc(t('garment')) + '</span><span class="v">' + esc(name) + '</span></div>' +
              '<div class="kv"><span class="k">' + esc(t('style')) + '</span><span class="v">' + esc(sn || '—') + '</span></div>' +
              '<div class="kv"><span class="k">' + esc(t('fabric')) + '</span><span class="v">' + esc(fn || '—') + '</span></div>' +
              '<div class="kv"><span class="k">' + esc(t('est_price')) + '</span><span class="v price-line">' + money(price) + '</span></div>' +
              '<div class="kv"><span class="k">' + esc(t('delivery_est')) + '</span><span class="v">' + esc(fmtDate(Core.suggestDeliveryDate(new Date(), s, 0))) + '</span></div></div>' +
              '<div class="card"><h3>' + esc(t('terms')) + '</h3><p class="muted">' + esc(s.orderPolicies || '') + '</p></div>';
          });
        });
      });
    });
  }

  function submitOrder(root) {
    var it = wizard.item;
    var s = null;
    getSettings().then(function (st) {
      s = st;
      var today = new Date();
      var ymd = Core.toYMD(today).replace(/-/g, '');
      return DB.nextCounter('order_' + ymd);
    }).then(function (n) {
      var today = new Date();
      var orderNo = Core.genOrderNo(today, n);
      var ordersInProgress = 0;
      // count in-progress orders for workload
      return loadAll('orders').then(function (orders) {
        ordersInProgress = orders.filter(function (o) { return o.stage !== 'delivered' && o.stage !== 'closed'; }).length;
        var promised = Core.toYMD(Core.suggestDeliveryDate(new Date(), s, ordersInProgress));
        var est = it.price;
        var adv = Math.round(est * ((s.defaultAdvancePct || 50) / 100));
        var order = {
          id: Core.uid('o'), orderNo: orderNo,
          customerId: wizard.customer.id,
          customerSnapshot: { name: wizard.customer.name, phone: wizard.customer.phone },
          items: [{
            id: Core.uid('oi'), garmentId: it.garmentId, garmentName: it.garmentName,
            category: it.category, styleId: it.styleId, styleName: it.styleName,
            fabricId: it.fabricId, fabricName: it.fabricName,
            fabricSource: wizard.fabricSource, fabricPrice: it.fabricPrice,
            price: it.price, qty: 1, measurements: wizard.measurements,
            profileId: wizard.useProfile, note: it.note || '',
            needShopMeasure: !!wizard.item.needShopMeasure
          }],
          stage: 'new', assignedTo: '', tailorNotes: '', customerNotes: '',
          estPrice: est, finalPrice: 0, advance: adv,
          payments: [], requestedDate: null, promisedDate: promised,
          issues: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          audit: [], demo: false
        };
        invalidate('orders');
        return DB.put('orders', order).then(function () {
          // save measurement record if entered manually
          if (!wizard.useProfile) {
            return ensureDefaultProfile(wizard.customer.id).then(function (profileId) {
              var rec = { id: Core.uid('m'), profileId: profileId, customerId: wizard.customer.id, date: new Date().toISOString(), garmentId: it.garmentId, values: wizard.measurements, notes: it.note || '', measuredBy: 'customer' };
              invalidate('measurements');
              return DB.put('measurements', rec);
            });
          }
          return Promise.resolve();
        }).then(function () {
          return logAudit('order', order.id, 'created', '', orderNo + ' · ' + money(est), 'customer');
        }).then(function () {
          wizard = null;
          orderPlacedView(root, order, adv);
        });
      });
    });
  }

  function ensureDefaultProfile(customerId) {
    return loadAll('profiles').then(function (profiles) {
      var p = profiles.find(function (x) { return x.customerId === customerId && x.label === 'Me'; });
      if (p) return p.id;
      p = { id: Core.uid('p'), customerId: customerId, label: 'Me', ownerName: '', ageOrDOB: '', createdAt: new Date().toISOString() };
      invalidate('profiles');
      return DB.put('profiles', p).then(function () { return p.id; });
    });
  }

  function orderPlacedView(root, order, adv) {
    var txt = Core.buildMessage('confirmation', {
      shop: { shopName: '', phone: '' }, order: order,
      totals: Core.calcTotals(order), customerName: order.customerSnapshot.name,
      stageLabel: Core.stageLabel(order.stage, App.lang), promisedLabel: fmtDate(order.promisedDate)
    }, App.lang);
    root.innerHTML =
      '<div class="card center" style="padding:34px 16px"><div style="font-size:3rem">🎉</div>' +
      '<h2>' + esc(t('order_placed')) + '</h2><p>' + esc(t('order_placed_sub')) + '</p>' +
      '<div class="mono" style="font-size:1.5rem;font-weight:800;color:var(--primary-2)">' + esc(order.orderNo) + '</div>' +
      '<p class="muted">' + esc(t('save_order_no')) + '</p>' +
      '<div class="btn-row mt"><button class="btn primary" id="goOrders">' + esc(t('my_orders')) + '</button>' +
      '<button class="btn" id="goHome">' + esc(t('nav_home')) + '</button></div>' +
      '<div class="divider"></div>' +
      '<div class="field"><label>' + esc(t('copy_message')) + '</label><textarea class="input ta-copy" id="confirmMsg">' + esc(txt) + '</textarea></div>' +
      '<div class="btn-row"><button class="btn" id="copyMsg">📋 ' + esc(t('copy_message')) + '</button></div></div>';
    $('#goOrders').addEventListener('click', function () { navigate('orders'); });
    $('#goHome').addEventListener('click', function () { navigate('home'); });
    $('#copyMsg').addEventListener('click', function () { copyText($('#confirmMsg').value); });
  }

  function copyText(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast(t('copied'), 'ok'); });
    else toast(t('copied'), 'ok');
  }
  App.copyText = copyText;

  /* ================= CUSTOMER ORDERS LIST ================= */
  App.views.orders = function (root) {
    if (!App.session) { navigate('auth'); return; }
    if (App.session.role !== 'customer') { staffOrdersView(root); return; }
    DB.get('customers', 'c-' + App.session.userId).then(function (cust) {
      loadAll('orders').then(function (orders) {
        var mine = orders.filter(function (o) { return o.customerId === cust.id; })
          .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
        root.innerHTML = '<h2>' + esc(t('my_orders')) + '</h2><div id="ordersList"></div>';
        if (!mine.length) {
          $('#ordersList').innerHTML = '<div class="card"><div class="empty"><div class="ic">🧾</div><p>' + esc(t('no_orders')) + '</p><button class="btn primary mt" id="goNew">' + esc(t('start_order')) + '</button></div></div>';
          $('#goNew').addEventListener('click', function () { navigate('order-wizard', { customerId: cust.id }); });
          return;
        }
        $('#ordersList').innerHTML = mine.map(function (o) {
          return '<div class="card tap" data-id="' + o.id + '"><div class="card-row"><div class="grow"><div class="mono">' + esc(o.orderNo) + '</div>' +
            '<div class="muted">' + esc(fmtDate(o.createdAt)) + ' · ' + esc(money(Core.calcTotals(o).final)) + '</div></div>' +
            '<span id="ob-' + o.id + '"></span></div></div>';
        }).join('');
        $all('#ordersList .card').forEach(function (c) {
          c.addEventListener('click', function () { navigate('order-detail', { id: c.getAttribute('data-id') }); });
          orderBadge(mine.find(function (o) { return o.id === c.getAttribute('data-id'); })).then(function (h) {
            var b = $('#ob-' + c.getAttribute('data-id')); if (b) b.innerHTML = h;
          });
        });
      });
    });
  };

  /* ================= ORDER DETAIL (customer) ================= */
  App.views['order-detail'] = function (root, params) {
    DB.get('orders', params.id).then(function (o) {
      if (!o) { root.innerHTML = '<div class="card center">' + esc(t('empty')) + '</div>'; return; }
      getSettings().then(function (s) {
        renderOrderDetail(root, o, s, params.guest);
      });
    });
  };

  function renderOrderDetail(root, o, s, guest) {
    var totals = Core.calcTotals(o);
    var st = Core.computeStatus(o, s);
    var itemsHtml = o.items.map(function (it) {
      var gname = App.lang === 'ur' && it.garmentName && it.garmentName.ur ? it.garmentName.ur : (it.garmentName && it.garmentName.en) || '';
      var sn = it.styleName ? (App.lang === 'ur' && it.styleName.ur ? it.styleName.ur : it.styleName.en) : '';
      var fn = it.fabricName ? (App.lang === 'ur' && it.fabricName.ur ? it.fabricName.ur : it.fabricName.en) : '';
      var meas = (it.measurements || {});
      var measRows = Object.keys(meas).map(function (k) {
        return '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + esc(meas[k]) + '"</span></div>';
      }).join('');
      return '<div class="card"><h3>' + esc(gname) + (it.qty > 1 ? ' × ' + it.qty : '') + '</h3>' +
        '<p class="muted">' + esc([sn, fn].filter(Boolean).join(' · ')) + '</p>' +
        '<div class="kv"><span class="k">' + esc(t('est_price')) + '</span><span class="v">' + money(it.price * it.qty) + '</span></div>' +
        (it.note ? '<p class="muted">' + esc(it.note) + '</p>' : '') +
        (it.needShopMeasure && !Object.keys(meas).length ? '<div class="banner info">' + esc(t('meas_at_shop')) + '</div>' : '') +
        (Object.keys(meas).length ? '<div class="section-title">' + esc(t('garment_fields')) + '</div>' + measRows : '') +
        '</div>';
    }).join('');

    var payRows = (o.payments || []).map(function (p) {
      return '<div class="kv"><span class="k">' + esc(fmtDate(p.date)) + ' · ' + esc(paymentMethodLabel(p.method)) + '</span><span class="v">' + money(p.amount) + '</span></div>';
    }).join('') || '<p class="muted">' + esc(t('no_payments')) + '</p>';

    var badgeHtml = orderBadgeHtml(st, s);

    root.innerHTML =
      '<div class="card-row mb"><button class="btn sm" id="backBtn">← ' + esc(t('back')) + '</button><div class="grow"></div>' + badgeHtml + '</div>' +
      '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">' + esc(o.orderNo) + '</h2>' +
      '<span class="muted">' + esc(t('order_placed_on')) + ': ' + esc(fmtDate(o.createdAt)) + '</span></div></div>' +
      '<div class="mt"><div class="stepper">' + stageStepper(o, s) + '</div></div></div>' +
      '<div class="card"><h3>' + esc(t('item_summary')) + '</h3>' + itemsHtml + '</div>' +
      '<div class="card"><h3>' + esc(t('payments')) + '</h3>' + payRows +
      ((s.jazzcashAccount || s.easypaisaAccount) ? (
        '<div class="card tinted mt">' +
        (s.jazzcashAccount ? '<div class="kv"><span class="k">' + esc(t('pay_jazzcash')) + '</span><span class="v mono">' + esc(s.jazzcashAccount) + '</span></div>' : '') +
        (s.easypaisaAccount ? '<div class="kv"><span class="k">' + esc(t('pay_easypaisa')) + '</span><span class="v mono">' + esc(s.easypaisaAccount) + '</span></div>' : '') +
        '<p class="hint">' + esc(t('digital_pay_hint')) + '</p></div>'
      ) : '') +
      '<div class="divider"></div>' +
      '<div class="kv"><span class="k">' + esc(t('total_due')) + '</span><span class="v">' + money(totals.final) + '</span></div>' +
      '<div class="kv"><span class="k">' + esc(t('paid')) + '</span><span class="v">' + money(totals.paid) + '</span></div>' +
      '<div class="kv"><span class="k">' + esc(t('balance')) + '</span><span class="v ' + (totals.balance > 0 ? '' : 'muted') + '">' + money(totals.balance) + '</span></div></div>' +
      '<div class="card"><h3>' + esc(t('delivery_pickup')) + '</h3>' +
      '<div class="kv"><span class="k">' + esc(t('promised_date')) + '</span><span class="v">' + esc(fmtDate(o.promisedDate)) + '</span></div>' +
      '<div class="kv"><span class="k">' + esc(t('assigned_to')) + '</span><span class="v">' + esc(o.assignedTo || '—') + '</span></div>' +
      (o.tailorNotes ? '<div class="kv"><span class="k">' + esc(t('tailor_notes')) + '</span><span class="v">' + esc(o.tailorNotes) + '</span></div>' : '') +
      '</div>' +
      '<div class="card"><h3>' + esc(t('request_alteration')) + '</h3>' +
      '<textarea class="input" id="issueTxt" placeholder="' + esc(t('issue_placeholder')) + '"></textarea>' +
      '<button class="btn block mt" id="issueBtn">' + esc(t('submit_issue')) + '</button></div>' +
      '<div class="card no-print"><h3>' + esc(t('share_whatsapp')) + '</h3>' +
      '<textarea class="input ta-copy" id="shareMsg">' + esc(buildShareMessage(o, s, 'progress')) + '</textarea>' +
      '<div class="btn-row mt"><button class="btn" id="copyShare">📋 ' + esc(t('copy_message')) + '</button>' +
      '<a class="btn primary" id="waShare" target="_blank" rel="noopener">💬 WhatsApp</a></div></div>';

    $('#backBtn').addEventListener('click', function () { navigate(guest ? 'auth' : (App.session.role === 'customer' ? 'orders' : 'dashboard')); });
    $('#issueBtn').addEventListener('click', function () {
      var txt = Core.sanitize($('#issueTxt').value);
      if (!txt) { toast(t('issue_placeholder'), 'danger'); return; }
      o.issues = o.issues || [];
      o.issues.push({ id: Core.uid('iss'), text: txt, status: 'open', createdAt: new Date().toISOString(), by: App.session ? App.session.name : 'guest' });
      o.updatedAt = new Date().toISOString();
      invalidate('orders');
      DB.put('orders', o).then(function () { toast(t('issue_received'), 'ok'); renderOrderDetail(root, o, s, guest); });
    });
    $('#copyShare').addEventListener('click', function () { copyText($('#shareMsg').value); });
    var link = $('#waShare');
    var wa = Core.waLink(o.customerSnapshot.phone, buildShareMessage(o, s, 'progress'));
    if (wa) link.href = wa; else link.classList.add('hidden');
  }

  function orderBadgeHtml(st, s) {
    var cls = st.key === 'overdue' ? 'danger' : (st.urgent ? 'warn' : 'dark');
    var label = st.key === 'overdue' ? t('status_overdue') :
      st.key === 'due_soon' ? t('status_due_soon') :
      st.key === 'unpaid' ? t('status_unpaid') : Core.stageLabel(st.key, App.lang, s);
    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }

  function stageStepper(o, s) {
    var stages = (s.stages && s.stages.length) ? s.stages : Core.DEFAULT_STAGES;
    var idx = stages.findIndex(function (x) { return x.key === o.stage; });
    if (idx === -1) idx = 0;
    return stages.map(function (st, i) {
      var cls = i < idx ? 'done' : (i === idx ? 'current' : '');
      var lbl = App.lang === 'ur' ? (st.ur || st.en) : st.en;
      return '<div class="step ' + cls + '"><div class="dot">' + (i < idx ? '✓' : (i + 1)) + '</div><div class="lbl">' + esc(lbl) + '</div></div>';
    }).join('');
  }
  App.stageStepper = stageStepper;

  function paymentMethodLabel(m) {
    var map = { cash: 'pay_cash', bank: 'pay_bank', jazzcash: 'pay_jazzcash', easypaisa: 'pay_easypaisa', other: 'pay_other' };
    return t(map[m] || 'pay_other');
  }
  App.paymentMethodLabel = paymentMethodLabel;

  function buildShareMessage(o, s, type) {
    return Core.buildMessage(type, {
      shop: { shopName: (s.shopName || ''), phone: (s.shopPhone || '') },
      order: o, totals: Core.calcTotals(o), customerName: (o.customerSnapshot && o.customerSnapshot.name) || '',
      stageLabel: Core.stageLabel(o.stage, App.lang, s), promisedLabel: fmtDate(o.promisedDate)
    }, App.lang);
  }
  App.buildShareMessage = buildShareMessage;

  /* ================= CUSTOMER PROFILE / MEASUREMENT PROFILES ================= */
  App.views.profile = function (root) {
    if (!App.session || App.session.role !== 'customer') { navigate('auth'); return; }
    DB.get('customers', 'c-' + App.session.userId).then(function (cust) {
      if (!cust) { navigate('auth'); return; }
      loadAll('profiles').then(function (profiles) {
        var mine = profiles.filter(function (p) { return p.customerId === cust.id; });
        root.innerHTML =
          '<h2>' + esc(t('my_details')) + '</h2>' +
          '<div class="card"><div class="kv"><span class="k">' + esc(t('name')) + '</span><span class="v">' + esc(cust.name) + '</span></div>' +
          '<div class="kv"><span class="k">' + esc(t('phone')) + '</span><span class="v">' + esc(cust.phone) + '</span></div>' +
          (cust.city ? '<div class="kv"><span class="k">' + esc(t('city')) + '</span><span class="v">' + esc(cust.city) + '</span></div>' : '') +
          (cust.address ? '<div class="kv"><span class="k">' + esc(t('address')) + '</span><span class="v">' + esc(cust.address) + '</span></div>' : '') +
          '<button class="btn soft block mt" id="editCust">' + esc(t('edit')) + '</button></div>' +
          '<div class="section-title">' + esc(t('my_profiles')) + '</div>' +
          '<div id="profList"></div>' +
          '<button class="btn accent block mt" id="addProf">+ ' + esc(t('add_profile')) + '</button>';

        $('#editCust').addEventListener('click', function () { customerEditSheet(cust); });
        $('#addProf').addEventListener('click', function () { profileSheet(null, cust.id); });
        var listEl = $('#profList');
        if (!mine.length) {
          listEl.innerHTML = '<div class="card"><div class="empty"><div class="ic">📏</div><p>' + esc(t('no_profiles')) + '</p></div></div>';
          return;
        }
        listEl.innerHTML = mine.map(function (p) {
          return '<div class="card tap" data-pid="' + p.id + '"><div class="card-row"><div class="avatar">' + esc((p.ownerName || p.label || 'M').charAt(0)) + '</div>' +
            '<div class="grow"><strong>' + esc(p.label) + '</strong>' + (p.ownerName ? '<div class="muted">' + esc(p.ownerName) + '</div>' : '') + '</div>' +
            '<button class="btn sm" data-edit="' + p.id + '">' + esc(t('edit')) + '</button></div></div>';
        }).join('');
        $all('#profList .card').forEach(function (c) {
          c.addEventListener('click', function () { profileSheet(mine.find(function (p) { return p.id === c.getAttribute('data-pid'); }), cust.id); });
        });
        $all('#profList [data-edit]').forEach(function (b) {
          b.addEventListener('click', function (e) { e.stopPropagation(); profileSheet(mine.find(function (p) { return p.id === b.getAttribute('data-edit'); }), cust.id); });
        });
      });
    });
  };

  function profileSheet(profile, customerId) {
    var p = profile || {};
    showSheet(
      '<h2>' + esc(profile ? t('edit') : t('add_profile')) + '</h2>' +
      '<div class="field"><label>' + esc(t('name')) + ' *</label><input class="input" id="pf-label" value="' + esc(p.label || '') + '" placeholder="Me / Son / Other child"></div>' +
      '<div class="field"><label>' + esc(t('full_name')) + '</label><input class="input" id="pf-owner" value="' + esc(p.ownerName || '') + '"></div>' +
      '<div class="field"><label>' + esc(t('name')) + ' (DOB / age)</label><input class="input" id="pf-age" value="' + esc(p.ageOrDOB || '') + '" placeholder="e.g. 2016 or 8 years"></div>' +
      '<div class="btn-row"><button class="btn" id="pf-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="pf-save">' + esc(t('save')) + '</button></div>', { centered: true });

    $('#pf-cancel').addEventListener('click', closeSheet);
    $('#pf-save').addEventListener('click', function () {
      var label = Core.sanitize($('#pf-label').value);
      if (!label) { toast(t('name_required'), 'danger'); return; }
      var rec = profile ? profile : { id: Core.uid('p'), customerId: customerId, createdAt: new Date().toISOString() };
      rec.label = label; rec.ownerName = Core.sanitize($('#pf-owner').value); rec.ageOrDOB = Core.sanitize($('#pf-age').value);
      invalidate('profiles');
      DB.put('profiles', rec).then(function () { closeSheet(); toast(t('save'), 'ok'); navigate('profile'); });
    });
  }

  function customerEditSheet(cust) {
    showSheet(
      '<h2>' + esc(t('edit')) + '</h2>' +
      '<div class="field"><label>' + esc(t('name')) + '</label><input class="input" id="ce-name" value="' + esc(cust.name) + '"></div>' +
      '<div class="form-grid"><div class="field"><label>' + esc(t('city')) + '</label><input class="input" id="ce-city" value="' + esc(cust.city || '') + '"></div>' +
      '<div class="field"><label>' + esc(t('email')) + '</label><input class="input" id="ce-email" value="' + esc(cust.email || '') + '"></div></div>' +
      '<div class="field"><label>' + esc(t('address')) + '</label><input class="input" id="ce-address" value="' + esc(cust.address || '') + '"></div>' +
      '<div class="btn-row"><button class="btn" id="ce-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="ce-save">' + esc(t('save')) + '</button></div>', { centered: true });
    $('#ce-cancel').addEventListener('click', closeSheet);
    $('#ce-save').addEventListener('click', function () {
      cust.name = Core.sanitize($('#ce-name').value) || cust.name;
      cust.city = Core.sanitize($('#ce-city').value); cust.email = Core.sanitize($('#ce-email').value);
      cust.address = Core.sanitize($('#ce-address').value);
      invalidate('customers');
      DB.put('customers', cust).then(function () { closeSheet(); toast(t('save'), 'ok'); navigate('profile'); });
    });
  }

  /* placeholder — replaced by staff.js */
  App.views.dashboard = function () { navigate('auth'); };
  App.views.customers = function () { navigate('auth'); };
  App.views.catalog = function () { navigate('auth'); };
  App.views.settings = function () { navigate('auth'); };
  function staffOrdersView(root) { /* replaced in staff.js */ App.staffOrdersView ? App.staffOrdersView(root) : navigate('auth'); }
  App.staffOrdersView = staffOrdersView;

  App.renderHeader = renderHeader;

  /* ---------------- shop switching ---------------- */
  App.setShop = function (shopId) {
    DB.setCurrentShop(shopId);
    if (App.session) App.session.shopId = shopId;
    App._dbCache = {};
    App.saveSession();
  };

  /* Resolve the shop used at the sign-in screen (for new-customer signup). */
  App.ensureAuthShop = function () {
    if (App.state.authShopId) return Promise.resolve(App.state.authShopId);
    return DB.listShops().then(function (shops) {
      if (shops.length) { App.state.authShopId = shops[0].id; DB.setCurrentShop(shops[0].id); }
      return App.state.authShopId;
    });
  };

  /* ---------------- register your brand + shop (first run) ---------------- */
  App.views.register = function (root) {
    root.innerHTML =
      '<div class="hero"><h1>' + esc(t('app_name')) + '</h1><p>' + esc(t('register_shop_sub')) + '</p></div>' +
      '<div class="banner info">' + esc(t('how_login_works')) + '</div>' +
      '<div class="card"><h2>' + esc(t('register_shop_title')) + '</h2>' +
      '<div class="field"><label>' + esc(t('brand_name')) + ' *</label><input class="input" id="rg-brand" placeholder="' + esc(t('brand_name_ph')) + '"></div>' +
      '<div class="field"><label>' + esc(t('shop_name')) + ' *</label><input class="input" id="rg-shop"></div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>' + esc(t('city')) + '</label><input class="input" id="rg-city"></div>' +
      '<div class="field"><label>' + esc(t('shop_phone')) + '</label><input class="input" id="rg-phone" inputmode="tel"></div></div>' +
      '<div class="divider"></div>' +
      '<div class="field"><label>' + esc(t('full_name')) + ' *</label><input class="input" id="rg-owner"></div>' +
      '<div class="field"><label>' + esc(t('phone')) + ' *</label><input class="input" id="rg-ownerphone" inputmode="tel"></div>' +
      '<div class="field"><label>' + esc(t('create_pin')) + ' *</label><input class="input" id="rg-pin" type="password" inputmode="numeric"></div>' +
      '<div id="rg-err"></div>' +
      '<button class="btn primary block" id="rg-go">' + esc(t('register_shop_btn')) + '</button>' +
      '<div class="divider"></div>' +
      '<button class="btn soft block" id="rg-demo">' + esc(t('try_demo')) + '</button>' +
      '<p class="hint">' + esc(t('privacy_notice_short')) + '</p></div>';

    $('#rg-go').addEventListener('click', function () {
      var brand = Core.sanitize($('#rg-brand').value);
      var shop = Core.sanitize($('#rg-shop').value);
      var owner = Core.sanitize($('#rg-owner').value);
      var ophone = Core.normalizePhone($('#rg-ownerphone').value);
      var pin = $('#rg-pin').value;
      if (!brand || !shop || !owner) { $('#rg-err').innerHTML = '<div class="alert-inline">' + esc(t('name_required')) + '</div>'; return; }
      if (!ophone) { $('#rg-err').innerHTML = '<div class="alert-inline">' + esc(t('phone_invalid')) + '</div>'; return; }
      if (!pin || pin.length < 4) { $('#rg-err').innerHTML = '<div class="alert-inline">' + esc(t('pin_short')) + '</div>'; return; }
      $('#rg-go').disabled = true;
      DB.registerShop({
        brandName: brand, shopName: shop, city: Core.sanitize($('#rg-city').value),
        phone: Core.sanitize($('#rg-phone').value), ownerName: owner, ownerPhone: ophone, pin: pin
      }).then(function (res) {
        App.session = { userId: res.owner.id, role: 'owner', name: res.owner.name, shopId: res.shopId };
        App._dbCache = {};
        App.saveSession();
        toast(t('settings_saved'), 'ok');
        navigate('dashboard');
      }).catch(function (e) { $('#rg-err').innerHTML = '<div class="alert-inline">' + esc(e && e.message || t('loading_error')) + '</div>'; });
    });
    $('#rg-demo').addEventListener('click', function () {
      $('#rg-demo').disabled = true;
      DB.registerDemo().then(function (res) {
        App.session = { userId: res.owner.id, role: 'owner', name: res.owner.name, shopId: res.shopId };
        App._dbCache = {};
        App.saveSession();
        navigate('dashboard');
      });
    });
  };

  /* ---------------- boot ---------------- */
  function boot() {
    loadSession();
    setLang(App.lang);
    var main = $('#view');
    if (!main) return;
    if (!window.indexedDB) {
      main.innerHTML = '<div class="card center"><h2>Storage unavailable</h2><p>Your browser does not support IndexedDB. Please use a modern browser (Chrome, Edge, Firefox, Safari) or enable private browsing off.</p></div>';
      return;
    }
    DB.countShops().then(function (n) {
      if (n === 0) { navigate('register'); return; }
      var shopId = App.session && App.session.shopId ? App.session.shopId : null;
      return (shopId ? Promise.resolve(shopId) : DB.listShops().then(function (sh) { return sh[0] ? sh[0].id : null; }))
        .then(function (sid) {
          if (sid) { DB.setCurrentShop(sid); if (App.session) App.session.shopId = sid; }
          if (App.session && App.session.role === 'customer') navigate('home');
          else if (App.session && (App.session.role === 'owner' || App.session.role === 'manager' || App.session.role === 'staff' || App.session.role === 'tailor')) navigate('dashboard');
          else navigate('auth');
        });
    }).catch(function (e) {
      main.innerHTML = '<div class="card center">' + esc(t('loading_error')) + '<br><small>' + esc(e && e.message) + '</small></div>';
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
