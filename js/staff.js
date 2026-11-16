/* =====================================================================
   staff.js — Staff & owner views: dashboard, customers, order management,
   catalog, reports, settings, audit. Extends the App object from app.js.
   ===================================================================== */
(function () {
  'use strict';
  var Core = window.Core, DB = window.DB;
  var App = window.App;
  var $ = App.$, $all = App.$all, el = App.el, esc = App.esc, t = App.t;
  var money = App.money, fmtDate = App.fmtDate, fmtDateTime = App.fmtDateTime;
  var toast = App.toast, navigate = App.navigate, showSheet = App.showSheet, closeSheet = App.closeSheet;
  var loadAll = App.loadAll, invalidate = App.invalidate, getSettings = App.getSettings;

  function guard(root) {
    if (!App.session || App.session.role === 'customer' || App.session.role === 'guest') {
      if (App.session && App.session.role === 'guest') navigate('auth');
      navigate('auth');
      return false;
    }
    return true;
  }

  /* ================= DASHBOARD ================= */
  App.views.dashboard = function (root) {
    if (!guard(root)) return;
    getSettings().then(function (s) {
      loadAll('orders').then(function (orders) {
        loadAll('customers').then(function (customers) {
          renderDashboard(root, s, orders, customers);
        });
      });
    });
  };

  function countBy(orders, keys) {
    return orders.filter(function (o) { return keys.indexOf(o.stage) !== -1; }).length;
  }

  function renderDashboard(root, s, orders, customers) {
    var today = new Date();
    var active = orders.filter(function (o) { return o.stage !== 'delivered' && o.stage !== 'closed'; });
    var revenue = 0, outstanding = 0;
    orders.forEach(function (o) {
      var tt = Core.calcTotals(o);
      revenue += tt.paid;
      outstanding += Math.max(0, tt.balance);
    });
    var overdue = active.filter(function (o) { return Core.computeStatus(o, s, today).key === 'overdue'; }).length;
    var dueSoon = active.filter(function (o) { return Core.computeStatus(o, s, today).key === 'due_soon'; }).length;

    var statCards =
      '<div class="stat-grid">' +
      '<div class="stat"><div class="n">' + countBy(orders, ['new', 'confirmed']) + '</div><div class="l">' + esc(t('new_orders')) + '</div></div>' +
      '<div class="stat"><div class="n" style="color:var(--accent)">' + overdue + '</div><div class="l">' + esc(t('overdue')) + '</div></div>' +
      '<div class="stat"><div class="n" style="color:var(--warn)">' + dueSoon + '</div><div class="l">' + esc(t('due_soon')) + '</div></div>' +
      '<div class="stat"><div class="n">' + countBy(orders, ['stitching']) + '</div><div class="l">' + esc(t('in_stitching')) + '</div></div>' +
      '<div class="stat"><div class="n" style="color:var(--ok)">' + money(revenue) + '</div><div class="l">' + esc(t('revenue')) + '</div></div>' +
      '<div class="stat"><div class="n" style="color:var(--danger)">' + money(outstanding) + '</div><div class="l">' + esc(t('outstanding')) + '</div></div>' +
      '</div>';

    var demo = (s.shopName || '').indexOf('(DEMO)') !== -1;
    root.innerHTML =
      (demo ? '<div class="banner warn demo-banner">' + esc(t('demo_badge')) + '</div>' : '') +
      '<div class="row mb"><h1 style="margin:0">' + esc(t('dash_title')) + '</h1><div class="grow"></div>' +
      '<button class="btn sm" id="repBtn">' + esc(t('reports')) + '</button>' +
      '<button class="btn primary sm" id="newOrderBtn">+ ' + esc(t('new_order')) + '</button></div>' +
      statCards +
      '<div class="section-title">' + esc(t('all_orders')) + '</div>' +
      '<div class="searchbar"><input class="input" id="dashSearch" placeholder="' + esc(t('search_placeholder')) + '"></div>' +
      '<div id="dashList"></div>';

    $('#newOrderBtn').addEventListener('click', function () { staffNewOrder(); });
    $('#repBtn').addEventListener('click', function () { navigate('reports'); });
    $('#dashSearch').addEventListener('input', function () {
      var q = Core.sanitize(this.value).toLowerCase();
      var list = orders.filter(function (o) {
        return (o.orderNo || '').toLowerCase().indexOf(q) !== -1 ||
          (o.customerSnapshot && o.customerSnapshot.name || '').toLowerCase().indexOf(q) !== -1 ||
          (o.customerSnapshot && o.customerSnapshot.phone || '').indexOf(q) !== -1;
      });
      renderDashList(list, s, today);
    });
    renderDashList(orders.slice().sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); }), s, today);
  }

  function renderDashList(list, s, today) {
    var box = $('#dashList');
    if (!list.length) { box.innerHTML = '<div class="card"><div class="empty"><p>' + esc(t('no_orders')) + '</p></div></div>'; return; }
    box.innerHTML = list.map(function (o) {
      var tt = Core.calcTotals(o);
      var st = Core.computeStatus(o, s, today);
      var cls = st.key === 'overdue' ? 'danger' : (st.urgent ? 'warn' : 'dark');
      var label = st.key === 'overdue' ? t('status_overdue') : st.key === 'due_soon' ? t('status_due_soon') : st.key === 'unpaid' ? t('status_unpaid') : Core.stageLabel(o.stage, App.lang, s);
      return '<div class="card tap" data-id="' + o.id + '"><div class="card-row"><div class="avatar">' + esc((o.customerSnapshot && o.customerSnapshot.name || '?').charAt(0)) + '</div>' +
        '<div class="grow"><strong>' + esc(o.customerSnapshot ? o.customerSnapshot.name : '') + '</strong>' +
        '<div class="mono muted">' + esc(o.orderNo) + ' · ' + esc(money(tt.final)) + '</div></div>' +
        '<div><span class="badge ' + cls + '">' + esc(label) + '</span>' +
        (tt.balance > 0 ? '<div class="muted" style="font-size:.72rem;text-align:end">' + esc(money(tt.balance)) + ' ' + esc(t('balance')) + '</div>' : '') +
        '</div></div></div>';
    }).join('');
    $all('#dashList .card').forEach(function (c) {
      c.addEventListener('click', function () { navigate('order-manage', { id: c.getAttribute('data-id') }); });
    });
  }

  /* ================= STAFF ORDERS LIST ================= */
  function staffOrdersView(root) {
    if (!guard(root)) return;
    getSettings().then(function (s) {
      loadAll('orders').then(function (orders) {
        var today = new Date();
        root.innerHTML =
          '<h1>' + esc(t('all_orders')) + '</h1>' +
          '<div class="chip-row" id="oFilters">' +
          '<button class="chip selected" data-f="all">' + esc(t('all_orders')) + '</button>' +
          '<button class="chip" data-f="overdue">' + esc(t('status_overdue')) + '</button>' +
          '<button class="chip" data-f="active">' + esc(t('in_stitching')) + '</button>' +
          '<button class="chip" data-f="ready">' + esc(t('status_ready')) + '</button>' +
          '<button class="chip" data-f="done">' + esc(t('completed')) + '</button></div>' +
          '<div class="searchbar"><input class="input" id="oSearch" placeholder="' + esc(t('search_placeholder')) + '"></div>' +
          '<div id="oList"></div>';

        function filtered(f, q) {
          return orders.filter(function (o) {
            var st = Core.computeStatus(o, s, today);
            var matchF = f === 'all' ||
              (f === 'overdue' && st.key === 'overdue') ||
              (f === 'active' && (o.stage === 'new' || o.stage === 'confirmed' || o.stage === 'measurements' || o.stage === 'cutting' || o.stage === 'stitching' || o.stage === 'fitting')) ||
              (f === 'ready' && o.stage === 'ready') ||
              (f === 'done' && (o.stage === 'delivered' || o.stage === 'closed'));
            var matchQ = !q || (o.orderNo || '').toLowerCase().indexOf(q) !== -1 ||
              (o.customerSnapshot && (o.customerSnapshot.name || '').toLowerCase().indexOf(q) !== -1) ||
              (o.customerSnapshot && (o.customerSnapshot.phone || '').indexOf(q) !== -1);
            return matchF && matchQ;
          });
        }
        function render(f, q) {
          var list = filtered(f, q).sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
          $('#oList').innerHTML = list.length ? list.map(function (o) {
            var st = Core.computeStatus(o, s, today);
            var cls = st.key === 'overdue' ? 'danger' : (st.urgent ? 'warn' : 'dark');
            var label = st.key === 'overdue' ? t('status_overdue') : st.key === 'due_soon' ? t('status_due_soon') : st.key === 'unpaid' ? t('status_unpaid') : Core.stageLabel(o.stage, App.lang, s);
            var tt = Core.calcTotals(o);
            return '<div class="card tap" data-id="' + o.id + '"><div class="card-row"><div class="avatar">' + esc((o.customerSnapshot && o.customerSnapshot.name || '?').charAt(0)) + '</div>' +
              '<div class="grow"><strong>' + esc(o.customerSnapshot ? o.customerSnapshot.name : '') + '</strong>' +
              '<div class="mono muted">' + esc(o.orderNo) + ' · ' + esc(money(tt.final)) + '</div></div>' +
              '<div><span class="badge ' + cls + '">' + esc(label) + '</span></div></div></div>';
          }).join('') : '<div class="card"><div class="empty"><p>' + esc(t('no_orders')) + '</p></div></div>';
          $all('#oList .card').forEach(function (c) {
            c.addEventListener('click', function () { navigate('order-manage', { id: c.getAttribute('data-id') }); });
          });
        }
        $all('#oFilters .chip').forEach(function (ch) {
          ch.addEventListener('click', function () {
            $all('#oFilters .chip').forEach(function (x) { x.classList.remove('selected'); });
            ch.classList.add('selected'); render(ch.getAttribute('data-f'), $('#oSearch').value.trim().toLowerCase());
          });
        });
        $('#oSearch').addEventListener('input', function () { render('all', this.value.trim().toLowerCase()); });
        render('all', '');
      });
    });
  }
  App.staffOrdersView = staffOrdersView;

  /* ================= STAFF NEW ORDER (walk-in) ================= */
  function staffNewOrder() {
    showSheet(
      '<h2>' + esc(t('walk_in')) + '</h2>' +
      '<div class="field"><label>' + esc(t('customer')) + '</label>' +
      '<select class="input" id="wo-cust"><option value="">' + esc(t('select')) + '…</option></select></div>' +
      '<div class="btn-row"><button class="btn" id="wo-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="wo-go">' + esc(t('next')) + '</button></div>', { centered: true });
    loadAll('customers').then(function (customers) {
      var sel = $('#wo-cust');
      customers.filter(function (c) { return c.active !== false; }).forEach(function (c) {
        var o = document.createElement('option'); o.value = c.id; o.textContent = c.name + ' · ' + c.phone; sel.appendChild(o);
      });
      var op = document.createElement('option'); op.value = '__new__'; op.textContent = '+ ' + t('new_customer'); sel.appendChild(op);
    });
    $('#wo-cancel').addEventListener('click', closeSheet);
    $('#wo-go').addEventListener('click', function () {
      var cid = $('#wo-cust').value;
      if (!cid) { toast(t('select'), 'danger'); return; }
      closeSheet();
      if (cid === '__new__') newCustomerSheet(function (cust) { staffOrderBuilder(cust.id); });
      else staffOrderBuilder(cid);
    });
  }

  function newCustomerSheet(onDone) {
    showSheet(
      '<h2>' + esc(t('new_customer')) + '</h2>' +
      '<div class="field"><label>' + esc(t('name')) + ' *</label><input class="input" id="nc-name"></div>' +
      '<div class="field"><label>' + esc(t('phone')) + ' *</label><input class="input" id="nc-phone" inputmode="tel"></div>' +
      '<div class="form-grid"><div class="field"><label>' + esc(t('city')) + '</label><input class="input" id="nc-city"></div>' +
      '<div class="field"><label>' + esc(t('email')) + '</label><input class="input" id="nc-email"></div></div>' +
      '<div class="field"><label>' + esc(t('address')) + '</label><input class="input" id="nc-address"></div>' +
      '<div class="btn-row"><button class="btn" id="nc-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="nc-save">' + esc(t('save')) + '</button></div>', { centered: true });
    $('#nc-cancel').addEventListener('click', closeSheet);
    $('#nc-save').addEventListener('click', function () {
      var name = Core.sanitize($('#nc-name').value);
      var phone = Core.normalizePhone($('#nc-phone').value);
      if (!name) { toast(t('name_required'), 'danger'); return; }
      if (!phone) { toast(t('phone_invalid'), 'danger'); return; }
      var cust = {
        id: 'c-' + Core.uid('u'), name: name, phone: phone,
        email: Core.sanitize($('#nc-email').value), city: Core.sanitize($('#nc-city').value),
        address: Core.sanitize($('#nc-address').value), language: 'en',
        consentUpdates: true, active: true, createdAt: new Date().toISOString(), createdBy: 'staff'
      };
      invalidate('customers');
      DB.put('customers', cust).then(function () { closeSheet(); toast(t('save'), 'ok'); onDone(cust); });
    });
  }
  App.newCustomerSheet = newCustomerSheet;

  function staffOrderBuilder(customerId) {
    var wiz = { customerId: customerId, items: [], step: 1 };
    navigate('staff-order-builder', { customerId: customerId, wiz: wiz });
  }
  App.staffOrderBuilder = staffOrderBuilder;

  App.views['staff-order-builder'] = function (root, params) {
    if (!guard(root)) return;
    var wiz = params.wiz || { customerId: params.customerId, items: [], step: 1 };
    DB.get('customers', wiz.customerId).then(function (cust) {
      renderBuilder(root, wiz, cust);
    });
  };

  function renderBuilder(root, wiz, cust) {
    wiz._root = root; wiz._cust = cust;
    var idx = wiz.step - 1;
    var steps = [t('step_garment'), t('step_style'), t('step_measure'), t('step_review')];
    root.innerHTML = '<div class="card-row mb"><button class="btn sm" id="bb">← ' + esc(t('back')) + '</button>' +
      '<div class="grow"><strong>' + esc(t('new_order')) + ' — ' + esc(cust.name) + '</strong></div></div>' +
      '<div class="card tinted"><span class="tag">' + esc(steps[idx]) + '</span>' +
      '<div class="progress-track mt"><div style="width:' + Math.round(wiz.step / 4 * 100) + '%"></div></div></div>' +
      '<div id="bbody"></div>' +
      '<div class="btn-row mt"><button class="btn" id="bnext">' + (wiz.step < 4 ? esc(t('next')) : esc(t('place_order'))) + '</button></div>';

    $('#bb').addEventListener('click', function () {
      if (wiz.step === 1) navigate('dashboard');
      else { wiz.step--; renderBuilder(root, wiz, cust); }
    });
    $('#bnext').addEventListener('click', function () {
      if (wiz.step === 1) { if (builderValidate1(wiz, root)) { wiz.step = 2; renderBuilder(root, wiz, cust); } }
      else if (wiz.step === 2) { if (builderValidate2(wiz)) { wiz.step = 3; renderBuilder(root, wiz, cust); } }
      else if (wiz.step === 3) {
        builderValidate3(wiz).then(function (ok) { if (ok) { wiz.step = 4; renderBuilder(root, wiz, cust); } });
      }
      else builderSubmit(root, wiz, cust);
    });

    if (wiz.step === 1) builderStep1(wiz);
    else if (wiz.step === 2) builderStep2(wiz);
    else if (wiz.step === 3) builderStep3(wiz);
    else builderStep4(root, wiz, cust);
  }

  function builderStep1(wiz) {
    loadAll('garments').then(function (gs) {
      var box = $('#bbody');
      box.innerHTML = '<div class="field"><label>' + esc(t('choose_garment')) + '</label><div class="chip-row" id="bcat">' +
        '<button class="chip selected" data-cat="men">' + esc(t('men_category')) + '</button>' +
        '<button class="chip" data-cat="children">' + esc(t('children_category')) + '</button></div></div><div id="bglist"></div>';
      $all('#bcat .chip').forEach(function (c) {
        c.addEventListener('click', function () {
          $all('#bcat .chip').forEach(function (x) { x.classList.remove('selected'); }); c.classList.add('selected');
          renderBuilderGarments(wiz, c.getAttribute('data-cat'));
        });
      });
      renderBuilderGarments(wiz, 'men');
    });
  }
  function renderBuilderGarments(wiz, cat) {
    loadAll('garments').then(function (gs) {
      var list = gs.filter(function (g) { return g.category === cat && g.active !== false; });
      $('#bglist').innerHTML = list.map(function (g) {
        return '<div class="card tap" data-gid="' + g.id + '">' + esc(App.lang === 'ur' && g.nameUr ? g.nameUr : g.nameEn) + '</div>';
      }).join('');
      $all('#bglist .card').forEach(function (c) {
        c.addEventListener('click', function () {
          wiz.garmentId = c.getAttribute('data-gid'); wiz.measurements = {}; wiz.fabricSource = 'shop';
          wiz.step = 2;
          renderBuilder(wiz._root, wiz, wiz._cust);
        });
      });
    });
  }

  function builderStep2(wiz) {
    loadAll('garments').then(function (gs) {
      var g = gs.find(function (x) { return x.id === wiz.garmentId; });
      loadAll('styles').then(function (stl) {
        loadAll('fabrics').then(function (fab) {
          var box = $('#bbody');
          box.innerHTML = '<div class="field"><label>' + esc(t('choose_style')) + '</label><div class="chip-row" id="bstyles">' +
            stl.filter(function (st) { return st.active !== false && (!st.garmentId || st.garmentId === wiz.garmentId); }).map(function (st) {
              return '<button class="chip" data-sid="' + st.id + '">' + esc(App.lang === 'ur' && st.nameUr ? st.nameUr : st.nameEn) + '</button>';
            }).join('') + '</div></div>' +
            '<div class="field"><label>' + esc(t('choose_fabric')) + '</label>' +
            '<div class="check"><input type="radio" name="bfsrc" value="shop" checked id="bf-shop"><label for="bf-shop">' + esc(t('fabric_shop')) + '</label></div>' +
            '<div class="check"><input type="radio" name="bfsrc" value="customer" id="bf-cust"><label for="bf-cust">' + esc(t('fabric_customer')) + '</label></div>' +
            '<div id="bfpick" class="chip-row mt">' + fab.filter(function (f) { return f.active !== false; }).map(function (f) {
              return '<button class="chip" data-fid="' + f.id + '">' + esc(App.lang === 'ur' && f.nameUr ? f.nameUr : f.nameEn) + ' · ' + money(f.pricePerOrder) + '</button>';
            }).join('') + '</div></div>' +
            '<div class="field"><label>' + esc(t('qty')) + '</label><input class="input" id="bqty" type="number" min="1" value="1" inputmode="numeric"></div>';
          $all('#bstyles .chip').forEach(function (c) {
            c.addEventListener('click', function () { $all('#bstyles .chip').forEach(function (x) { x.classList.remove('selected'); }); c.classList.add('selected'); wiz.styleId = c.getAttribute('data-sid'); });
          });
          $all('#bfpick .chip').forEach(function (c) {
            c.addEventListener('click', function () { $all('#bfpick .chip').forEach(function (x) { x.classList.remove('selected'); }); c.classList.add('selected'); wiz.fabricId = c.getAttribute('data-fid'); });
          });
          $all('input[name=bfsrc]').forEach(function (r) {
            r.addEventListener('change', function () { wiz.fabricSource = r.value; $('#bfpick').classList.toggle('hidden', r.value === 'customer'); });
          });
        });
      });
    });
  }

  function builderStep3(wiz) {
    loadAll('garments').then(function (gs) {
      var g = gs.find(function (x) { return x.id === wiz.garmentId; });
      var box = $('#bbody');
      box.innerHTML = '<div class="field"><label>' + esc(t('garment_fields')) + '</label><div class="form-grid" id="bmeas">' +
        (g.fields || []).map(function (f) {
          return '<div class="field"><label>' + esc(App.lang === 'ur' && f.labelUr ? f.labelUr : f.labelEn) + (f.required ? ' <span class="req">*</span>' : '') + '</label>' +
            '<input class="input" data-fkey="' + esc(f.key) + '" inputmode="decimal"></div>';
        }).join('') + '</div></div>' +
        '<div class="field"><label>' + esc(t('design_note')) + '</label><textarea class="input" id="bnote"></textarea></div>';
    });
  }

  function builderValidate1(wiz) { if (!wiz.garmentId) { toast(t('select'), 'danger'); return false; } return true; }
  function builderValidate2(wiz) {
    if (!wiz.styleId) { toast(t('select'), 'danger'); return false; }
    if (wiz.fabricSource === 'shop' && !wiz.fabricId) { toast(t('select_fabric'), 'danger'); return false; }
    return true;
  }
  function builderValidate3(wiz) {
    return loadAll('garments').then(function (gs) {
      var g = gs.find(function (x) { return x.id === wiz.garmentId; });
      var vals = {};
      $all('#bmeas .input').forEach(function (inp) { vals[inp.getAttribute('data-fkey')] = Core.sanitize(inp.value); });
      if (Core.validateMeasurements(g, vals).length) { toast(t('all_required'), 'danger'); return false; }
      wiz.measurements = vals; wiz.note = Core.sanitize($('#bnote').value);
      return true;
    });
  }

  function builderStep4(root, wiz, cust) {
    loadAll('garments').then(function (gs) {
      var g = gs.find(function (x) { return x.id === wiz.garmentId; });
      loadAll('styles').then(function (stl) {
        loadAll('fabrics').then(function (fab) {
          var st = stl.find(function (x) { return x.id === wiz.styleId; });
          var f = fab.find(function (x) { return x.id === wiz.fabricId; });
          return getSettings().then(function (s) {
            var fabricPrice = wiz.fabricSource === 'shop' && f ? Number(f.pricePerOrder) || 0 : 0;
            var base = Number(s.basePriceByGarment && s.basePriceByGarment[wiz.garmentId]) || 3500;
            wiz.price = base + (st ? Number(st.priceExtra) || 0 : 0) + fabricPrice;
            wiz.garmentName = { en: g.nameEn, ur: g.nameUr }; wiz.category = g.category;
            wiz.styleName = st ? { en: st.nameEn, ur: st.nameUr } : null;
            wiz.fabricName = f ? { en: f.nameEn, ur: f.nameUr } : null;
            wiz.fabricPrice = fabricPrice;
            $('#bbody').innerHTML =
              '<div class="card"><div class="section-title" style="margin-top:0">' + esc(t('review_summary')) + '</div>' +
              '<div class="kv"><span class="k">' + esc(t('garment')) + '</span><span class="v">' + esc(App.lang === 'ur' && g.nameUr ? g.nameUr : g.nameEn) + '</span></div>' +
              '<div class="kv"><span class="k">' + esc(t('style')) + '</span><span class="v">' + esc(st ? (App.lang === 'ur' && st.nameUr ? st.nameUr : st.nameEn) : '—') + '</span></div>' +
              '<div class="kv"><span class="k">' + esc(t('fabric')) + '</span><span class="v">' + esc(f ? (App.lang === 'ur' && f.nameUr ? f.nameUr : f.nameEn) : '—') + '</span></div>' +
              '<div class="kv"><span class="k">' + esc(t('qty')) + '</span><span class="v">' + esc($('#bqty') ? $('#bqty').value : '1') + '</span></div>' +
              '<div class="kv"><span class="k">' + esc(t('est_price')) + '</span><span class="v price-line">' + money(wiz.price) + '</span></div></div>' +
              '<div class="field mt"><label>' + esc(t('advance')) + ' (' + esc(t('payment_method')) + ')</label>' +
              '<div class="row"><input class="input" id="badv" type="number" value="' + Math.round(wiz.price * 0.5) + '" inputmode="numeric">' +
              '<select class="input" id="badvm" style="max-width:130px"><option value="cash">' + esc(t('pay_cash')) + '</option><option value="bank">' + esc(t('pay_bank')) + '</option><option value="jazzcash">' + esc(t('pay_jazzcash')) + '</option><option value="easypaisa">' + esc(t('pay_easypaisa')) + '</option></select></div></div>' +
              '<div class="field"><label>' + esc(t('promised_date')) + '</label><input class="input" id="bprom" type="date" value="' + esc(Core.toYMD(Core.suggestDeliveryDate(new Date(), s, 0))) + '"></div>' +
              '<div class="field"><label>' + esc(t('tailor_notes')) + '</label><textarea class="input" id="btailor"></textarea></div>' +
              '<div class="field"><label>' + esc(t('order_policies')) + '</label><textarea class="input" id="bpolicies">' + esc(s.orderPolicies || '') + '</textarea></div>';
          });
        });
      });
    });
  }

  function builderSubmit(root, wiz, cust) {
    var adv = Number($('#badv').value) || 0;
    var promised = $('#bprom').value || Core.toYMD(Core.suggestDeliveryDate(new Date(), null, 0));
    var today = new Date();
    var ymd = Core.toYMD(today).replace(/-/g, '');
    DB.nextCounter('order_' + ymd).then(function (n) {
      var order = {
        id: Core.uid('o'), orderNo: Core.genOrderNo(today, n),
        customerId: cust.id, customerSnapshot: { name: cust.name, phone: cust.phone },
        items: [{
          id: Core.uid('oi'), garmentId: wiz.garmentId, garmentName: wiz.garmentName,
          category: wiz.category, styleId: wiz.styleId, styleName: wiz.styleName,
          fabricId: wiz.fabricId, fabricName: wiz.fabricName,
          fabricSource: wiz.fabricSource, fabricPrice: wiz.fabricPrice,
          price: wiz.price, qty: Number($('#bqty') ? $('#bqty').value : 1) || 1,
          measurements: wiz.measurements, profileId: null, note: wiz.note || ''
        }],
        stage: 'new', assignedTo: App.session.name, tailorNotes: Core.sanitize($('#btailor').value), customerNotes: '',
        estPrice: wiz.price, finalPrice: 0, advance: adv,
        payments: adv > 0 ? [{ id: Core.uid('pay'), amount: adv, method: $('#badvm').value, date: new Date().toISOString(), note: 'Advance', by: App.session.name }] : [],
        requestedDate: null, promisedDate: promised,
        issues: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        audit: [], demo: false
      };
      invalidate('orders');
      DB.put('orders', order).then(function () {
        var rec = { id: Core.uid('m'), profileId: null, customerId: cust.id, date: new Date().toISOString(), garmentId: wiz.garmentId, values: wiz.measurements, notes: wiz.note || '', measuredBy: App.session.name };
        invalidate('measurements');
        return DB.put('measurements', rec);
      }).then(function () {
        return App.logAudit('order', order.id, 'created', '', order.orderNo + ' · ' + money(wiz.price), 'staff walk-in');
      }).then(function () {
        toast(t('order_placed'), 'ok');
        navigate('order-manage', { id: order.id });
      });
    });
  }

  /* ================= STAFF ORDER MANAGE ================= */
  App.views['order-manage'] = function (root, params) {
    if (!guard(root)) return;
    DB.get('orders', params.id).then(function (o) {
      getSettings().then(function (s) {
        loadAll('users').then(function (users) {
          renderManage(root, o, s, users);
        });
      });
    });
  };

  function stageOptions(stages, selected) {
    return stages.map(function (st) {
      return '<option value="' + st.key + '"' + (st.key === selected ? ' selected' : '') + '>' + esc(App.lang === 'ur' ? (st.ur || st.en) : st.en) + '</option>';
    }).join('');
  }

  function renderManage(root, o, s, users) {
    var totals = Core.calcTotals(o);
    var st = Core.computeStatus(o, s);
    var staff = users.filter(function (u) { return u.role !== 'customer' && u.active !== false; });
    var stages = (s.stages && s.stages.length) ? s.stages : Core.DEFAULT_STAGES;

    root.innerHTML =
      '<div class="card-row mb"><button class="btn sm" id="mback">← ' + esc(t('back')) + '</button>' +
      '<div class="grow"><h2 style="margin:0">' + esc(o.orderNo) + '</h2></div></div>' +
      '<div class="card"><div class="card-row"><div class="avatar">' + esc((o.customerSnapshot.name || '?').charAt(0)) + '</div>' +
      '<div class="grow"><strong>' + esc(o.customerSnapshot.name) + '</strong><div class="muted">' + esc(o.customerSnapshot.phone) + '</div></div>' +
      '<button class="btn sm" id="mCust">' + esc(t('customer_detail')) + '</button></div>' +
      '<div class="divider"></div>' +
      '<div class="kv"><span class="k">' + esc(t('created_on')) + '</span><span class="v">' + esc(fmtDate(o.createdAt)) + '</span></div>' +
      '<div class="kv"><span class="k">' + esc(t('promised_date')) + '</span><span class="v">' + esc(fmtDate(o.promisedDate)) + '</span></div>' +
      '<div class="kv"><span class="k">' + esc(t('status')) + '</span><span class="v">' + esc(Core.stageLabel(o.stage, App.lang, s)) + '</span></div>' +
      '<div class="kv"><span class="k">' + esc(t('assigned_to')) + '</span><span class="v">' + esc(o.assignedTo || '—') + '</span></div>' +
      '</div>' +

      '<div class="card"><h3>' + esc(t('progress')) + '</h3>' +
      '<div class="field"><label>' + esc(t('status')) + '</label><select class="input" id="mStage">' + stageOptions(stages, o.stage) + '</select></div>' +
      '<div class="field"><label>' + esc(t('assigned_to')) + '</label><select class="input" id="mAssign"><option value="">—</option>' +
      staff.map(function (u) { return '<option value="' + u.name + '"' + (o.assignedTo === u.name ? ' selected' : '') + '>' + esc(u.name) + ' (' + esc(App.roleLabel(u.role)) + ')</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>' + esc(t('tailor_notes')) + '</label><textarea class="input" id="mNotes">' + esc(o.tailorNotes || '') + '</textarea></div>' +
      '<div class="btn-row"><button class="btn sm" id="mSaveStage">' + esc(t('save_changes')) + '</button>' +
      '<button class="btn sm" id="mNext">' + esc(t('next')) + ' →</button></div></div>' +

      '<div class="card"><h3>' + esc(t('items')) + '</h3>' +
      o.items.map(function (it) {
        return '<div class="kv"><span class="k">' + esc((it.garmentName && (App.lang === 'ur' ? it.garmentName.ur : it.garmentName.en)) || '') + ' × ' + (it.qty || 1) + '</span><span class="v">' + money((it.price || 0) * (it.qty || 1)) + '</span></div>';
      }).join('') +
      '<div class="field mt"><label>' + esc(t('final_total')) + '</label><input class="input" id="mFinal" type="number" value="' + (o.finalPrice || totals.est) + '" inputmode="numeric"></div>' +
      '<div class="kv"><span class="k">' + esc(t('est_total')) + '</span><span class="v">' + money(totals.est) + '</span></div>' +
      '<div class="kv"><span class="k">' + esc(t('paid')) + '</span><span class="v">' + money(totals.paid) + '</span></div>' +
      '<div class="kv"><span class="k">' + esc(t('balance')) + '</span><span class="v ' + (totals.balance > 0 ? '' : 'muted') + '">' + money(totals.balance) + '</span></div></div>' +

      '<div class="card"><h3>' + esc(t('measurement_history')) + '</h3>' +
      o.items.map(function (it, idx) {
        var gname = (it.garmentName && (App.lang === 'ur' ? (it.garmentName.ur || it.garmentName.en) : it.garmentName.en)) || '';
        var has = it.measurements && Object.keys(it.measurements).length;
        var badge = (it.needShopMeasure && !has) ? '<span class="badge warn">' + esc(t('meas_pending')) + '</span>' :
          (has ? '<span class="badge ok">' + esc(t('recorded')) + '</span>' : '<span class="badge soft">' + esc(t('none')) + '</span>');
        return '<div class="kv"><span class="k">' + esc(gname) + ' ' + badge + '</span>' +
          '<span class="v"><button class="btn sm" data-meas="' + idx + '">' + esc(has ? t('edit') : t('add_measurements')) + '</button></span></div>';
      }).join('') + '</div>' +

      '<div class="card"><h3>' + esc(t('payments')) + '</h3>' +
      (o.payments || []).map(function (p) {
        return '<div class="kv"><span class="k">' + esc(fmtDate(p.date)) + ' · ' + esc(App.paymentMethodLabel(p.method)) + (p.note ? ' · ' + esc(p.note) : '') + '</span><span class="v">' + money(p.amount) + '</span></div>';
      }).join('') || '<p class="muted">' + esc(t('no_payments')) + '</p>' +
      '<div class="divider"></div>' +
      '<div class="row"><input class="input" id="payAmt" type="number" placeholder="' + esc(t('amount')) + '" inputmode="numeric">' +
      '<select class="input" id="payMethod" style="max-width:130px"><option value="cash">' + esc(t('pay_cash')) + '</option><option value="bank">' + esc(t('pay_bank')) + '</option><option value="jazzcash">' + esc(t('pay_jazzcash')) + '</option><option value="easypaisa">' + esc(t('pay_easypaisa')) + '</option><option value="other">' + esc(t('pay_other')) + '</option></select></div>' +
      '<button class="btn soft block mt" id="addPay">+ ' + esc(t('paid')) + '</button></div>' +

      '<div class="card"><h3>' + esc(t('fitting_appointments')) + '</h3>' +
      (o.fittings || []).map(function (f) {
        return '<div class="kv"><span class="k">' + esc(fmtDate(f.date)) + ' · ' + esc(t(f.kind === 'fitting' ? 'status_fitting' : 'status_fitting')) + (f.missed ? ' · ' + esc(t('overdue')) : '') + '</span><span class="v">' + esc(f.notes || '') + '</span></div>';
      }).join('') || '<p class="muted">—</p>' +
      '<div class="row mt"><input class="input" id="fitDate" type="date"><input class="input" id="fitNotes" placeholder="' + esc(t('notes')) + '"></div>' +
      '<div class="check"><input type="checkbox" id="fitMissed"><label for="fitMissed">' + esc(t('overdue')) + '</label></div>' +
      '<button class="btn soft block" id="addFit">+ ' + esc(t('fitting_appointments')) + '</button></div>' +

      '<div class="card"><h3>' + esc(t('request_alteration')) + '</h3>' +
      (o.issues && o.issues.length ? o.issues.map(function (i) {
        return '<div class="kv"><span class="k">' + esc(fmtDate(i.createdAt)) + ' <span class="badge ' + (i.status === 'open' ? 'warn' : 'ok') + '">' + esc(i.status) + '</span></span><span class="v">' + esc(i.text) + '</span></div>';
      }).join('') : '<p class="muted">—</p>') +
      '</div>' +

      '<div class="card no-print"><h3>' + esc(t('share_whatsapp')) + '</h3>' +
      '<div class="chip-row" id="msgTypes">' +
      '<button class="chip" data-m="confirmation">' + esc(t('order_placed')) + '</button>' +
      '<button class="chip" data-m="progress">' + esc(t('progress')) + '</button>' +
      '<button class="chip" data-m="fitting">' + esc(t('status_fitting')) + '</button>' +
      '<button class="chip" data-m="ready">' + esc(t('status_ready')) + '</button>' +
      '<button class="chip" data-m="payment">' + esc(t('balance')) + '</button>' +
      '</div><textarea class="input ta-copy mt" id="msgOut"></textarea>' +
      '<div class="btn-row mt"><button class="btn" id="mCopy">📋 ' + esc(t('copy_message')) + '</button>' +
      '<a class="btn primary" id="mWa" target="_blank" rel="noopener">💬 WhatsApp</a></div></div>' +

      '<div class="btn-row"><button class="btn no-print" id="mReceipt">🖨 ' + esc(t('download_receipt')) + '</button>' +
      '<button class="btn" id="mAudit">📜 ' + esc(t('audit')) + '</button></div>';

    var custId = o.customerId;
    $all('[data-meas]').forEach(function (b) {
      b.addEventListener('click', function () {
        measureSheet(o, Number(b.getAttribute('data-meas')), s, function () { renderManage(root, o, s, users); });
      });
    });
    $('#mback').addEventListener('click', function () { navigate('dashboard'); });
    $('#mCust').addEventListener('click', function () { navigate('customer-detail', { id: custId }); });
    $('#mStage').addEventListener('change', function () {
      var old = o.stage; o.stage = this.value; o.updatedAt = new Date().toISOString();
      invalidate('orders');
      DB.put('orders', o).then(function () { return App.logAudit('order', o.id, 'stage', old, o.stage, ''); }).then(function () { toast(t('save'), 'ok'); });
    });
    $('#mNext').addEventListener('click', function () {
      var nk = Core.nextStageKey(o.stage, s);
      if (!nk) { toast(t('status_closed'), 'danger'); return; }
      var old = o.stage; o.stage = nk; o.updatedAt = new Date().toISOString();
      invalidate('orders');
      DB.put('orders', o).then(function () { return App.logAudit('order', o.id, 'stage', old, nk, 'next'); }).then(function () { renderManage(root, o, s, users); });
    });
    $('#mAssign').addEventListener('change', function () {
      var old = o.assignedTo; o.assignedTo = this.value; o.updatedAt = new Date().toISOString();
      invalidate('orders');
      DB.put('orders', o).then(function () { return App.logAudit('order', o.id, 'assignedTo', old, o.assignedTo, ''); });
    });
    $('#mSaveStage').addEventListener('click', function () {
      var old = o.tailorNotes; o.tailorNotes = Core.sanitize($('#mNotes').value); o.updatedAt = new Date().toISOString();
      invalidate('orders');
      DB.put('orders', o).then(function () { return App.logAudit('order', o.id, 'tailorNotes', old, o.tailorNotes, ''); }).then(function () { toast(t('save'), 'ok'); });
    });
    $('#mFinal').addEventListener('change', function () {
      var old = o.finalPrice; o.finalPrice = Number(this.value) || 0; o.updatedAt = new Date().toISOString();
      invalidate('orders');
      DB.put('orders', o).then(function () { return App.logAudit('order', o.id, 'finalPrice', old, o.finalPrice, ''); }).then(function () { toast(t('save'), 'ok'); renderManage(root, o, s, users); });
    });
    $('#addPay').addEventListener('click', function () {
      var amt = Number($('#payAmt').value);
      if (!amt || amt <= 0) { toast(t('amount'), 'danger'); return; }
      o.payments = o.payments || [];
      o.payments.push({ id: Core.uid('pay'), amount: amt, method: $('#payMethod').value, date: new Date().toISOString(), note: '', by: App.session.name });
      o.updatedAt = new Date().toISOString();
      invalidate('orders');
      DB.put('orders', o).then(function () { return App.logAudit('order', o.id, 'payment', '', '+ ' + money(amt), ''); }).then(function () { toast(t('save'), 'ok'); renderManage(root, o, s, users); });
    });
    $('#addFit').addEventListener('click', function () {
      var d = $('#fitDate').value || Core.toYMD(new Date());
      o.fittings = o.fittings || [];
      o.fittings.push({ id: Core.uid('fit'), date: d, kind: 'fitting', result: '', missed: $('#fitMissed').checked, notes: Core.sanitize($('#fitNotes').value), createdAt: new Date().toISOString() });
      o.updatedAt = new Date().toISOString();
      invalidate('orders');
      DB.put('orders', o).then(function () { toast(t('save'), 'ok'); renderManage(root, o, s, users); });
    });

    var msgSel = 'progress';
    function setMsg(type) {
      msgSel = type;
      var txt = App.buildShareMessage(o, s, type);
      $('#msgOut').value = txt;
      var wa = Core.waLink(o.customerSnapshot.phone, txt);
      var a = $('#mWa');
      if (wa) { a.href = wa; a.classList.remove('hidden'); } else a.classList.add('hidden');
    }
    $all('#msgTypes .chip').forEach(function (c) {
      c.addEventListener('click', function () { $all('#msgTypes .chip').forEach(function (x) { x.classList.remove('selected'); }); c.classList.add('selected'); setMsg(c.getAttribute('data-m')); });
    });
    setMsg('progress');
    $('#mCopy').addEventListener('click', function () { App.copyText($('#msgOut').value); });
    $('#mReceipt').addEventListener('click', function () { printReceipt(o, s); });
    $('#mAudit').addEventListener('click', function () { auditSheet('order', o.id); });
  }

  /* Enter / update measurements for one order item (staff side). Also writes
     an append-only measurement record so the customer's history is kept. */
  function measureSheet(o, itemIdx, s, onDone) {
    var it = o.items[itemIdx];
    var gname = (it.garmentName && (App.lang === 'ur' ? (it.garmentName.ur || it.garmentName.en) : it.garmentName.en)) || '';
    loadAll('garments').then(function (gs) {
      var g = gs.find(function (x) { return x.id === it.garmentId; });
      var fields = (g && g.fields) || [];
      var vals = it.measurements || {};
      var wasPending = !!it.needShopMeasure;
      showSheet(
        '<h2>' + esc(t('garment_fields')) + ' — ' + esc(gname) + '</h2>' +
        (wasPending ? '<div class="banner info">' + esc(t('meas_at_shop')) + '</div>' : '') +
        '<div class="form-grid" id="mMeasFields">' +
        fields.map(function (f) {
          var lb = App.lang === 'ur' && f.labelUr ? f.labelUr : f.labelEn;
          return '<div class="field"><label>' + esc(lb) + (f.required ? ' <span class="req">*</span>' : '') + '</label>' +
            '<input class="input" data-fkey="' + esc(f.key) + '" inputmode="decimal" value="' + esc(vals[f.key] || '') + '" placeholder="' + esc(f.unit || 'in') + '"></div>';
        }).join('') + '</div>' +
        '<div class="field"><label>' + esc(t('notes')) + '</label><input class="input" id="mMeasNote" value="' + esc(it.measurementNote || '') + '"></div>' +
        '<div class="btn-row"><button class="btn" id="mm-cancel">' + esc(t('cancel')) + '</button>' +
        '<button class="btn primary" id="mm-save">' + esc(t('save')) + '</button></div>', { centered: true });

      $('#mm-cancel').addEventListener('click', closeSheet);
      $('#mm-save').addEventListener('click', function () {
        var newVals = {};
        $all('#mMeasFields .input').forEach(function (inp) {
          newVals[inp.getAttribute('data-fkey')] = Core.sanitize(inp.value);
        });
        var note = Core.sanitize($('#mMeasNote').value);
        var old = JSON.stringify(it.measurements || {});
        it.measurements = newVals;
        it.needShopMeasure = false;
        it.measurementDate = Core.toYMD(new Date());
        it.measurementNote = note;
        o.updatedAt = new Date().toISOString();
        var rec = {
          id: Core.uid('m'), profileId: it.profileId || null, customerId: o.customerId,
          date: new Date().toISOString(), garmentId: it.garmentId,
          values: newVals, notes: note, measuredBy: App.session ? App.session.name : 'staff'
        };
        invalidate('measurements');
        invalidate('orders');
        DB.put('measurements', rec)
          .then(function () { return DB.put('orders', o); })
          .then(function () { return App.logAudit('order', o.id, 'measurements', old, JSON.stringify(newVals), 'staff update'); })
          .then(function () { closeSheet(); toast(t('meas_updated'), 'ok'); if (onDone) onDone(); });
      });
    });
  }

  function printReceipt(o, s) {
    var totals = Core.calcTotals(o);
    var w = window.open('', '_blank', 'width=420,height=640');
    if (!w) { toast(t('loading_error'), 'danger'); return; }
    var items = o.items.map(function (it) {
      var gname = (it.garmentName && (App.lang === 'ur' ? it.garmentName.ur : it.garmentName.en)) || '';
      return '<tr><td>' + esc(gname) + ' × ' + (it.qty || 1) + '</td><td style="text-align:end">' + money((it.price || 0) * (it.qty || 1)) + '</td></tr>';
    }).join('');
    var meas = o.items.map(function (it) {
      var gname = (it.garmentName && (App.lang === 'ur' ? it.garmentName.ur : it.garmentName.en)) || '';
      var rows = Object.keys(it.measurements || {}).map(function (k) { return esc(k) + ': ' + esc(it.measurements[k]) + '"'; }).join(', ');
      return '<p><strong>' + esc(gname) + '</strong> — ' + (rows || '—') + '</p>';
    }).join('');
    var pays = (o.payments || []).map(function (p) { return '<p>' + esc(fmtDate(p.date)) + ' · ' + esc(App.paymentMethodLabel(p.method)) + ' · ' + money(p.amount) + '</p>'; }).join('') || '<p>—</p>';
    w.document.write(
      '<html dir="' + (App.lang === 'ur' ? 'rtl' : 'ltr') + '"><head><title>' + esc(o.orderNo) + '</title>' +
      '<style>body{font-family:sans-serif;margin:24px;color:#111}h2{margin:0 0 4px}.mono{font-family:monospace}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px}th{background:#eee}.muted{color:#666}</style></head><body>' +
      '<h2>' + esc(s.shopName || '') + '</h2>' + (s.shopAddress ? '<p class="muted">' + esc(s.shopAddress) + ' · ' + esc(s.shopPhone || '') + '</p>' : '') +
      '<h3>' + esc(t('download_receipt')) + ' — <span class="mono">' + esc(o.orderNo) + '</span></h3>' +
      '<p><strong>' + esc(o.customerSnapshot.name) + '</strong><br>' + esc(o.customerSnapshot.phone) + '</p>' +
      '<table><thead><tr><th>' + esc(t('items')) + '</th><th>' + esc(t('amount')) + '</th></tr></thead><tbody>' + items + '</tbody></table>' +
      '<p>' + esc(t('est_total')) + ': <strong>' + money(totals.est) + '</strong> · ' + esc(t('paid')) + ': ' + money(totals.paid) + ' · ' + esc(t('balance')) + ': ' + money(totals.balance) + '</p>' +
      '<h4>' + esc(t('garment_fields')) + '</h4>' + meas +
      '<h4>' + esc(t('payments')) + '</h4>' + pays +
      '<p class="muted">' + esc(o.promisedDate ? (t('promised_date') + ': ' + fmtDate(o.promisedDate)) : '') + '</p>' +
      '</body></html>');
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 300);
  }

  function auditSheet(entity, entityId) {
    loadAll('audit').then(function (rows) {
      var list = rows.filter(function (r) { return r.entity === entity && r.entityId === entityId; })
        .sort(function (a, b) { return (b.ts || '').localeCompare(a.ts || ''); });
      showSheet(
        '<h2>' + esc(t('audit')) + '</h2>' +
        (list.length ? list.map(function (r) {
          return '<div class="kv"><span class="k">' + esc(fmtDateTime(r.ts)) + '<br><small>' + esc(r.by) + '</small></span>' +
            '<span class="v">' + esc(r.field) + ': ' + esc(r.old) + ' → ' + esc(r.new) + '</span></div>';
        }).join('') : '<p class="muted">' + esc(t('audit_empty')) + '</p>') +
        '<button class="btn block mt" id="au-close">' + esc(t('close')) + '</button>', { centered: true });
      $('#au-close').addEventListener('click', closeSheet);
    });
  }
  App.auditSheet = auditSheet;

  /* ================= CUSTOMERS ================= */
  App.views.customers = function (root) {
    if (!guard(root)) return;
    loadAll('customers').then(function (customers) {
      loadAll('orders').then(function (orders) {
        root.innerHTML =
          '<div class="row mb"><h1 style="margin:0">' + esc(t('customer_list')) + '</h1><div class="grow"></div>' +
          '<button class="btn primary sm" id="addCustBtn">+ ' + esc(t('add_customer')) + '</button></div>' +
          '<div class="searchbar"><input class="input" id="custSearch" placeholder="' + esc(t('search_placeholder')) + '"></div>' +
          '<div id="custList"></div>';
        $('#addCustBtn').addEventListener('click', function () { newCustomerSheet(function (c) { navigate('customer-detail', { id: c.id }); }); });
        var renderList = function (q) {
          var list = customers.filter(function (c) {
            if (!q) return true;
            q = q.toLowerCase();
            return (c.name || '').toLowerCase().indexOf(q) !== -1 || (c.phone || '').indexOf(q) !== -1;
          });
          $('#custList').innerHTML = list.length ? list.map(function (c) {
            var cnt = orders.filter(function (o) { return o.customerId === c.id; }).length;
            return '<div class="card tap" data-id="' + c.id + '"><div class="card-row"><div class="avatar">' + esc(c.name.charAt(0)) + '</div>' +
              '<div class="grow"><strong>' + esc(c.name) + '</strong><div class="muted">' + esc(c.phone) + ' · ' + cnt + ' ' + esc(t('orders')) + '</div></div>' +
              (c.active === false ? '<span class="badge soft">' + esc(t('inactive')) + '</span>' : '') + '</div></div>';
          }).join('') : '<div class="card"><div class="empty"><p>' + esc(t('no_customers')) + '</p></div></div>';
          $all('#custList .card').forEach(function (c) {
            c.addEventListener('click', function () { navigate('customer-detail', { id: c.getAttribute('data-id') }); });
          });
        };
        $('#custSearch').addEventListener('input', function () { renderList(this.value.trim()); });
        renderList('');
      });
    });
  };

  App.views['customer-detail'] = function (root, params) {
    if (!guard(root)) return;
    DB.get('customers', params.id).then(function (c) {
      loadAll('orders').then(function (orders) {
        loadAll('profiles').then(function (profiles) {
          loadAll('measurements').then(function (recs) {
            renderCustomerDetail(root, c, orders.filter(function (o) { return o.customerId === c.id; }), profiles.filter(function (p) { return p.customerId === c.id; }), recs.filter(function (r) { return r.customerId === c.id; }));
          });
        });
      });
    });
  };

  function renderCustomerDetail(root, c, orders, profiles, recs) {
    var totalDue = orders.reduce(function (sum, o) { return sum + Math.max(0, Core.calcTotals(o).balance); }, 0);
    root.innerHTML =
      '<div class="card-row mb"><button class="btn sm" id="cd-back">← ' + esc(t('back')) + '</button><div class="grow"></div>' +
      '<button class="btn sm" id="cd-edit">' + esc(t('edit')) + '</button>' +
      (c.active === false ? '<button class="btn sm" id="cd-activate">' + esc(t('reactivate')) + '</button>' : '<button class="btn sm" id="cd-deact">' + esc(t('deactivate')) + '</button>') +
      '</div>' +
      '<div class="card"><div class="card-row"><div class="avatar" style="width:56px;height:56px">' + esc(c.name.charAt(0)) + '</div>' +
      '<div class="grow"><h2 style="margin:0">' + esc(c.name) + '</h2><div class="muted">' + esc(c.phone) + (c.email ? ' · ' + esc(c.email) : '') + '</div>' +
      (c.city ? '<div class="muted">' + esc(c.city) + (c.address ? ' · ' + esc(c.address) : '') + '</div>' : '') +
      '<span class="badge ' + (c.active === false ? 'soft' : 'ok') + '">' + esc(c.active === false ? t('inactive') : t('active')) + '</span></div></div>' +
      '<div class="divider"></div>' +
      '<div class="stat-grid"><div class="stat"><div class="n">' + orders.length + '</div><div class="l">' + esc(t('total_orders')) + '</div></div>' +
      '<div class="stat"><div class="n" style="color:var(--danger)">' + money(totalDue) + '</div><div class="l">' + esc(t('outstanding')) + '</div></div></div></div>' +

      '<div class="section-title">' + esc(t('orders_for')) + '</div>' +
      '<div id="cd-orders"></div>' +

      '<div class="section-title">' + esc(t('my_profiles')) + '</div>' +
      '<div id="cd-profiles"></div>' +

      '<div class="section-title">' + esc(t('measurement_history')) + '</div>' +
      '<div id="cd-meas"></div>';

    $('#cd-back').addEventListener('click', function () { navigate('customers'); });
    $('#cd-edit').addEventListener('click', function () { App.newCustomerSheet ? editCustomerSheet(c) : null; });
    $('#cd-deact').addEventListener('click', function () {
      if (confirm(t('deactivate_confirm'))) { c.active = false; invalidate('customers'); DB.put('customers', c).then(function () { navigate('customer-detail', { id: c.id }); }); }
    });
    $('#cd-activate').addEventListener('click', function () { c.active = true; invalidate('customers'); DB.put('customers', c).then(function () { navigate('customer-detail', { id: c.id }); }); });

    var ord = $('#cd-orders');
    ord.innerHTML = orders.length ? orders.map(function (o) {
      return '<div class="card tap" data-id="' + o.id + '"><div class="card-row"><div class="grow"><span class="mono">' + esc(o.orderNo) + '</span>' +
        '<div class="muted">' + esc(fmtDate(o.createdAt)) + ' · ' + esc(money(Core.calcTotals(o).final)) + '</div></div>' +
        '<span class="badge dark">' + esc(Core.stageLabel(o.stage, App.lang)) + '</span></div></div>';
    }).join('') : '<p class="muted">' + esc(t('no_orders')) + '</p>';
    $all('#cd-orders .card').forEach(function (x) {
      x.addEventListener('click', function () { navigate('order-manage', { id: x.getAttribute('data-id') }); });
    });

    var pf = $('#cd-profiles');
    pf.innerHTML = profiles.length ? profiles.map(function (p) {
      return '<div class="card"><strong>' + esc(p.label) + '</strong>' + (p.ownerName ? ' <span class="muted">— ' + esc(p.ownerName) + '</span>' : '') + '</div>';
    }).join('') : '<p class="muted">' + esc(t('no_profiles')) + '</p>';

    var ms = $('#cd-meas');
    var sorted = recs.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    ms.innerHTML = sorted.length ? sorted.slice(0, 8).map(function (r) {
      var vals = Object.keys(r.values || {}).map(function (k) { return esc(k) + ': ' + esc(r.values[k]) + '"'; }).join(', ');
      return '<div class="kv"><span class="k">' + esc(fmtDate(r.date)) + '<br><small>' + esc(r.measuredBy || '') + '</small></span><span class="v">' + vals + '</span></div>';
    }).join('') : '<p class="muted">—</p>';
  }

  function editCustomerSheet(c) {
    showSheet(
      '<h2>' + esc(t('edit')) + '</h2>' +
      '<div class="field"><label>' + esc(t('name')) + '</label><input class="input" id="ec-name" value="' + esc(c.name) + '"></div>' +
      '<div class="field"><label>' + esc(t('phone')) + '</label><input class="input" id="ec-phone" value="' + esc(c.phone) + '" inputmode="tel"></div>' +
      '<div class="form-grid"><div class="field"><label>' + esc(t('city')) + '</label><input class="input" id="ec-city" value="' + esc(c.city || '') + '"></div>' +
      '<div class="field"><label>' + esc(t('email')) + '</label><input class="input" id="ec-email" value="' + esc(c.email || '') + '"></div></div>' +
      '<div class="field"><label>' + esc(t('address')) + '</label><input class="input" id="ec-address" value="' + esc(c.address || '') + '"></div>' +
      '<div class="check"><input type="checkbox" id="ec-consent"' + (c.consentUpdates ? ' checked' : '') + '><label for="ec-consent">' + esc(t('customer_consent')) + '</label></div>' +
      '<div class="btn-row"><button class="btn" id="ec-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="ec-save">' + esc(t('save')) + '</button></div>', { centered: true });
    $('#ec-cancel').addEventListener('click', closeSheet);
    $('#ec-save').addEventListener('click', function () {
      var name = Core.sanitize($('#ec-name').value);
      var phone = Core.normalizePhone($('#ec-phone').value);
      if (!name) { toast(t('name_required'), 'danger'); return; }
      if (!phone) { toast(t('phone_invalid'), 'danger'); return; }
      var old = { name: c.name, phone: c.phone };
      c.name = name; c.phone = phone; c.city = Core.sanitize($('#ec-city').value); c.email = Core.sanitize($('#ec-email').value);
      c.address = Core.sanitize($('#ec-address').value); c.consentUpdates = $('#ec-consent').checked;
      invalidate('customers');
      DB.put('customers', c).then(function () { return App.logAudit('customer', c.id, 'profile', old.name + ' ' + old.phone, name + ' ' + phone, 'staff edit'); })
        .then(function () { closeSheet(); toast(t('save'), 'ok'); navigate('customer-detail', { id: c.id }); });
    });
  }

  /* ================= CATALOG ================= */
  App.views.catalog = function (root) {
    if (!guard(root)) return;
    root.innerHTML = '<h1>' + esc(t('catalog_title')) + '</h1>' +
      '<div class="tabs"><button data-tab="garments" class="active">' + esc(t('garments')) + '</button>' +
      '<button data-tab="styles">' + esc(t('styles')) + '</button>' +
      '<button data-tab="fabrics">' + esc(t('fabrics')) + '</button></div>' +
      '<div id="catBody"></div>';
    $all('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        $all('.tabs button').forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active');
        renderCatTab(b.getAttribute('data-tab'));
      });
    });
    renderCatTab('garments');
  };

  function renderCatTab(tab) {
    var body = $('#catBody');
    if (tab === 'garments') {
      loadAll('garments').then(function (gs) {
        body.innerHTML = '<button class="btn primary block" id="addG">+ ' + esc(t('add_garment')) + '</button>' +
          (gs.length ? gs.map(function (g) {
            return '<div class="card tap" data-id="' + g.id + '"><div class="card-row"><div class="grow"><strong>' + esc(g.nameEn) + '</strong>' +
              '<div class="muted">' + esc(App.lang === 'ur' ? g.nameUr : '') + ' · ' + esc(t(g.category === 'men' ? 'men_category' : 'children_category')) + '</div></div></div></div>';
          }).join('') : '<div class="card"><div class="empty"><p>' + esc(t('no_garments')) + '</p></div></div>');
        var add = $('#addG'); if (add) add.addEventListener('click', function () { garmentSheet(null); });
        $all('#catBody .card').forEach(function (c) {
          c.addEventListener('click', function () { garmentSheet(gs.find(function (g) { return g.id === c.getAttribute('data-id'); })); });
        });
      });
    } else if (tab === 'styles') {
      loadAll('styles').then(function (stl) {
        body.innerHTML = '<button class="btn primary block" id="addS">+ ' + esc(t('add_garment')) + '</button>' +
          (stl.length ? stl.map(function (s) {
            return '<div class="card tap" data-id="' + s.id + '"><div class="card-row"><div class="grow"><strong>' + esc(s.nameEn) + '</strong>' +
              '<div class="muted">' + esc(s.priceExtra ? money(s.priceExtra) : '') + '</div></div></div></div>';
          }).join('') : '<div class="card"><div class="empty"><p>' + esc(t('no_styles')) + '</p></div></div>');
        $('#addS').addEventListener('click', function () { styleSheet(null); });
        $all('#catBody .card').forEach(function (c) {
          c.addEventListener('click', function () { styleSheet(stl.find(function (s) { return s.id === c.getAttribute('data-id'); })); });
        });
      });
    } else {
      loadAll('fabrics').then(function (fab) {
        body.innerHTML = '<button class="btn primary block" id="addF">+ ' + esc(t('add_garment')) + '</button>' +
          (fab.length ? fab.map(function (f) {
            return '<div class="card tap" data-id="' + f.id + '"><div class="card-row"><div class="grow"><strong>' + esc(f.nameEn) + '</strong>' +
              '<div class="muted">' + esc(money(f.pricePerOrder)) + (f.stock != null ? ' · ' + esc(f.stock) + ' ' + esc(t('qty_unit')) : '') + '</div></div></div></div>';
          }).join('') : '<div class="card"><div class="empty"><p>' + esc(t('no_fabrics')) + '</p></div></div>');
        $('#addF').addEventListener('click', function () { fabricSheet(null); });
        $all('#catBody .card').forEach(function (c) {
          c.addEventListener('click', function () { fabricSheet(fab.find(function (f) { return f.id === c.getAttribute('data-id'); })); });
        });
      });
    }
  }

  function garmentSheet(g) {
    g = g || { id: Core.uid('g'), category: 'men', active: true, fields: [] };
    showSheet(
      '<h2>' + esc(g.id && g.id.length > 8 && g.nameEn ? t('edit_garment') : t('add_garment')) + '</h2>' +
      '<div class="field"><label>' + esc(t('garment_name_en')) + '</label><input class="input" id="g-en" value="' + esc(g.nameEn || '') + '"></div>' +
      '<div class="field"><label>' + esc(t('garment_name_ur')) + '</label><input class="input" id="g-ur" value="' + esc(g.nameUr || '') + '"></div>' +
      '<div class="field"><label>' + esc(t('category')) + '</label><select class="input" id="g-cat"><option value="men">' + esc(t('men_category')) + '</option><option value="children"' + (g.category === 'children' ? ' selected' : '') + '>' + esc(t('children_category')) + '</option></select></div>' +
      '<div class="section-title">' + esc(t('fields')) + '</div><div id="g-fields"></div>' +
      '<button class="btn soft block" id="g-addf">+ ' + esc(t('add_field')) + '</button>' +
      '<div class="btn-row mt"><button class="btn" id="g-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="g-save">' + esc(t('save_garment')) + '</button></div>', { centered: true });

    var fieldsEl = $('#g-fields');
    function renderFields() {
      fieldsEl.innerHTML = g.fields.map(function (f, i) {
        return '<div class="row mt"><input class="input" data-fi="' + i + '" data-fk="key" value="' + esc(f.key) + '" placeholder="key">' +
          '<input class="input" data-fi="' + i + '" data-fk="labelEn" value="' + esc(f.labelEn) + '" placeholder="' + esc(t('field_label_en')) + '">' +
          '<input class="input" data-fi="' + i + '" data-fk="labelUr" value="' + esc(f.labelUr || '') + '" placeholder="' + esc(t('field_label_ur')) + '">' +
          '<input class="input" style="max-width:64px" type="checkbox" data-fi="' + i + '" data-fk="required"' + (f.required ? ' checked' : '') + '>' +
          '<button class="btn sm danger" data-remove="' + i + '">✕</button></div>';
      }).join('');
      $all('#g-fields [data-remove]').forEach(function (b) {
        b.addEventListener('click', function () { g.fields.splice(Number(b.getAttribute('data-remove')), 1); renderFields(); });
      });
    }
    renderFields();
    $('#g-addf').addEventListener('click', function () { g.fields.push({ key: 'f' + (g.fields.length + 1), labelEn: '', labelUr: '', unit: 'in', required: true }); renderFields(); });
    $('#g-cancel').addEventListener('click', closeSheet);
    $('#g-save').addEventListener('click', function () {
      g.nameEn = Core.sanitize($('#g-en').value); g.nameUr = Core.sanitize($('#g-ur').value); g.category = $('#g-cat').value;
      var newFields = [];
      $all('#g-fields .row').forEach(function (row) {
        var f = {};
        $all('[data-fi]', row).forEach(function (inp) {
          var i = inp.getAttribute('data-fi'), k = inp.getAttribute('data-fk');
          f[k] = inp.type === 'checkbox' ? inp.checked : inp.value;
        });
        if (f.key && f.labelEn) newFields.push({ key: f.key, labelEn: f.labelEn, labelUr: f.labelUr, unit: 'in', required: !!f.required });
      });
      g.fields = newFields;
      invalidate('garments');
      DB.put('garments', g).then(function () { closeSheet(); toast(t('garment_saved'), 'ok'); App.views.catalog($('#view')); });
    });
  }

  function styleSheet(s) {
    s = s || { id: Core.uid('s'), active: true, priceExtra: 0 };
    showSheet(
      '<h2>' + esc(t('add_garment')) + '</h2>' +
      '<div class="field"><label>' + esc(t('style_name_en')) + '</label><input class="input" id="s-en" value="' + esc(s.nameEn || '') + '"></div>' +
      '<div class="field"><label>' + esc(t('style_name_ur')) + '</label><input class="input" id="s-ur" value="' + esc(s.nameUr || '') + '"></div>' +
      '<div class="field"><label>' + esc(t('price_extra')) + '</label><input class="input" id="s-price" type="number" value="' + esc(s.priceExtra || 0) + '" inputmode="numeric"></div>' +
      '<div class="btn-row"><button class="btn" id="s-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="s-save">' + esc(t('save_style')) + '</button></div>', { centered: true });
    $('#s-cancel').addEventListener('click', closeSheet);
    $('#s-save').addEventListener('click', function () {
      s.nameEn = Core.sanitize($('#s-en').value); s.nameUr = Core.sanitize($('#s-ur').value); s.priceExtra = Number($('#s-price').value) || 0;
      invalidate('styles');
      DB.put('styles', s).then(function () { closeSheet(); toast(t('style_saved'), 'ok'); App.views.catalog($('#view')); });
    });
  }

  function fabricSheet(f) {
    f = f || { id: Core.uid('f'), active: true, stock: 0 };
    showSheet(
      '<h2>' + esc(t('add_garment')) + '</h2>' +
      '<div class="field"><label>' + esc(t('fabric_name_en')) + '</label><input class="input" id="f-en" value="' + esc(f.nameEn || '') + '"></div>' +
      '<div class="field"><label>' + esc(t('fabric_name_ur')) + '</label><input class="input" id="f-ur" value="' + esc(f.nameUr || '') + '"></div>' +
      '<div class="field"><label>' + esc(t('fabric_price')) + '</label><input class="input" id="f-price" type="number" value="' + esc(f.pricePerOrder || 0) + '" inputmode="numeric"></div>' +
      '<div class="field"><label>' + esc(t('stock')) + '</label><input class="input" id="f-stock" type="number" value="' + esc(f.stock || 0) + '" inputmode="numeric"></div>' +
      '<div class="btn-row"><button class="btn" id="f-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="f-save">' + esc(t('save_fabric')) + '</button></div>', { centered: true });
    $('#f-cancel').addEventListener('click', closeSheet);
    $('#f-save').addEventListener('click', function () {
      f.nameEn = Core.sanitize($('#f-en').value); f.nameUr = Core.sanitize($('#f-ur').value);
      f.pricePerOrder = Number($('#f-price').value) || 0; f.stock = Number($('#f-stock').value) || 0;
      invalidate('fabrics');
      DB.put('fabrics', f).then(function () { closeSheet(); toast(t('fabric_saved'), 'ok'); App.views.catalog($('#view')); });
    });
  }

  /* ================= REPORTS ================= */
  App.views.reports = function (root) {
    if (!guard(root)) return;
    loadAll('orders').then(function (orders) {
      loadAll('garments').then(function (gs) {
        loadAll('customers').then(function (customers) {
          renderReports(root, orders, gs, customers);
        });
      });
    });
  };

  function renderReports(root, orders, gs, customers) {
    var totRevenue = 0, totOutstanding = 0;
    orders.forEach(function (o) { var tt = Core.calcTotals(o); totRevenue += tt.paid; totOutstanding += Math.max(0, tt.balance); });
    var gCount = {};
    orders.forEach(function (o) { o.items.forEach(function (it) { gCount[it.garmentId] = (gCount[it.garmentId] || 0) + 1; }); });
    var popular = Object.keys(gCount).map(function (k) {
      var g = gs.find(function (x) { return x.id === k; });
      return { name: g ? (App.lang === 'ur' ? (g.nameUr || g.nameEn) : g.nameEn) : k, n: gCount[k] };
    }).sort(function (a, b) { return b.n - a.n; });

    var custCount = {};
    orders.forEach(function (o) { custCount[o.customerId] = (custCount[o.customerId] || 0) + 1; });
    var repeat = Object.keys(custCount).filter(function (k) { return custCount[k] > 1; }).map(function (k) {
      var c = customers.find(function (x) { return x.id === k; });
      return { name: c ? c.name : k, n: custCount[k] };
    }).sort(function (a, b) { return b.n - a.n; });

    root.innerHTML =
      '<div class="row mb"><h1 style="margin:0">' + esc(t('reports')) + '</h1><div class="grow"></div>' +
      '<button class="btn sm" id="repCsv">⬇ ' + esc(t('rep_download_csv')) + '</button></div>' +
      '<div class="stat-grid"><div class="stat"><div class="n" style="color:var(--ok)">' + money(totRevenue) + '</div><div class="l">' + esc(t('rep_revenue')) + '</div></div>' +
      '<div class="stat"><div class="n" style="color:var(--danger)">' + money(totOutstanding) + '</div><div class="l">' + esc(t('rep_outstanding')) + '</div></div></div>' +
      '<div class="section-title">' + esc(t('rep_orders_by_status')) + '</div><div class="card" id="repStatus"></div>' +
      '<div class="section-title">' + esc(t('rep_popular')) + '</div><div class="card" id="repPopular"></div>' +
      '<div class="section-title">' + esc(t('rep_repeat')) + '</div><div class="card" id="repRepeat"></div>';

    var statusHtml = '';
    var stages = Core.DEFAULT_STAGES.concat([{ key: 'overdue', en: t('status_overdue'), ur: t('status_overdue') }]);
    stages.forEach(function (st) {
      var n = orders.filter(function (o) { return o.stage === st.key; }).length;
      statusHtml += '<div class="kv"><span class="k">' + esc(App.lang === 'ur' ? (st.ur || st.en) : st.en) + '</span><span class="v">' + n + '</span></div>';
    });
    $('#repStatus').innerHTML = statusHtml || '<p class="muted">' + esc(t('rep_no_data')) + '</p>';
    $('#repPopular').innerHTML = popular.length ? popular.map(function (p) { return '<div class="kv"><span class="k">' + esc(p.name) + '</span><span class="v">' + p.n + '</span></div>'; }).join('') : '<p class="muted">' + esc(t('rep_no_data')) + '</p>';
    $('#repRepeat').innerHTML = repeat.length ? repeat.map(function (p) { return '<div class="kv"><span class="k">' + esc(p.name) + '</span><span class="v">' + p.n + ' ' + esc(t('orders')) + '</span></div>'; }).join('') : '<p class="muted">' + esc(t('rep_no_data')) + '</p>';

    $('#repCsv').addEventListener('click', function () {
      var rows = [['orderNo', 'customer', 'phone', 'stage', 'created', 'promised', 'estPrice', 'finalPrice', 'paid', 'balance']];
      orders.forEach(function (o) { var tt = Core.calcTotals(o); rows.push([o.orderNo, o.customerSnapshot.name, o.customerSnapshot.phone, o.stage, o.createdAt, o.promisedDate, tt.est, tt.final, tt.paid, tt.balance]); });
      downloadCsv('orders_report.csv', rows);
      toast(t('csv_exported'), 'ok');
    });
  }

  function downloadCsv(filename, rows) {
    var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  App.downloadCsv = downloadCsv;

  /* ================= SETTINGS ================= */
  App.views.settings = function (root) {
    if (!guard(root)) return;
    getSettings().then(function (s) {
      loadAll('users').then(function (users) {
        var isOwner = App.session && App.session.role === 'owner';
        root.innerHTML =
          '<h1>' + esc(t('settings_title')) + '</h1>' +
          '<div class="tabs"><button data-tab="shop" class="active">' + esc(t('settings_title')) + '</button>' +
          (isOwner ? '<button data-tab="shops">' + esc(t('brands_shops')) + '</button>' : '') +
          '<button data-tab="staff">' + esc(t('staff_manage')) + '</button>' +
          '<button data-tab="data">' + esc(t('security')) + '</button>' +
          '<button data-tab="audit">' + esc(t('audit')) + '</button></div>' +
          '<div id="setBody"></div>';
        $all('.tabs button').forEach(function (b) {
          b.addEventListener('click', function () {
            $all('.tabs button').forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active');
            renderSettingsTab(b.getAttribute('data-tab'), s, users);
          });
        });
        renderSettingsTab('shop', s, users);
      });
    });
  };

  function renderSettingsTab(tab, s, users) {
    var body = $('#setBody');
    if (tab === 'shop') {
      var dayLabels = ['days_sun', 'days_mon', 'days_tue', 'days_wed', 'days_thu', 'days_fri', 'days_sat'];
      body.innerHTML =
        '<div class="card"><h3>' + esc(t('settings_title')) + '</h3>' +
        '<div class="field"><label>' + esc(t('brand_name')) + '</label><input class="input" id="s-brand" value="' + esc(s.brandName || '') + '" placeholder="' + esc(t('brand_name_ph')) + '"></div>' +
        '<div class="field"><label>' + esc(t('shop_name')) + '</label><input class="input" id="s-name" value="' + esc(s.shopName || '') + '"></div>' +
        '<div class="form-grid">' +
        '<div class="field"><label>' + esc(t('city')) + '</label><input class="input" id="s-city" value="' + esc(s.shopCity || '') + '"></div>' +
        '<div class="field"><label>' + esc(t('shop_phone')) + '</label><input class="input" id="s-phone" value="' + esc(s.shopPhone || '') + '" inputmode="tel"></div></div>' +
        '<div class="field"><label>' + esc(t('shop_address')) + '</label><input class="input" id="s-address" value="' + esc(s.shopAddress || '') + '"></div>' +
        '<div class="form-grid">' +
        '<div class="field"><label>' + esc(t('pay_jazzcash')) + ' — ' + esc(t('account_no')) + '</label><input class="input" id="s-jazz" value="' + esc(s.jazzcashAccount || '') + '" inputmode="tel"></div>' +
        '<div class="field"><label>' + esc(t('pay_easypaisa')) + ' — ' + esc(t('account_no')) + '</label><input class="input" id="s-easy" value="' + esc(s.easypaisaAccount || '') + '" inputmode="tel"></div></div>' +
        '<div class="field"><label>' + esc(t('working_days')) + '</label><div class="chip-row" id="s-days">' +
        dayLabels.map(function (dk, i) { return '<button class="chip' + ((s.workingDays || []).indexOf(i) !== -1 ? ' selected' : '') + '" data-day="' + i + '">' + esc(t(dk)) + '</button>'; }).join('') + '</div></div>' +
        '<div class="form-grid">' +
        '<div class="field"><label>' + esc(t('estimate_days')) + '</label><input class="input" id="s-est" type="number" value="' + esc(s.estimateDays || 7) + '" inputmode="numeric"></div>' +
        '<div class="field"><label>' + esc(t('due_soon_days')) + '</label><input class="input" id="s-due" type="number" value="' + esc(s.dueSoonDays || 2) + '" inputmode="numeric"></div></div>' +
        '<div class="field"><label>' + esc(t('default_advance_pct')) + '</label><input class="input" id="s-adv" type="number" value="' + esc(s.defaultAdvancePct || 50) + '" inputmode="numeric"></div>' +
        '<div class="field"><label>' + esc(t('order_policies')) + '</label><textarea class="input" id="s-policies">' + esc(s.orderPolicies || '') + '</textarea></div>' +
        '<button class="btn primary block" id="s-save">' + esc(t('save_settings')) + '</button></div>' +
        '<div class="card"><h3>' + esc(t('recovery_key')) + '</h3>' +
        '<p class="muted">' + esc(t('recovery_key_warn')) + '</p>' +
        '<button class="btn soft block" id="s-regen">' + esc(t('recovery_key_regenerate')) + '</button></div>' +
        '<div class="card"><h3>' + esc(t('privacy_notice')) + '</h3><p class="muted">' + esc(t('privacy_text')) + '</p>' +
        '<p class="muted">' + esc(t('consent_notice')) + '</p></div>';
      $all('#s-days .chip').forEach(function (c) {
        c.addEventListener('click', function () {
          var d = Number(c.getAttribute('data-day'));
          s.workingDays = s.workingDays || [];
          var i = s.workingDays.indexOf(d);
          if (i === -1) s.workingDays.push(d); else s.workingDays.splice(i, 1);
          c.classList.toggle('selected');
        });
      });
      $('#s-save').addEventListener('click', function () {
        s.brandName = Core.sanitize($('#s-brand').value);
        s.shopName = Core.sanitize($('#s-name').value); s.shopPhone = Core.sanitize($('#s-phone').value);
        s.shopCity = Core.sanitize($('#s-city').value);
        s.shopAddress = Core.sanitize($('#s-address').value);
        s.jazzcashAccount = Core.sanitize($('#s-jazz').value); s.easypaisaAccount = Core.sanitize($('#s-easy').value);
        s.estimateDays = Number($('#s-est').value) || 7; s.dueSoonDays = Number($('#s-due').value) || 2;
        s.defaultAdvancePct = Number($('#s-adv').value) || 50; s.orderPolicies = Core.sanitize($('#s-policies').value);
        invalidate('settings');
        DB.put('settings', s).then(function () { toast(t('settings_saved'), 'ok'); App.renderHeader(); });
      });
      $('#s-regen').addEventListener('click', function () {
        var key = Core.genRecoveryKey();
        Core.hashPasswordNew(key).then(function (ph) {
          s.recovery = ph; invalidate('settings');
          return DB.put('settings', s).then(function () {
            showSheet(
              '<h2>' + esc(t('recovery_key')) + '</h2>' +
              '<p class="hint">' + esc(t('recovery_key_regenerated')) + '</p>' +
              '<div class="recovery-box">' + esc(Core.fmtRecoveryKey(key)) + '</div>' +
              '<div class="btn-row"><button class="btn soft" id="rgk-copy">' + esc(t('copy')) + '</button>' +
              '<button class="btn primary" id="rgk-ok">' + esc(t('done')) + '</button></div>', { centered: true });
            $('#rgk-copy').addEventListener('click', function () {
              var k = Core.fmtRecoveryKey(key);
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(k).then(function () { toast(t('copied'), 'ok'); }, function () { window.prompt(t('copy'), k); });
              } else { window.prompt(t('copy'), k); }
            });
            $('#rgk-ok').addEventListener('click', closeSheet);
          });
        });
      });
    } else if (tab === 'shops') {
      DB.listShops().then(function (shops) {
        var current = DB.getCurrentShop();
        body.innerHTML =
          '<button class="btn primary block" id="addShopBtn">+ ' + esc(t('add_shop')) + '</button>' +
          (shops.length ? shops.map(function (sh) {
            return '<div class="card"><div class="card-row"><div class="avatar">' + esc((sh.brandName || sh.shopName || 'S').charAt(0)) + '</div>' +
              '<div class="grow"><strong>' + esc(sh.brandName || sh.shopName) + '</strong>' +
              '<div class="muted">' + esc(sh.shopName || '') + (sh.city ? ' · ' + esc(sh.city) : '') + '</div></div>' +
              (sh.id === current ? '<span class="badge ok">' + esc(t('active')) + '</span>' : '<button class="btn sm" data-switch="' + sh.id + '">' + esc(t('switch')) + '</button>') +
              '<button class="btn sm danger" data-del="' + sh.id + '" data-name="' + esc(sh.brandName || sh.shopName || '') + '">' + esc(t('delete')) + '</button>' +
              '</div></div>';
          }).join('') : '<p class="muted">' + esc(t('no_shops')) + '</p>');
        $('#addShopBtn').addEventListener('click', function () { addShopSheet(); });
        $all('[data-switch]').forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.getAttribute('data-switch');
            App.setShop(id);
            toast(t('switch'), 'ok');
            App.views.settings($('#view'));
          });
        });
        $all('[data-del]').forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.getAttribute('data-del');
            if (!confirm(t('delete_shop_confirm') + '\n\n' + (b.getAttribute('data-name') || ''))) return;
            DB.deleteShop(id).then(function () {
              App._dbCache = {};
              if (App.session && App.session.shopId === id) { App.session = null; App.saveSession(); }
              DB.listShops().then(function (left) {
                if (left.length) {
                  DB.setCurrentShop(left[0].id); App.state.authShopId = left[0].id;
                  toast(t('shop_deleted'), 'ok'); App.views.settings($('#view')); App.renderHeader();
                } else {
                  App.state.authShopId = null; App.session = null; App.saveSession();
                  navigate('register');
                }
              });
            });
          });
        });
      });
    } else if (tab === 'staff') {
      var activeUsers = users.filter(function (u) { return u.role !== 'customer'; });
      body.innerHTML =
        '<button class="btn primary block" id="addStaff">+ ' + esc(t('add_staff')) + '</button>' +
        (activeUsers.length ? activeUsers.map(function (u) {
          return '<div class="card"><div class="card-row"><div class="avatar">' + esc(u.name.charAt(0)) + '</div>' +
            '<div class="grow"><strong>' + esc(u.name) + '</strong><div class="muted">' + esc(u.phone || '') + ' · ' + esc(App.roleLabel(u.role)) + '</div></div>' +
            '<button class="btn sm" data-pin="' + u.id + '">' + esc(t('set_pin')) + '</button>' +
            (u.id === App.session.userId ? '' : '<button class="btn sm danger" data-del="' + u.id + '">' + esc(t('delete')) + '</button>') + '</div></div>';
        }).join('') : '<p class="muted">' + esc(t('no_staff')) + '</p>');
      $('#addStaff').addEventListener('click', function () { staffSheet(); });
      $all('[data-pin]').forEach(function (b) {
        b.addEventListener('click', function () { resetPinSheet(users.find(function (u) { return u.id === b.getAttribute('data-pin'); })); });
      });
      $all('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-del');
          if (id === App.session.userId) { toast(t('cannot_delete_self'), 'danger'); return; }
          if (confirm(t('delete_confirm'))) {
            invalidate('users');
            DB.del('users', id).then(function () { App.views.settings($('#view')); });
          }
        });
      });
    } else if (tab === 'data') {
      body.innerHTML =
        '<div class="card"><h3>' + esc(t('data_export')) + '</h3><p class="muted">' + esc(t('export_desc')) + '</p>' +
        '<button class="btn block" id="expJson">⬇ ' + esc(t('export_json')) + '</button></div>' +
        '<div class="card"><h3>' + esc(t('data_import')) + '</h3><p class="muted">' + esc(t('import_desc')) + '</p>' +
        '<input type="file" id="impFile" accept="application/json" class="hidden">' +
        '<button class="btn block" id="impJson">⬆ ' + esc(t('import_json')) + '</button></div>' +
        '<div class="card"><h3>' + esc(t('clear_demo')) + '</h3><p class="muted">' + esc(t('clear_demo_desc')) + '</p>' +
        '<button class="btn danger block" id="clearDemo">🗑 ' + esc(t('clear_demo')) + '</button></div>' +
        '<div class="card"><h3>' + esc(t('delete_data')) + '</h3><p class="muted">' + esc(t('delete_data_confirm')) + '</p>' +
        '<button class="btn danger block" id="wipeAll">💥 ' + esc(t('delete_data')) + '</button></div>';
      $('#expJson').addEventListener('click', function () {
        DB.exportAll().then(function (data) {
          var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
          a.download = 'suitapp_backup_' + Core.toYMD(new Date()) + '.json'; a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
          toast(t('export_done'), 'ok');
        });
      });
      $('#impJson').addEventListener('click', function () { $('#impFile').click(); });
      $('#impFile').addEventListener('change', function () {
        var f = this.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          try {
            var obj = JSON.parse(rd.result);
            DB.importAll(obj).then(function () { App._dbCache = {}; toast(t('import_done'), 'ok'); App.views.settings($('#view')); });
          } catch (e) { toast(t('import_bad'), 'danger'); }
        };
        rd.readAsText(f);
      });
      $('#clearDemo').addEventListener('click', function () {
        if (!confirm(t('clear_demo_confirm'))) return;
        DB.clearDemo().then(function () { App._dbCache = {}; toast(t('save'), 'ok'); });
      });
      $('#wipeAll').addEventListener('click', function () {
        if (!confirm(t('delete_data_confirm'))) return;
        DB.wipeAll().then(function () { App._dbCache = {}; App.session = null; App.saveSession(); navigate('auth'); });
      });
    } else {
      loadAll('audit').then(function (rows) {
        var list = rows.slice().sort(function (a, b) { return (b.ts || '').localeCompare(a.ts || ''); });
        body.innerHTML = list.length ? list.slice(0, 60).map(function (r) {
          return '<div class="kv"><span class="k">' + esc(fmtDateTime(r.ts)) + '<br><small>' + esc(r.by) + '</small></span>' +
            '<span class="v">' + esc(r.entity) + ' · ' + esc(r.field) + ': ' + esc(r.old) + ' → ' + esc(r.new) + '</span></div>';
        }).join('') : '<p class="muted">' + esc(t('audit_empty')) + '</p>';
      });
    }
  }

  function addShopSheet() {
    showSheet(
      '<h2>' + esc(t('add_shop')) + '</h2>' +
      '<div class="field"><label>' + esc(t('brand_name')) + ' *</label><input class="input" id="as-brand"></div>' +
      '<div class="field"><label>' + esc(t('shop_name')) + ' *</label><input class="input" id="as-shop"></div>' +
      '<div class="form-grid"><div class="field"><label>' + esc(t('city')) + '</label><input class="input" id="as-city"></div>' +
      '<div class="field"><label>' + esc(t('shop_phone')) + '</label><input class="input" id="as-phone" inputmode="tel"></div></div>' +
      '<div class="field"><label>' + esc(t('full_name')) + ' *</label><input class="input" id="as-owner"></div>' +
      '<div class="field"><label>' + esc(t('phone')) + ' *</label><input class="input" id="as-ownerphone" inputmode="tel"></div>' +
      '<div class="field"><label>' + esc(t('create_pin')) + ' *</label><input class="input" id="as-pin" type="password" inputmode="numeric"></div>' +
      '<div id="as-err"></div>' +
      '<div class="btn-row"><button class="btn" id="as-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="as-save">' + esc(t('register_shop_btn')) + '</button></div>', { centered: true });
    $('#as-cancel').addEventListener('click', closeSheet);
    $('#as-save').addEventListener('click', function () {
      var brand = Core.sanitize($('#as-brand').value);
      var shop = Core.sanitize($('#as-shop').value);
      var owner = Core.sanitize($('#as-owner').value);
      var ophone = Core.normalizePhone($('#as-ownerphone').value);
      var pin = $('#as-pin').value;
      if (!brand || !shop || !owner) { $('#as-err').innerHTML = '<div class="alert-inline">' + esc(t('name_required')) + '</div>'; return; }
      if (!ophone) { $('#as-err').innerHTML = '<div class="alert-inline">' + esc(t('phone_invalid')) + '</div>'; return; }
      if (!pin || pin.length < 4) { $('#as-err').innerHTML = '<div class="alert-inline">' + esc(t('pin_short')) + '</div>'; return; }
      DB.registerShop({ brandName: brand, shopName: shop, city: Core.sanitize($('#as-city').value), phone: Core.sanitize($('#as-phone').value), ownerName: owner, ownerPhone: ophone, pin: pin })
        .then(function (res) {
          App.setShop(res.shopId);
          closeSheet(); toast(t('settings_saved'), 'ok');
          App.views.settings($('#view'));
        });
    });
  }

  function resetPinSheet(user) {
    showSheet(
      '<h2>' + esc(t('set_pin')) + ' — ' + esc(user.name) + '</h2>' +
      '<div class="field"><label>' + esc(t('create_pin')) + '</label><input class="input" id="rp-pin" type="password" inputmode="numeric"></div>' +
      '<div class="btn-row"><button class="btn" id="rp-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="rp-save">' + esc(t('save')) + '</button></div>', { centered: true });
    $('#rp-cancel').addEventListener('click', closeSheet);
    $('#rp-save').addEventListener('click', function () {
      var pin = $('#rp-pin').value;
      if (!pin || pin.length < 4) { toast(t('pin_short'), 'danger'); return; }
      Core.hashPasswordNew(pin).then(function (ph) {
        user.pass = ph; invalidate('users');
        DB.put('users', user).then(function () { closeSheet(); toast(t('staff_saved'), 'ok'); App.views.settings($('#view')); });
      });
    });
  }

  function staffSheet() {
    showSheet(
      '<h2>' + esc(t('add_staff')) + '</h2>' +
      '<div class="field"><label>' + esc(t('staff_name')) + '</label><input class="input" id="st-name"></div>' +
      '<div class="field"><label>' + esc(t('staff_phone')) + '</label><input class="input" id="st-phone" inputmode="tel"></div>' +
      '<div class="field"><label>' + esc(t('role')) + '</label><select class="input" id="st-role"><option value="staff">' + esc(t('role_staff')) + '</option><option value="manager">' + esc(t('role_manager')) + '</option><option value="tailor">' + esc(t('role_tailor')) + '</option></select></div>' +
      '<div class="field"><label>' + esc(t('create_pin')) + '</label><input class="input" id="st-pin" type="password" inputmode="numeric"></div>' +
      '<div class="btn-row"><button class="btn" id="st-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="st-save">' + esc(t('save')) + '</button></div>', { centered: true });
    $('#st-cancel').addEventListener('click', closeSheet);
    $('#st-save').addEventListener('click', function () {
      var name = Core.sanitize($('#st-name').value);
      var phone = Core.normalizePhone($('#st-phone').value);
      var pin = $('#st-pin').value;
      if (!name) { toast(t('name_required'), 'danger'); return; }
      if (!phone) { toast(t('phone_invalid'), 'danger'); return; }
      if (!pin || pin.length < 4) { toast(t('pin_short'), 'danger'); return; }
      Core.hashPasswordNew(pin).then(function (ph) {
        var u = { id: Core.uid('u'), name: name, phone: phone, role: $('#st-role').value, active: true, pass: ph };
        invalidate('users');
        DB.put('users', u).then(function () { closeSheet(); toast(t('staff_saved'), 'ok'); App.views.settings($('#view')); });
      });
    });
  }

  /* Reset a forgotten owner PIN using the shop's recovery key (offline). */
  function forgotPinFlow() {
    showSheet(
      '<h2>' + esc(t('reset_pin_title')) + '</h2>' +
      '<p class="hint">' + esc(t('reset_pin_sub')) + '</p>' +
      '<div class="field"><label>' + esc(t('recovery_key')) + '</label><input class="input" id="fp-key" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="' + esc(t('recovery_key_ph')) + '"></div>' +
      '<div class="field"><label>' + esc(t('new_pin')) + '</label><input class="input" id="fp-pin" type="password" inputmode="numeric"></div>' +
      '<div id="fp-err"></div>' +
      '<div class="btn-row"><button class="btn" id="fp-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="fp-save">' + esc(t('set_new_pin')) + '</button></div>', { centered: true });
    $('#fp-cancel').addEventListener('click', closeSheet);
    $('#fp-save').addEventListener('click', function () {
      var key = Core.normRecoveryKey($('#fp-key').value);
      var pin = $('#fp-pin').value;
      if (!key) { $('#fp-err').innerHTML = '<div class="alert-inline">' + esc(t('invalid_recovery_key')) + '</div>'; return; }
      if (!pin || pin.length < 4) { $('#fp-err').innerHTML = '<div class="alert-inline">' + esc(t('pin_short')) + '</div>'; return; }
      DB.get('settings', 'shop').then(function (s) {
        if (!s || !s.recovery) { $('#fp-err').innerHTML = '<div class="alert-inline">' + esc(t('invalid_recovery_key')) + '</div>'; return; }
        return Core.verifyPassword(key, s.recovery.salt, s.recovery.hash, s.recovery.iter).then(function (ok) {
          if (!ok) { $('#fp-err').innerHTML = '<div class="alert-inline">' + esc(t('invalid_recovery_key')) + '</div>'; return; }
          return Core.hashPasswordNew(pin).then(function (ph) {
            return loadAll('users').then(function (users) {
              var owner = users.find(function (u) { return u.role === 'owner'; });
              if (!owner) { $('#fp-err').innerHTML = '<div class="alert-inline">' + esc(t('invalid_recovery_key')) + '</div>'; return; }
              owner.pass = ph; invalidate('users');
              return DB.put('users', owner).then(function () { closeSheet(); toast(t('staff_saved'), 'ok'); });
            });
          });
        });
      }).catch(function () { $('#fp-err').innerHTML = '<div class="alert-inline">' + esc(t('loading_error')) + '</div>'; });
    });
  }

  /* staff login view (from app.js auth tab) */
  function staffAuth(root) {
    root.innerHTML =
      '<h2>' + esc(t('staff_login')) + '</h2>' +
      '<div class="field"><label>' + esc(t('phone')) + '</label><input class="input" id="sl-phone" inputmode="tel"></div>' +
      '<div class="field"><label>' + esc(t('pin')) + '</label><input class="input" id="sl-pin" type="password" inputmode="numeric"></div>' +
      '<div id="sl-err"></div>' +
      '<button class="btn primary block" id="sl-go">' + esc(t('sign_in')) + '</button>' +
      '<div class="center mt"><button class="btn soft sm" id="sl-forgot">' + esc(t('forgot_pin')) + '</button></div>';
    $('#sl-forgot').addEventListener('click', forgotPinFlow);
    $('#sl-go').addEventListener('click', function () {
      var phone = Core.normalizePhone($('#sl-phone').value);
      if (!phone) { $('#sl-err').innerHTML = '<div class="alert-inline">' + esc(t('phone_invalid')) + '</div>'; return; }
      loadAll('users').then(function (users) {
        var u = users.find(function (x) { return x.role !== 'customer' && Core.normalizePhone(x.phone) === phone; });
        if (!u || !u.pass || u.pass.hash === 'demo') { $('#sl-err').innerHTML = '<div class="alert-inline">' + esc(t('wrong_credentials')) + '</div>'; return; }
        return Core.verifyPassword($('#sl-pin').value, u.pass.salt, u.pass.hash, u.pass.iter).then(function (ok) {
          if (!ok) { $('#sl-err').innerHTML = '<div class="alert-inline">' + esc(t('wrong_credentials')) + '</div>'; return; }
          if (u.shopId) { DB.setCurrentShop(u.shopId); App._dbCache = {}; }
          App.session = { userId: u.id, role: u.role, name: u.name, shopId: u.shopId || DB.getCurrentShop() };
          App.saveSession();
          navigate('dashboard');
        });
      });
    });
  }
  App.staffAuth = staffAuth;

  /* hook into app.js staff login tab: app.js calls App.staffAuth */
  // app.js references a local staffAuth; we override the exposed one.
  // (app.js defines customerAuth/staffAuth internally; to keep coupling simple
  //  we re-export a setter that app.js uses — see bottom of app.js patch.)
})();
