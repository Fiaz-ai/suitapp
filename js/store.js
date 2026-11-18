/* =====================================================================
   store.js — IIK storefront data, cart/favorites state, and view router.
   Pure vanilla JS. State persists to localStorage.
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------- Product catalog ------------------- */
  var CATEGORIES = [
    { id: 'pantcoat', label: 'Pant Coat', emoji: '🤵', tone: 't-navy' },
    { id: 'shirt', label: 'Shirt', emoji: '👔', tone: 't-blue' },
    { id: 'trouser', label: 'Trouser', emoji: '👖', tone: 't-tan' },
    { id: 'shalwar', label: 'Shalwar Kameez', emoji: '🥻', tone: 't-white' },
    { id: 'kurta', label: 'Kurta', emoji: '🧥', tone: 't-dark' },
    { id: 'waistcoat', label: 'Waistcoat', emoji: '🦺', tone: 't-gold' }
  ];

  var PRODUCTS = [
    { id: 'pc1', name: 'Premium Pant Coat', cat: 'pantcoat', price: 18500, badge: 'bestseller', emoji: '🤵', tone: 'm-navy', desc: 'Two-piece premium pant coat in a rich navy finish, tailored for a sharp, formal silhouette.' },
    { id: 'pc2', name: 'Royal Blue Pant Coat', cat: 'pantcoat', price: 16000, emoji: '🤵', tone: 'm-navy', desc: 'A royal-blue pant coat with a clean single-breast cut and structured shoulders.' },
    { id: 'pc3', name: 'Double-Breasted Suit', cat: 'pantcoat', price: 21000, badge: 'best', emoji: '🤵', tone: 'm-dark', desc: 'Statement double-breasted suit with a tailored waist for a commanding look.' },
    { id: 'sh1', name: 'Formal Shirt', cat: 'shirt', price: 2800, old: 3500, badge: 'off', emoji: '👔', tone: 'm-blue', desc: 'Crisp formal shirt in premium cotton with a classic collar and French placket.' },
    { id: 'sh2', name: 'Casual Shirt', cat: 'shirt', price: 2200, emoji: '👔', tone: 'm-blue', desc: 'Soft-breathing casual shirt for everyday wear, cut for comfort.' },
    { id: 'sh3', name: 'Executive Shirt', cat: 'shirt', price: 3000, emoji: '👔', tone: 'm-white', desc: 'Executive dress shirt with a modern slim fit and wrinkle-resistant finish.' },
    { id: 'tr1', name: 'Classic Trouser', cat: 'trouser', price: 3400, old: 4000, badge: 'off', emoji: '👖', tone: 'm-tan', desc: 'Classic straight-leg trouser in a durable, comfortable weave.' },
    { id: 'tr2', name: 'Slim-Fit Trouser', cat: 'trouser', price: 3800, emoji: '👖', tone: 'm-tan', desc: 'Slim-fit trouser with a modern taper and subtle stretch.' },
    { id: 'sk1', name: 'Elegant Shalwar Kameez', cat: 'shalwar', price: 5500, emoji: '🥻', tone: 'm-green', desc: 'Elegant shalwar kameez with a refined neckline and tailored drape.' },
    { id: 'sk2', name: 'Premium Shalwar Kameez', cat: 'shalwar', price: 6500, emoji: '🥻', tone: 'm-green', desc: 'Premium shalwar kameez in a rich, breathable fabric for special occasions.' },
    { id: 'ku1', name: 'Classic Kurta', cat: 'kurta', price: 4000, emoji: '🧥', tone: 'm-navy', desc: 'Classic kurta with a comfortable fit and understated detailing.' },
    { id: 'wa1', name: 'Navy Waistcoat', cat: 'waistcoat', price: 4500, emoji: '🦺', tone: 'm-dark', desc: 'Tailored navy waistcoat to complete a formal three-piece ensemble.' },
    { id: 'wa2', name: 'Tweed Waistcoat', cat: 'waistcoat', price: 5800, emoji: '🦺', tone: 'm-tan', desc: 'Heritage tweed waistcoat with a timeless, warm finish.' }
  ];

  /* ------------------- State (localStorage) ------------------- */
  function read(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var cart = read('iik_cart', {});        // { id: qty }
  var favs = read('iik_favs', []);        // [id]
  var orders = read('iik_orders', []);    // [{ id, items:[{name,qty,price}], total, date, status }]

  /* ------------------- Helpers ------------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function money(n) { return 'PKR ' + Number(n).toLocaleString('en-PK'); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function product(id) { return PRODUCTS.filter(function (p) { return p.id === id; })[0]; }
  function catLabel(id) { var c = CATEGORIES.filter(function (c) { return c.id === id; })[0]; return c ? c.label : id; }

  /* ------------------- Cart ------------------- */
  function cartCount() { return Object.keys(cart).reduce(function (n, id) { return n + cart[id]; }, 0); }
  function cartTotal() {
    return Object.keys(cart).reduce(function (sum, id) {
      var p = product(id); if (!p) return sum; return sum + p.price * cart[id];
    }, 0);
  }
  function cartItems() {
    return Object.keys(cart).map(function (id) {
      var p = product(id); if (!p) return null;
      return { product: p, qty: cart[id], line: p.price * cart[id] };
    }).filter(Boolean);
  }
  function addToCart(id, qty) { cart[id] = (cart[id] || 0) + (qty || 1); write('iik_cart', cart); syncBadges(); }
  function setQty(id, qty) { if (qty <= 0) { delete cart[id]; } else { cart[id] = qty; } write('iik_cart', cart); syncBadges(); }
  function clearCart() { cart = {}; write('iik_cart', cart); syncBadges(); }

  /* ------------------- Favorites ------------------- */
  function isFav(id) { return favs.indexOf(id) !== -1; }
  function toggleFav(id) {
    var i = favs.indexOf(id);
    if (i === -1) { favs.push(id); } else { favs.splice(i, 1); }
    write('iik_favs', favs); syncBadges();
  }

  /* ------------------- Orders ------------------- */
  function placeOrder() {
    var items = cartItems();
    if (!items.length) return null;
    var order = {
      id: 'ORD-' + Date.now().toString().slice(-8),
      items: items.map(function (it) { return { name: it.product.name, qty: it.qty, price: it.product.price }; }),
      total: cartTotal(),
      date: new Date().toISOString(),
      status: 'Confirmed'
    };
    orders.unshift(order);
    write('iik_orders', orders);
    clearCart();
    return order;
  }

  /* ------------------- Custom stitching ------------------- */
  var CUSTOM_GARMENTS = [
    { id: 'pantcoat', label: 'Pant Coat', emoji: '🤵', base: 15000, fields: [['chest', 'Chest (in)'], ['waist', 'Waist (in)'], ['hip', 'Hip (in)'], ['shoulder', 'Shoulder (in)'], ['sleeve', 'Sleeve (in)'], ['coatLength', 'Coat Length (in)']] },
    { id: 'shirt', label: 'Shirt', emoji: '👔', base: 3500, fields: [['neck', 'Neck (in)'], ['chest', 'Chest (in)'], ['sleeve', 'Sleeve (in)'], ['shirtLength', 'Shirt Length (in)']] },
    { id: 'trouser', label: 'Trouser', emoji: '👖', base: 4200, fields: [['waist', 'Waist (in)'], ['hip', 'Hip (in)'], ['inseam', 'Inseam (in)'], ['trouserLength', 'Trouser Length (in)']] },
    { id: 'shalwar', label: 'Shalwar Kameez', emoji: '🥻', base: 6500, fields: [['chest', 'Chest (in)'], ['shoulder', 'Shoulder (in)'], ['sleeve', 'Sleeve (in)'], ['kameezLength', 'Kameez Length (in)'], ['shalwarLength', 'Shalwar Length (in)']] },
    { id: 'kurta', label: 'Kurta', emoji: '🧥', base: 5000, fields: [['chest', 'Chest (in)'], ['shoulder', 'Shoulder (in)'], ['sleeve', 'Sleeve (in)'], ['kurtaLength', 'Kurta Length (in)']] },
    { id: 'waistcoat', label: 'Waistcoat', emoji: '🦺', base: 4500, fields: [['chest', 'Chest (in)'], ['waist', 'Waist (in)'], ['waistcoatLength', 'Waistcoat Length (in)']] }
  ];
  var FABRICS = ['Cotton', 'Wool', 'Linen', 'Silk Blend', 'Wash & Wear', 'Jamawar'];
  var customState = { step: 1, garment: null, measurements: {}, fabric: FABRICS[0], notes: '' };

  /* ------------------- View router ------------------- */
  var current = 'home';
  function show(name, opts) {
    current = name;
    $all('section.view').forEach(function (v) { v.classList.add('hidden'); });
    var v = $('#view-' + name);
    if (!v) { v = $('#view-home'); }
    v.classList.remove('hidden');
    if (name === 'home') renderHome();
    if (name === 'categories') renderCategories();
    if (name === 'cart') renderCart();
    if (name === 'favorites') renderFavorites();
    if (name === 'orders') renderOrders();
    if (name === 'more') renderMore();
    if (name === 'custom') renderCustom();
    if (name === 'product') renderProduct(opts && opts.id);
    // bottom nav active state
    $all('.nav-item').forEach(function (n) {
      n.classList.toggle('on', n.getAttribute('data-view') === name);
    });
    // search bar only on home
    $('.search-wrap').style.display = name === 'home' ? '' : 'none';
    window.scrollTo(0, 0);
  }

  /* ------------------- View: Home ------------------- */
  function renderHome() {
    // categories chips
    var chips = $('#home-chips');
    if (chips) {
      chips.innerHTML = CATEGORIES.map(function (c) {
        return '<a class="chip" href="#" data-cat="' + c.id + '">' +
          '<span class="thumb ' + c.tone + '">' + c.emoji + '</span>' +
          '<span class="label">' + esc(c.label) + '</span></a>';
      }).join('');
      $all('[data-cat]', chips).forEach(function (c) {
        c.addEventListener('click', function (e) { e.preventDefault(); show('categories', { cat: c.getAttribute('data-cat') }); });
      });
    }
    // product grid
    var grid = $('#home-grid');
    if (grid) { grid.innerHTML = PRODUCTS.slice(0, 4).map(cardHtml).join(''); wireCards(grid); }
    syncBadges();
  }

  function cardHtml(p) {
    var badge = '';
    if (p.badge === 'bestseller') badge = '<span class="tag bestseller">Best Seller</span>';
    else if (p.badge === 'off' && p.old) badge = '<span class="tag off">' + Math.round((1 - p.price / p.old) * 100) + '% OFF</span>';
    else if (p.badge === 'best') badge = '<span class="tag bestseller">Best</span>';
    var old = p.old ? '<span class="old">' + money(p.old) + '</span>' : '';
    return '<article class="card" data-id="' + p.id + '">' +
      '<div class="media ' + p.tone + '">' + badge +
        '<span class="heart ' + (isFav(p.id) ? 'on' : '') + '" data-wish>' + heartSvg + '</span>' +
        '<span class="ph">' + p.emoji + '</span></div>' +
      '<div class="body"><div class="name">' + esc(p.name) + '</div>' +
        '<div class="price-row"><span class="price"><span class="cur">PKR</span> ' + p.price.toLocaleString('en-PK') + '</span>' + old + '</div>' +
        '<button class="add-cart" data-add="' + p.id + '">' + cartSvg + ' Add to Cart</button>' +
      '</div></article>';
  }

  function wireCards(root) {
    $all('[data-id]', root).forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-add]') || e.target.closest('[data-wish]')) return;
        show('product', { id: card.getAttribute('data-id') });
      });
    });
    $all('[data-add]', root).forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); addToCart(b.getAttribute('data-add')); toast('Added to cart'); });
    });
    $all('[data-wish]', root).forEach(function (h) {
      h.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = h.closest('[data-id]').getAttribute('data-id');
        toggleFav(id); h.classList.toggle('on', isFav(id));
        toast(isFav(id) ? 'Added to favorites' : 'Removed from favorites');
      });
    });
  }

  /* ------------------- View: Categories ------------------- */
  function renderCategories(opts) {
    var cat = opts && opts.cat;
    var wrap = $('#view-categories');
    var head = '<div class="page-head"><button class="back" data-back>←</button><h1>Categories</h1></div>';
    var body;
    if (cat) {
      var c = CATEGORIES.filter(function (x) { return x.id === cat; })[0];
      var items = PRODUCTS.filter(function (p) { return p.cat === cat; });
      body = '<div class="cat-title">' + (c ? c.label : '') + '</div>' +
        '<div class="grid">' + items.map(cardHtml).join('') + '</div>';
    } else {
      body = '<div class="cat-list">' + CATEGORIES.map(function (c) {
        var n = PRODUCTS.filter(function (p) { return p.cat === c.id; }).length;
        return '<a class="cat-row" href="#" data-cat="' + c.id + '">' +
          '<span class="thumb ' + c.tone + '">' + c.emoji + '</span>' +
          '<span class="cat-name">' + esc(c.label) + '</span>' +
          '<span class="cat-count">' + n + ' items</span>' +
          '<span class="chev">›</span></a>';
      }).join('') + '</div>';
    }
    wrap.innerHTML = head + body;
    $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('home'); }); });
    $all('[data-cat]', wrap).forEach(function (x) { x.addEventListener('click', function (e) { e.preventDefault(); renderCategories({ cat: x.getAttribute('data-cat') }); }); });
    var grid = $('.grid', wrap); if (grid) wireCards(grid);
  }

  /* ------------------- View: Product detail ------------------- */
  function renderProduct(id) {
    var p = product(id);
    var wrap = $('#view-product');
    if (!p) { show('home'); return; }
    wrap.innerHTML =
      '<div class="page-head"><button class="back" data-back>←</button><span></span></div>' +
      '<div class="detail-media ' + p.tone + '"><span class="ph-big">' + p.emoji + '</span></div>' +
      '<div class="detail-body">' +
        '<div class="detail-name">' + esc(p.name) + '</div>' +
        '<div class="detail-cat">' + esc(catLabel(p.cat)) + '</div>' +
        '<div class="detail-price"><span class="price"><span class="cur">PKR</span> ' + p.price.toLocaleString('en-PK') + '</span>' + (p.old ? '<span class="old">' + money(p.old) + '</span>' : '') + '</div>' +
        '<p class="detail-desc">' + esc(p.desc) + '</p>' +
        '<button class="btn-primary" data-detail-add="' + p.id + '">' + cartSvg + ' Add to Cart</button>' +
        '<button class="btn-ghost" data-detail-fav="' + p.id + '">' + heartSvg + ' ' + (isFav(p.id) ? 'Remove from Favorites' : 'Add to Favorites') + '</button>' +
      '</div>';
    $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { history.length > 1 ? history.back() : show('home'); }); });
    var add = $('[data-detail-add]', wrap);
    add.addEventListener('click', function () { addToCart(p.id); toast('Added to cart'); });
    var fav = $('[data-detail-fav]', wrap);
    fav.addEventListener('click', function () { toggleFav(p.id); fav.textContent = (isFav(p.id) ? 'Remove from Favorites' : 'Add to Favorites'); toast(isFav(p.id) ? 'Added to favorites' : 'Removed from favorites'); });
  }

  /* ------------------- View: Cart ------------------- */
  function renderCart() {
    var wrap = $('#view-cart');
    var items = cartItems();
    var head = '<div class="page-head"><button class="back" data-back>←</button><h1>Cart</h1></div>';
    if (!items.length) {
      wrap.innerHTML = head + '<div class="empty"><div class="empty-ico">🛒</div><p>Your cart is empty</p><button class="btn-primary" data-shop>Browse Collection</button></div>';
      wireEmpty(wrap);
      return;
    }
    var rows = items.map(function (it) {
      return '<div class="cart-row" data-id="' + it.product.id + '">' +
        '<div class="cart-thumb ' + it.product.tone + '">' + it.product.emoji + '</div>' +
        '<div class="cart-info"><div class="cart-name">' + esc(it.product.name) + '</div>' +
          '<div class="cart-price">' + money(it.product.price) + '</div>' +
          '<div class="qty"><button class="qty-btn" data-dec>−</button><span>' + it.qty + '</span><button class="qty-btn" data-inc>+</button></div>' +
        '</div>' +
        '<div class="cart-line">' + money(it.line) + '</div>' +
        '<button class="cart-remove" data-rm>✕</button></div>';
    }).join('');
    wrap.innerHTML = head + '<div class="cart-list">' + rows + '</div>' +
      '<div class="cart-summary"><div class="sum-row"><span>Total</span><b>' + money(cartTotal()) + '</b></div>' +
      '<button class="btn-primary" data-checkout>' + cartSvg + ' Checkout</button></div>';
    $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('home'); }); });
    $all('.cart-row', wrap).forEach(function (row) {
      var id = row.getAttribute('data-id');
      $('[data-inc]', row).addEventListener('click', function () { setQty(id, (cart[id] || 0) + 1); renderCart(); });
      $('[data-dec]', row).addEventListener('click', function () { setQty(id, (cart[id] || 0) - 1); renderCart(); });
      $('[data-rm]', row).addEventListener('click', function () { setQty(id, 0); renderCart(); });
    });
    var co = $('[data-checkout]', wrap);
    if (co) co.addEventListener('click', function () {
      var o = placeOrder();
      if (o) { toast('Order placed — ' + o.id); show('orders'); }
    });
  }
  function wireEmpty(wrap) {
    $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('home'); }); });
    var s = $('[data-shop]', wrap);
    if (s) s.addEventListener('click', function () { show('categories'); });
  }

  /* ------------------- View: Favorites ------------------- */
  function renderFavorites() {
    var wrap = $('#view-favorites');
    var head = '<div class="page-head"><button class="back" data-back>←</button><h1>Favorites</h1></div>';
    var favItems = PRODUCTS.filter(function (p) { return isFav(p.id); });
    if (!favItems.length) {
      wrap.innerHTML = head + '<div class="empty"><div class="empty-ico">🤍</div><p>No favorites yet</p><button class="btn-primary" data-shop>Browse Collection</button></div>';
      wireEmpty(wrap);
      return;
    }
    wrap.innerHTML = head + '<div class="grid">' + favItems.map(cardHtml).join('') + '</div>';
    $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('home'); }); });
    wireCards($('.grid', wrap));
  }

  /* ------------------- View: Orders ------------------- */
  function renderOrders() {
    var wrap = $('#view-orders');
    var head = '<div class="page-head"><button class="back" data-back>←</button><h1>My Orders</h1></div>';
    if (!orders.length) {
      wrap.innerHTML = head + '<div class="empty"><div class="empty-ico">📦</div><p>No orders yet</p><button class="btn-primary" data-shop>Start Shopping</button></div>';
      wireEmpty(wrap);
      return;
    }
    var rows = orders.map(function (o) {
      var date = new Date(o.date);
      return '<div class="order-card"><div class="order-top"><b>' + o.id + '</b><span class="order-status">' + esc(o.status) + '</span></div>' +
        '<div class="order-date">' + date.toLocaleDateString() + ' · ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</div>' +
        '<div class="order-items">' + o.items.map(function (it) { return '<div class="oi"><span>' + esc(it.name) + ' × ' + it.qty + '</span><span>' + money(it.price * it.qty) + '</span></div>'; }).join('') + '</div>' +
        '<div class="order-total">Total: <b>' + money(o.total) + '</b></div></div>';
    }).join('');
    wrap.innerHTML = head + '<div class="orders-list">' + rows + '</div>';
    $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('home'); }); });
  }

  /* ------------------- View: Custom stitching wizard ------------------- */
  function renderCustom() {
    var wrap = $('#view-custom');
    var head = '<div class="page-head"><button class="back" data-back>←</button><h1>Custom Stitching</h1></div>';
    var steps = '<div class="steps"><span class="' + (customState.step >= 1 ? 'on' : '') + '">1. Garment</span><span class="' + (customState.step >= 2 ? 'on' : '') + '">2. Measurements</span><span class="' + (customState.step >= 3 ? 'on' : '') + '">3. Confirm</span></div>';
    var body = '';

    if (customState.step === 1) {
      body = steps + '<div class="custom-garments">' + CUSTOM_GARMENTS.map(function (g) {
        return '<button class="cg" data-cg="' + g.id + '"><span class="cg-emoji">' + g.emoji + '</span><span class="cg-label">' + esc(g.label) + '</span><span class="cg-price">from ' + money(g.base) + '</span></button>';
      }).join('') + '</div><p class="custom-note">Select the garment you\'d like us to stitch to measure.</p>';
    } else if (customState.step === 2) {
      var g = CUSTOM_GARMENTS.filter(function (x) { return x.id === customState.garment; })[0];
      var fields = g.fields.map(function (f) {
        return '<label class="mf"><span>' + esc(f[1]) + '</span><input type="number" inputmode="decimal" step="0.5" min="0" placeholder="—" data-f="' + f[0] + '" value="' + (customState.measurements[f[0]] || '') + '"></label>';
      }).join('');
      var fabrics = FABRICS.map(function (f) {
        return '<button class="fchip ' + (customState.fabric === f ? 'on' : '') + '" data-fab="' + esc(f) + '">' + esc(f) + '</button>';
      }).join('');
      body = steps +
        '<div class="custom-garment-head"><span class="cg-emoji big">' + g.emoji + '</span><b>' + esc(g.label) + '</b></div>' +
        '<div class="mf-grid">' + fields + '</div>' +
        '<div class="custom-sub">Fabric</div><div class="fchips">' + fabrics + '</div>' +
        '<label class="mf notes"><span>Notes / instructions</span><textarea rows="3" data-notes placeholder="e.g. 2-inch cuff, side vents…">' + esc(customState.notes) + '</textarea></label>' +
        '<button class="btn-primary" data-cnext>Review Order</button>' +
        '<button class="btn-ghost" data-cback>← Change garment</button>';
    } else {
      var g2 = CUSTOM_GARMENTS.filter(function (x) { return x.id === customState.garment; })[0];
      var meas = Object.keys(customState.measurements).filter(function (k) { return customState.measurements[k]; })
        .map(function (k) { var f = g2.fields.filter(function (x) { return x[0] === k; })[0]; return '<div class="oi"><span>' + esc(f ? f[1] : k) + '</span><span>' + esc(customState.measurements[k]) + ' in</span></div>'; }).join('');
      body = steps +
        '<div class="review-card"><div class="order-top"><b>' + esc(g2.label) + ' (Custom)</b><span class="order-status">Estimate</span></div>' +
        '<div class="oi"><span>Fabric</span><span>' + esc(customState.fabric) + '</span></div>' +
        (customState.notes ? '<div class="oi"><span>Notes</span><span>' + esc(customState.notes) + '</span></div>' : '') +
        '<div class="order-items">' + (meas || '<div class="oi"><span>Measurements</span><span>—</span></div>') + '</div>' +
        '<div class="order-total">Estimate: <b>' + money(g2.base) + '</b> <span class="hint">(final quote after measurement)</span></div></div>' +
        '<button class="btn-primary" data-place>Place Custom Order</button>' +
        '<button class="btn-ghost" data-cback>← Edit</button>';
    }

    wrap.innerHTML = head + body;

    $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('home'); }); });
    if (customState.step === 1) {
      $all('[data-cg]', wrap).forEach(function (b) {
        b.addEventListener('click', function () { customState.garment = b.getAttribute('data-cg'); customState.measurements = {}; customState.step = 2; renderCustom(); });
      });
    } else if (customState.step === 2) {
      $all('.mf input', wrap).forEach(function (i) { i.addEventListener('input', function () { customState.measurements[i.getAttribute('data-f')] = i.value; }); });
      $all('[data-fab]', wrap).forEach(function (f) { f.addEventListener('click', function () { customState.fabric = f.getAttribute('data-fab'); renderCustom(); }); });
      var notes = $('[data-notes]', wrap); if (notes) notes.addEventListener('input', function () { customState.notes = notes.value; });
      var next = $('[data-cnext]', wrap); if (next) next.addEventListener('click', function () { customState.step = 3; renderCustom(); });
      var back = $('[data-cback]', wrap); if (back) back.addEventListener('click', function () { customState.step = 1; renderCustom(); });
    } else {
      var back2 = $('[data-cback]', wrap); if (back2) back2.addEventListener('click', function () { customState.step = 2; renderCustom(); });
      var place = $('[data-place]', wrap);
      if (place) place.addEventListener('click', function () {
        var g = CUSTOM_GARMENTS.filter(function (x) { return x.id === customState.garment; })[0];
        var order = {
          id: 'CST-' + Date.now().toString().slice(-8),
          items: [{ name: g.label + ' (Custom Stitching)', qty: 1, price: g.base }],
          total: g.base,
          date: new Date().toISOString(),
          status: 'Stitching — Pending',
          custom: { garment: g.label, fabric: customState.fabric, measurements: customState.measurements, notes: customState.notes }
        };
        orders.unshift(order); write('iik_orders', orders);
        customState = { step: 1, garment: null, measurements: {}, fabric: FABRICS[0], notes: '' };
        toast('Custom order placed — ' + order.id);
        show('orders');
      });
    }
  }

  /* ------------------- View: More ------------------- */
  function renderMore() {
    var wrap = $('#view-more');
    wrap.innerHTML =
      '<div class="page-head"><button class="back" data-back>←</button><h1>More</h1></div>' +
      '<div class="profile"><div class="avatar">II</div><div><div class="profile-name">IIK Customer</div><div class="profile-sub">Karachi, Pakistan</div></div></div>' +
      '<div class="menu">' +
        '<a class="menu-row" href="#"><span>👤</span> My Profile <span class="chev">›</span></a>' +
        '<a class="menu-row" href="#"><span>📍</span> Address Book <span class="chev">›</span></a>' +
        '<a class="menu-row" href="#"><span>🎁</span> Offers &amp; Vouchers <span class="chev">›</span></a>' +
        '<a class="menu-row" href="#"><span>💬</span> Help &amp; Support <span class="chev">›</span></a>' +
        '<a class="menu-row" href="#"><span>⚙️</span> Settings <span class="chev">›</span></a>' +
        '<a class="menu-row" href="#"><span>ℹ️</span> About IIK <span class="chev">›</span></a>' +
      '</div>' +
      '<div class="menu"><div class="menu-row muted"><span>🪡</span> IIK — Stitching Your Style · v1.0</div></div>';
    $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('home'); }); });
  }

  /* ------------------- Toast + badges ------------------- */
  var toastEl, tTimer;
  function toast(msg) {
    if (!toastEl) toastEl = $('#toast');
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(tTimer); tTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  }
  function syncBadges() {
    var c = $('#cartCount');
    if (c) { c.textContent = cartCount(); c.style.display = cartCount() ? '' : 'none'; }
  }

  /* ------------------- Init ------------------- */
  var heartSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20s-7-4.4-9.3-8.6C1 8.5 3 5 6.3 5c2 0 3.4 1.1 4.2 2.4.8-1.3 2.2-2.4 4.2-2.4C18 5 20 8.5 18.3 11.4 16 15.6 12 20 12 20z"/></svg>';
  var cartSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h7.7a1.5 1.5 0 0 0 1.5-1.2L20 8H6"/><circle cx="9.5" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>';

  window.Store = {
    PRODUCTS: PRODUCTS, CATEGORIES: CATEGORIES,
    show: show, toast: toast, syncBadges: syncBadges, cartCount: cartCount, cartTotal: cartTotal,
    addToCart: addToCart, setQty: setQty, toggleFav: toggleFav, isFav: isFav, placeOrder: placeOrder
  };

  function boot() {
    // bottom nav
    $all('.nav-item[data-view]').forEach(function (n) {
      n.addEventListener('click', function (e) { e.preventDefault(); show(n.getAttribute('data-view')); });
    });
    // header cart button
    var cartBtn = $('#cartBtn');
    if (cartBtn) cartBtn.addEventListener('click', function () { show('cart'); });
    var accountBtn = $('#accountBtn');
    if (accountBtn) accountBtn.addEventListener('click', function () { show('more'); });
    // search
    var search = $('#searchInput');
    if (search) search.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && search.value.trim()) { toast('Searching: ' + search.value.trim()); }
    });
    show('home');
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
})();
