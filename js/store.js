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

  function pimg(id) { return 'https://images.pexels.com/photos/' + id + '/pexels-photo-' + id + '.jpeg?auto=compress&cs=tinysrgb&w=600'; }

  var PRODUCTS = [
    { id: 'pc1', name: 'Premium Pant Coat', cat: 'pantcoat', price: 18500, badge: 'bestseller', emoji: '🤵', tone: 'm-navy', img: pimg(3755706), desc: 'Two-piece premium pant coat in a rich navy finish, tailored for a sharp, formal silhouette.' },
    { id: 'pc2', name: 'Royal Blue Pant Coat', cat: 'pantcoat', price: 16000, emoji: '🤵', tone: 'm-navy', img: pimg(1183917), desc: 'A royal-blue pant coat with a clean single-breast cut and structured shoulders.' },
    { id: 'pc3', name: 'Double-Breasted Suit', cat: 'pantcoat', price: 21000, badge: 'best', emoji: '🤵', tone: 'm-dark', img: pimg(3755706), desc: 'Statement double-breasted suit with a tailored waist for a commanding look.' },
    { id: 'sh1', name: 'Formal Shirt', cat: 'shirt', price: 2800, old: 3500, badge: 'off', emoji: '👔', tone: 'm-blue', img: pimg(2294342), desc: 'Crisp formal shirt in premium cotton with a classic collar and French placket.' },
    { id: 'sh2', name: 'Casual Shirt', cat: 'shirt', price: 2200, emoji: '👔', tone: 'm-blue', img: pimg(297933), desc: 'Soft-breathing casual shirt for everyday wear, cut for comfort.' },
    { id: 'sh3', name: 'Executive Shirt', cat: 'shirt', price: 3000, emoji: '👔', tone: 'm-white', img: pimg(2294342), desc: 'Executive dress shirt with a modern slim fit and wrinkle-resistant finish.' },
    { id: 'tr1', name: 'Classic Trouser', cat: 'trouser', price: 3400, old: 4000, badge: 'off', emoji: '👖', tone: 'm-tan', img: pimg(7129355), desc: 'Classic straight-leg trouser in a durable, comfortable weave.' },
    { id: 'tr2', name: 'Slim-Fit Trouser', cat: 'trouser', price: 3800, emoji: '👖', tone: 'm-tan', img: pimg(5859629), desc: 'Slim-fit trouser with a modern taper and subtle stretch.' },
    { id: 'sk1', name: 'Elegant Shalwar Kameez', cat: 'shalwar', price: 5500, emoji: '🥻', tone: 'm-green', img: pimg(40704344), desc: 'Elegant shalwar kameez with a refined neckline and tailored drape.' },
    { id: 'sk2', name: 'Premium Shalwar Kameez', cat: 'shalwar', price: 6500, emoji: '🥻', tone: 'm-green', img: pimg(33952751), desc: 'Premium shalwar kameez in a rich, breathable fabric for special occasions.' },
    { id: 'ku1', name: 'Classic Kurta', cat: 'kurta', price: 4000, emoji: '🧥', tone: 'm-navy', img: pimg(33952751), desc: 'Classic kurta with a comfortable fit and understated detailing.' },
    { id: 'wa1', name: 'Navy Waistcoat', cat: 'waistcoat', price: 4500, emoji: '🦺', tone: 'm-dark', img: pimg(35491621), desc: 'Tailored navy waistcoat to complete a formal three-piece ensemble.' },
    { id: 'wa2', name: 'Tweed Waistcoat', cat: 'waistcoat', price: 5800, emoji: '🦺', tone: 'm-tan', img: pimg(1183917), desc: 'Heritage tweed waistcoat with a timeless, warm finish.' }
  ];

  /* ------------------- State (localStorage) ------------------- */
  function read(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var cart = read('iik_cart', {});        // { id: qty }
  var favs = read('iik_favs', []);        // [id]
  var orders = read('iik_orders', []);    // [{ id, items:[{name,qty,price}], total, date, status }]
  var accounts = read('iik_accounts', []); // [{phone, password, name}]
  var session = read('iik_session', null); // {role:'customer'|'staff', phone, name}
  var loginState = { role: 'customer', tab: 'signin', after: null };
  var cartDelivery = { method: 'home', address: '' }; // 'home' | 'shop'

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
  function placeOrder(delivery) {
    var items = cartItems();
    if (!items.length) return null;
    var fee = delivery && delivery.method === 'home' ? 200 : 0;
    var order = {
      id: 'ORD-' + Date.now().toString().slice(-8),
      items: items.map(function (it) { return { name: it.product.name, qty: it.qty, price: it.product.price }; }),
      total: cartTotal() + fee,
      delivery: delivery || null,
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
  var customState = { step: 1, garment: null, measurements: {}, fabric: FABRICS[0], notes: '', name: '', phone: '', measMode: 'self', address: '' };

  /* Owner-side: customer measurement profiles */
  var DESK_FIELDS = [
    ['chest', 'Chest (in)'], ['waist', 'Waist (in)'], ['hip', 'Hip (in)'],
    ['shoulder', 'Shoulder (in)'], ['sleeve', 'Sleeve (in)'], ['neck', 'Neck (in)'],
    ['coatLength', 'Coat Length (in)'], ['shirtLength', 'Shirt Length (in)'], ['trouserLength', 'Trouser Length (in)']
  ];
  var customers = read('iik_customers', []); // [{id,name,phone,measurements:{},updatedAt}]
  var deskState = { view: 'list', customerId: null };

  function upsertCustomer(name, phone, measurements) {
    name = (name || '').trim();
    if (!name) return null;
    var c = customers.filter(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })[0];
    if (!c) { c = { id: 'CUST-' + Date.now().toString().slice(-6), name: name, phone: '', measurements: {}, updatedAt: Date.now() }; customers.push(c); }
    if (phone) c.phone = phone;
    Object.keys(measurements || {}).forEach(function (k) { if (measurements[k]) c.measurements[k] = measurements[k]; });
    c.updatedAt = Date.now();
    write('iik_customers', customers);
    return c;
  }

  /* Manager-side: photo overrides for products + category thumbnails */
  var photoOverrides = read('iik_photos', {});
  function getPhoto(key, fallback) { return photoOverrides[key] || fallback; }
  function setPhoto(key, url) { if (url) { photoOverrides[key] = url; } else { delete photoOverrides[key]; } write('iik_photos', photoOverrides); }

  /* Manager-side: catalog (garments / styles / fabrics) with price + stock */
  var garments = read('iik_garments', [
    { id: 'g1', name: "Boys' Kurta", cat: 'Children', price: 0 },
    { id: 'g2', name: "Boys' Shalwar Kameez", cat: 'Children', price: 0 },
    { id: 'g3', name: "Boys' Trousers", cat: 'Children', price: 0 },
    { id: 'g4', name: 'Kurta', cat: 'Men', price: 0 },
    { id: 'g5', name: 'Shirt', cat: 'Men', price: 0 },
    { id: 'g6', name: 'Shalwar Kameez', cat: 'Men', price: 0 },
    { id: 'g7', name: 'Suit (2-piece)', cat: 'Men', price: 0 },
    { id: 'g8', name: 'Trousers', cat: 'Men', price: 0 }
  ]);
  var styles = read('iik_styles', [
    { id: 's1', name: 'Band Collar', price: 300 },
    { id: 's2', name: 'Standard', price: 0 },
    { id: 's3', name: 'Embroidered', price: 1000 }
  ]);
  var fabrics = read('iik_fabrics', [
    { id: 'f1', name: 'Cotton (Summer)', price: 1800, stock: 60 },
    { id: 'f2', name: 'Latha', price: 1500, stock: 80 },
    { id: 'f3', name: 'Wash & Wear (Winter)', price: 2500, stock: 40 }
  ]);
  var catState = { tab: 'garments', edit: null };
  function saveGarments() { write('iik_garments', garments); }
  function saveStyles() { write('iik_styles', styles); }
  function saveFabrics() { write('iik_fabrics', fabrics); }

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
    if (name === 'login') renderLogin();
    if (name === 'manager') { renderManager(); }
    if (name === 'desk') { managerState.tab = 'customers'; renderManager(); }
    if (name === 'photos') { managerState.tab = 'catalog'; renderManager(); }
    if (name === 'product') renderProduct(opts && opts.id);
    // bottom nav active state
    $all('.nav-item').forEach(function (n) {
      n.classList.toggle('on', n.getAttribute('data-view') === name);
    });
    // search bar only on home; hide top bar + bottom nav on login
    $('.search-wrap').style.display = name === 'home' ? '' : 'none';
    $('.topbar').style.display = name === 'login' ? 'none' : '';
    $('.bottomnav').style.display = name === 'login' ? 'none' : '';
    window.scrollTo(0, 0);
  }

  /* ------------------- View: Home ------------------- */
  function renderHome() {
    // categories chips
    var chips = $('#home-chips');
    if (chips) {
      chips.innerHTML = CATEGORIES.map(function (c) {
        var ov = getPhoto('cat:' + c.id, null);
        var thumb = ov ? '<img class="chip-img" src="' + ov + '">' : c.emoji;
        return '<a class="chip" href="#" data-cat="' + c.id + '">' +
          '<span class="thumb ' + c.tone + '">' + thumb + '</span>' +
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
        '<span class="ph">' + p.emoji + '</span>' +
        '<img class="ph-img" src="' + getPhoto(p.id, p.img) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.remove()">' +
      '</div>' +
      '<div class="body"><div class="name">' + esc(p.name) + '</div>' +
        '<div class="price-row"><span class="price"><span class="cur">PKR</span> ' + p.price.toLocaleString('en-PK') + '</span>' + old + '</div>' +
        '<div class="card-btns">' +
          '<button class="add-cart ghost" data-custom="' + p.cat + '">Customize</button>' +
          '<button class="add-cart" data-add="' + p.id + '">' + cartSvg + ' Add to Cart</button>' +
        '</div>' +
      '</div></article>';
  }

  function wireCards(root) {
    $all('[data-id]', root).forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-add]') || e.target.closest('[data-wish]') || e.target.closest('[data-custom]')) return;
        show('product', { id: card.getAttribute('data-id') });
      });
    });
    $all('[data-add]', root).forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); addToCart(b.getAttribute('data-add')); toast('Added to cart'); });
    });
    $all('[data-custom]', root).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        customState.garment = b.getAttribute('data-custom');
        customState.measurements = {}; customState.step = 2;
        show('custom');
      });
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
      '<div class="detail-media ' + p.tone + '"><span class="ph-big">' + p.emoji + '</span><img class="ph-img" src="' + getPhoto(p.id, p.img) + '" alt="' + esc(p.name) + '" onerror="this.remove()"></div>' +
      '<div class="detail-body">' +
        '<div class="detail-name">' + esc(p.name) + '</div>' +
        '<div class="detail-cat">' + esc(catLabel(p.cat)) + '</div>' +
        '<div class="detail-price"><span class="price"><span class="cur">PKR</span> ' + p.price.toLocaleString('en-PK') + '</span>' + (p.old ? '<span class="old">' + money(p.old) + '</span>' : '') + '</div>' +
        '<p class="detail-desc">' + esc(p.desc) + '</p>' +
        '<button class="btn-primary" data-detail-add="' + p.id + '">' + cartSvg + ' Add to Cart</button>' +
        '<button class="btn-ghost" data-detail-customize="' + p.cat + '">✂️ Customize this design</button>' +
        '<button class="btn-ghost" data-detail-fav="' + p.id + '">' + heartSvg + ' ' + (isFav(p.id) ? 'Remove from Favorites' : 'Add to Favorites') + '</button>' +
      '</div>';
    $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { history.length > 1 ? history.back() : show('home'); }); });
    var add = $('[data-detail-add]', wrap);
    add.addEventListener('click', function () { addToCart(p.id); toast('Added to cart'); });
    var cust = $('[data-detail-customize]', wrap);
    if (cust) cust.addEventListener('click', function () { customState.garment = p.cat; customState.measurements = {}; customState.step = 2; show('custom'); });
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
    var fee = cartDelivery.method === 'home' ? 200 : 0;
    var authHint = (!session || session.role !== 'customer')
      ? '<div class="cart-auth-hint">🔒 <b>Sign in to check out</b> — your order will be saved to your account.</div>'
      : '';
    var delivery = '<div class="card" style="margin:12px 14px"><div class="card-title">Delivery</div>' +
      '<div class="measmodes" style="padding:0">' +
        '<button class="mchip ' + (cartDelivery.method === 'home' ? 'on' : '') + '" data-delmode="home">🛵 Home delivery · Rs. 200</button>' +
        '<button class="mchip ' + (cartDelivery.method === 'shop' ? 'on' : '') + '" data-delmode="shop">🏪 Pick up at shop · Free</button>' +
      '</div>' +
      (cartDelivery.method === 'home' ? '<label class="mf" style="margin-top:10px"><span>Delivery address</span><input type="text" data-deladdr value="' + esc(cartDelivery.address) + '" placeholder="House #, street, area, city"></label>' : '') +
      '</div>';
    wrap.innerHTML = head + '<div class="cart-list">' + rows + '</div>' + delivery +
      '<div class="cart-summary"><div class="sum-row"><span>Items total</span><b>' + money(cartTotal()) + '</b></div>' +
      (fee ? '<div class="sum-row"><span>Delivery</span><b>' + money(fee) + '</b></div>' : '') +
      '<div class="sum-row total"><span>Total</span><b>' + money(cartTotal() + fee) + '</b></div>' +
      authHint +
      '<button class="btn-primary" data-checkout>' + cartSvg + ' Checkout</button></div>';
    $all('[data-delmode]', wrap).forEach(function (b) { b.addEventListener('click', function () { cartDelivery.method = b.getAttribute('data-delmode'); renderCart(); }); });
    var deladdr = $('[data-deladdr]', wrap);
    if (deladdr) deladdr.addEventListener('input', function () { cartDelivery.address = deladdr.value; });
    $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('home'); }); });
    $all('.cart-row', wrap).forEach(function (row) {
      var id = row.getAttribute('data-id');
      $('[data-inc]', row).addEventListener('click', function () { setQty(id, (cart[id] || 0) + 1); renderCart(); });
      $('[data-dec]', row).addEventListener('click', function () { setQty(id, (cart[id] || 0) - 1); renderCart(); });
      $('[data-rm]', row).addEventListener('click', function () { setQty(id, 0); renderCart(); });
    });
    var co = $('[data-checkout]', wrap);
    if (co) co.addEventListener('click', function () {
      if (cartDelivery.method === 'home' && !(cartDelivery.address || '').trim()) { toast('Enter your delivery address'); return; }
      if (!session || session.role !== 'customer') {
        loginState.after = 'checkout'; loginState.role = 'customer'; loginState.tab = 'signin';
        toast('Sign in to continue'); show('login'); return;
      }
      var o = placeOrder(cartDelivery);
      if (o) { toast('Order placed — ' + o.id); cartDelivery = { method: 'home', address: '' }; show('orders'); }
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
      var measBlock;
      if (customState.measMode === 'shop') {
        measBlock = '<div class="meas-note ok">📏 Visit our shop — our tailor will measure you for free.</div>';
      } else if (customState.measMode === 'rider') {
        measBlock = '<div class="meas-note ok">🛵 Our rider will come to your place and take your measurements.</div>' +
          '<div class="mf-grid"><label class="mf" style="grid-column:1 / -1"><span>Address for rider visit</span><input type="text" data-addr value="' + esc(customState.address || '') + '" placeholder="House #, street, area, city"></label></div>';
      } else {
        var fields = g.fields.map(function (f) {
          return '<label class="mf"><span>' + esc(f[1]) + '</span><input type="number" inputmode="decimal" step="0.5" min="0" placeholder="—" data-f="' + f[0] + '" value="' + (customState.measurements[f[0]] || '') + '"></label>';
        }).join('');
        var fabrics = FABRICS.map(function (f) {
          return '<button class="fchip ' + (customState.fabric === f ? 'on' : '') + '" data-fab="' + esc(f) + '">' + esc(f) + '</button>';
        }).join('');
        measBlock = '<div class="mf-grid">' + fields + '</div>' +
          '<div class="custom-sub">Fabric</div><div class="fchips">' + fabrics + '</div>';
      }
      body = steps +
        '<div class="custom-garment-head"><span class="cg-emoji big">' + g.emoji + '</span><b>' + esc(g.label) + '</b></div>' +
        '<div class="custom-sub">How should we take your measurements?</div>' +
        '<div class="measmodes">' +
          '<button class="mchip ' + (customState.measMode === 'self' ? 'on' : '') + '" data-measmode="self">📏 I have them</button>' +
          '<button class="mchip ' + (customState.measMode === 'shop' ? 'on' : '') + '" data-measmode="shop">🏪 Visit shop</button>' +
          '<button class="mchip ' + (customState.measMode === 'rider' ? 'on' : '') + '" data-measmode="rider">🛵 Rider to you</button>' +
        '</div>' +
        measBlock +
        '<div class="custom-sub">Your details</div>' +
        '<div class="mf-grid">' +
          '<label class="mf"><span>Name</span><input type="text" data-cname value="' + esc(customState.name) + '" placeholder="Full name"></label>' +
          '<label class="mf"><span>Phone</span><input type="tel" data-cphone value="' + esc(customState.phone) + '" placeholder="03xx-xxxxxxx"></label>' +
        '</div>' +
        '<label class="mf notes"><span>Notes / instructions</span><textarea rows="3" data-notes placeholder="e.g. 2-inch cuff, side vents…">' + esc(customState.notes) + '</textarea></label>' +
        '<button class="btn-primary" data-cnext>Review Order</button>' +
        '<button class="btn-ghost" data-cback>← Change garment</button>';
    } else {
      var g2 = CUSTOM_GARMENTS.filter(function (x) { return x.id === customState.garment; })[0];
      var meas;
      if (customState.measMode === 'shop') {
        meas = '<div class="oi"><span>Measurements</span><span>At shop</span></div>';
      } else if (customState.measMode === 'rider') {
        meas = '<div class="oi"><span>Measurements</span><span>Rider visit' + (customState.address ? ' — ' + esc(customState.address) : '') + '</span></div>';
      } else {
        meas = Object.keys(customState.measurements).filter(function (k) { return customState.measurements[k]; })
          .map(function (k) { var f = g2.fields.filter(function (x) { return x[0] === k; })[0]; return '<div class="oi"><span>' + esc(f ? f[1] : k) + '</span><span>' + esc(customState.measurements[k]) + ' in</span></div>'; }).join('') || '<div class="oi"><span>Measurements</span><span>—</span></div>';
      }
      body = steps +
        '<div class="review-card"><div class="order-top"><b>' + esc(g2.label) + ' (Custom)</b><span class="order-status">Estimate</span></div>' +
        '<div class="oi"><span>Fabric</span><span>' + esc(customState.fabric) + '</span></div>' +
        (customState.name ? '<div class="oi"><span>Customer</span><span>' + esc(customState.name) + '</span></div>' : '') +
        (customState.notes ? '<div class="oi"><span>Notes</span><span>' + esc(customState.notes) + '</span></div>' : '') +
        '<div class="order-items">' + meas + '</div>' +
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
      $all('.mf input[data-f]', wrap).forEach(function (i) { i.addEventListener('input', function () { customState.measurements[i.getAttribute('data-f')] = i.value; }); });
      var cname = $('[data-cname]', wrap); if (cname) cname.addEventListener('input', function () { customState.name = cname.value; });
      var cphone = $('[data-cphone]', wrap); if (cphone) cphone.addEventListener('input', function () { customState.phone = cphone.value; });
      $all('[data-measmode]', wrap).forEach(function (b) { b.addEventListener('click', function () { customState.measMode = b.getAttribute('data-measmode'); renderCustom(); }); });
      var addr = $('[data-addr]', wrap); if (addr) addr.addEventListener('input', function () { customState.address = addr.value; });
      $all('[data-fab]', wrap).forEach(function (f) { f.addEventListener('click', function () { customState.fabric = f.getAttribute('data-fab'); renderCustom(); }); });
      var notes = $('[data-notes]', wrap); if (notes) notes.addEventListener('input', function () { customState.notes = notes.value; });
      var next = $('[data-cnext]', wrap); if (next) next.addEventListener('click', function () { customState.step = 3; renderCustom(); });
      var back = $('[data-cback]', wrap); if (back) back.addEventListener('click', function () { customState.step = 1; renderCustom(); });
    } else {
      var back2 = $('[data-cback]', wrap); if (back2) back2.addEventListener('click', function () { customState.step = 2; renderCustom(); });
      var place = $('[data-place]', wrap);
      if (place) place.addEventListener('click', function () {
        var g = CUSTOM_GARMENTS.filter(function (x) { return x.id === customState.garment; })[0];
        if (customState.measMode === 'rider' && !(customState.address || '').trim()) { toast('Enter your address for the rider visit'); return; }
        upsertCustomer(customState.name, customState.phone, customState.measMode === 'self' ? customState.measurements : {});
        var order = {
          id: 'CST-' + Date.now().toString().slice(-8),
          items: [{ name: g.label + ' (Custom Stitching)', qty: 1, price: g.base }],
          total: g.base,
          date: new Date().toISOString(),
          status: 'Stitching — Pending',
          custom: { garment: g.label, fabric: customState.fabric, measurements: customState.measurements, notes: customState.notes, measMode: customState.measMode, address: customState.address, customer: customState.name }
        };
        orders.unshift(order); write('iik_orders', orders);
        customState = { step: 1, garment: null, measurements: {}, fabric: FABRICS[0], notes: '', name: '', phone: '', measMode: 'self', address: '' };
        toast('Custom order placed — ' + order.id);
        show('orders');
      });
    }
  }

  /* ------------------- View: Owner Measurement Desk ------------------- */
  function renderDesk() {
    var wrap = $('#view-desk');
    var head = '<div class="page-head"><button class="back" data-back>←</button><h1>Measurement Desk</h1></div>';
    if (deskState.view === 'list') {
      if (!customers.length) {
        wrap.innerHTML = head + '<div class="empty"><div class="empty-ico">📏</div><p>No customers yet</p><p class="sub">Add a customer, or they\'ll appear here when they place a custom order.</p><button class="btn-primary" data-addcust>+ Add Customer</button></div>';
        $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('more'); }); });
        var add = $('[data-addcust]', wrap); if (add) add.addEventListener('click', function () { deskState.view = 'edit'; deskState.customerId = null; renderDesk(); });
        return;
      }
      var rows = customers.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).map(function (c) {
        var n = Object.keys(c.measurements || {}).length;
        return '<button class="cust-row" data-cust="' + c.id + '"><span class="avatar sm">' + esc((c.name || '?').slice(0, 2).toUpperCase()) + '</span><span class="cust-info"><b>' + esc(c.name) + '</b><span>' + (c.phone || '—') + '</span></span><span class="cust-meta">' + n + ' meas.</span><span class="chev">›</span></button>';
      }).join('');
      wrap.innerHTML = head + '<div class="cust-list">' + rows + '</div><div class="pad"><button class="btn-primary" data-addcust>+ Add Customer</button></div>';
      $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('more'); }); });
      $all('[data-cust]', wrap).forEach(function (b) { b.addEventListener('click', function () { deskState.customerId = b.getAttribute('data-cust'); deskState.view = 'edit'; renderDesk(); }); });
      var add = $('[data-addcust]', wrap); if (add) add.addEventListener('click', function () { deskState.view = 'edit'; deskState.customerId = null; renderDesk(); });
    } else {
      var c = customers.filter(function (x) { return x.id === deskState.customerId; })[0] || { id: null, name: '', phone: '', measurements: {} };
      var fields = DESK_FIELDS.map(function (f) {
        return '<label class="mf"><span>' + esc(f[1]) + '</span><input type="number" inputmode="decimal" step="0.5" min="0" placeholder="—" data-f="' + f[0] + '" value="' + (c.measurements[f[0]] || '') + '"></label>';
      }).join('');
      wrap.innerHTML = head +
        '<div class="cust-form"><div class="mf-grid">' +
          '<label class="mf"><span>Name</span><input type="text" data-fname value="' + esc(c.name) + '" placeholder="Full name"></label>' +
          '<label class="mf"><span>Phone</span><input type="tel" data-fphone value="' + esc(c.phone) + '" placeholder="03xx-xxxxxxx"></label>' +
        '</div>' +
        '<div class="custom-sub">Measurements (taken at shop)</div>' +
        '<div class="mf-grid">' + fields + '</div></div>' +
        '<button class="btn-primary" data-savecust>Save Profile</button>' +
        '<button class="btn-ghost" data-backlist>← Back to list</button>';
      $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('more'); }); });
      var backlist = $('[data-backlist]', wrap); if (backlist) backlist.addEventListener('click', function () { deskState.view = 'list'; renderDesk(); });
      var fname = $('[data-fname]', wrap), fphone = $('[data-fphone]', wrap);
      var save = $('[data-savecust]', wrap);
      if (save) save.addEventListener('click', function () {
        var name = (fname ? fname.value : '').trim();
        if (!name) { toast('Enter a customer name'); return; }
        var meas = {};
        $all('.mf input[data-f]', wrap).forEach(function (i) { if (i.value) meas[i.getAttribute('data-f')] = i.value; });
        upsertCustomer(name, fphone ? fphone.value : '', meas);
        toast('Saved ' + name + '\'s measurements');
        deskState.view = 'list'; deskState.customerId = null; renderDesk();
      });
    }
  }

  /* ------------------- Owner / Manager dashboard ------------------- */
  var managerState = { tab: 'dashboard', orderId: null, customerId: null, query: '', cq: '', orderFilter: 'all' };

  function mgStat(label, value, cls) { return '<div class="stat ' + (cls || '') + '"><span class="stat-num">' + value + '</span><span class="stat-label">' + label + '</span></div>'; }
  function orderCustomer(o) { return (o.custom && o.custom.customer) || 'Walk-in Customer'; }
  function orderInits(o) { return esc(orderCustomer(o).slice(0, 2).toUpperCase()); }
  function orderBadge(o) {
    var bal = (o.total || 0) - (o.paid || 0);
    if (bal > 0) return '<span class="ord-badge warn">Balance due</span>';
    var s = o.status || 'Confirmed';
    var cls = /stitch/i.test(s) ? 'stitch' : (/pending/i.test(s) ? 'warn' : 'ok');
    return '<span class="ord-badge ' + cls + '">' + esc(s) + '</span>';
  }

  function mgDashboard() {
    var q = (managerState.query || '').toLowerCase();
    var list = orders.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).filter(function (o) {
      if (!q) return true;
      return (orderCustomer(o) + ' ' + o.id + ' ' + (o.status || '')).toLowerCase().indexOf(q) !== -1;
    });
    var inStitch = orders.filter(function (o) { return /stitch/i.test(o.status || ''); }).length;
    var isNew = orders.filter(function (o) { return !/stitch/i.test(o.status || ''); }).length;
    var outstanding = orders.reduce(function (s, o) { return s + (o.total || 0) - (o.paid || 0); }, 0);
    var revenue = orders.reduce(function (s, o) { return s + (o.paid || 0); }, 0);
    var rows = list.map(function (o) {
      return '<button class="ord-row" data-oid="' + o.id + '"><span class="avatar sm">' + orderInits(o) + '</span><span class="ord-info"><b>' + esc(orderCustomer(o)) + '</b><span>' + esc(o.id) + ' · Rs. ' + (o.total || 0).toLocaleString() + '</span></span>' + orderBadge(o) + '</button>';
    }).join('');
    return '<div class="stat-grid">' +
        mgStat('New', isNew) + mgStat('Overdue', 0, 'red') +
        mgStat('Due soon', 0, 'red') + mgStat('In stitching', inStitch, 'amber') +
        mgStat('Revenue (PKR)', revenue, 'green') + mgStat('Outstanding (PKR)', outstanding, 'red') +
      '</div>' +
      '<div class="sec-title">ALL ORDERS</div>' +
      '<label class="search mg"><input type="search" data-q placeholder="Search name, phone, order no…" value="' + esc(managerState.query) + '"></label>' +
      '<div class="ord-list">' + (rows || '<div class="empty small">No orders yet</div>') + '</div>';
  }

  function mgOrdersList() {
    var flt = managerState.orderFilter || 'all';
    var q = (managerState.query || '').toLowerCase();
    var pills = [['all', 'All orders'], ['overdue', 'Overdue'], ['stitch', 'In stitching'], ['ready', 'Ready for Delivery'], ['done', 'Completed']].map(function (p) {
      return '<button class="pill-btn ' + (flt === p[0] ? 'on' : '') + '" data-ofilt="' + p[0] + '">' + p[1] + '</button>';
    }).join('');
    var list = orders.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).filter(function (o) {
      var s = o.status || '';
      if (flt === 'stitch' && !/stitch/i.test(s)) return false;
      if (flt === 'ready' && !/ready/i.test(s)) return false;
      if (flt === 'done' && !/(delivered|completed)/i.test(s)) return false;
      if (flt === 'overdue') return false;
      if (q && (orderCustomer(o) + ' ' + o.id + ' ' + s).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var rows = list.map(function (o) {
      return '<button class="ord-row" data-oid="' + o.id + '"><span class="avatar sm">' + orderInits(o) + '</span><span class="ord-info"><b>' + esc(orderCustomer(o)) + '</b><span>' + esc(o.id) + ' · Rs. ' + (o.total || 0).toLocaleString() + '</span></span>' + orderBadge(o) + '</button>';
    }).join('');
    return '<div class="sec-title">ALL ORDERS</div><div class="ofilters">' + pills + '</div>' +
      '<label class="search mg"><input type="search" data-q placeholder="Search name, phone, order no…" value="' + esc(managerState.query) + '"></label>' +
      '<div class="ord-list">' + (rows || '<div class="empty small">No matching orders</div>') + '</div>';
  }

  function mgOrderDetail() {
    var o = orders.filter(function (x) { return x.id === managerState.orderId; })[0];
    if (!o) return mgOrdersList();
    var c = customers.filter(function (x) { return x.name.toLowerCase() === orderCustomer(o).toLowerCase(); })[0];
    var date = new Date(o.date);
    var items = o.items.map(function (it) { return '<div class="oi"><span>' + esc(it.name) + ' × ' + it.qty + '</span><span>Rs. ' + (it.price * it.qty).toLocaleString() + '</span></div>'; }).join('');
    var final = o.total || 0, paid = o.paid || 0, bal = final - paid;
    var meas;
    var mPending = o.custom && (o.custom.measMode === 'shop' || o.custom.measMode === 'rider' || !Object.keys(o.custom.measurements || {}).length);
    if (o.custom && mPending) {
      var mLabel = o.custom.measMode === 'rider' ? 'Rider visit — measurements pending' : 'Measurements pending at shop';
      meas = '<div class="meas-hist"><div class="oi"><span>' + esc((o.items[0] || {}).name || '') + '</span><span class="pill warn">' + mLabel + '</span></div><button class="btn-small" data-addmeas>Add measurements</button></div>';
    } else if (o.custom) {
      meas = '<div class="meas-hist"><div class="oi"><span>' + esc((o.items[0] || {}).name || '') + '</span><span class="pill ok">Measurements recorded</span></div></div>';
    } else {
      meas = '<div class="meas-hist"><div class="oi"><span>Ready-made item</span><span class="pill">—</span></div></div>';
    }
    return '<div class="mg-order-head"><button class="back sm" data-backlist>← Back</button><b>' + esc(o.id) + '</b></div>' +
      '<div class="cust-card"><span class="avatar">' + orderInits(o) + '</span><span class="cust-info"><b>' + esc(orderCustomer(o)) + '</b><span>' + esc((c && c.phone) || '') + '</span></span><button class="btn-small" data-custprofile>Customer profile</button></div>' +
      '<div class="kv-card">' +
        '<div class="kv"><span>Created</span><b>' + date.toLocaleDateString() + '</b></div>' +
        '<div class="kv"><span>Promised delivery</span><b>' + new Date(date.getTime() + 8 * 864e5).toLocaleDateString() + '</b></div>' +
        '<div class="kv"><span>Status</span><b>' + esc(o.status || 'Stitching') + '</b></div>' +
        '<div class="kv"><span>Assigned to</span><b>' + esc(o.assigned || '—') + '</b></div>' +
      '</div>' +
      '<div class="card"><div class="card-title">Progress</div>' +
        '<label class="mf"><span>Status</span><select data-status>' +
          ['New', 'Stitching', 'Ready', 'Delivered'].map(function (s) { return '<option ' + ((o.status || '') === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
        '<label class="mf"><span>Assigned to</span><select data-assigned><option value="">—</option><option ' + ((o.assigned || '') === 'Tailor A' ? 'selected' : '') + '>Tailor A</option><option ' + ((o.assigned || '') === 'Tailor B' ? 'selected' : '') + '>Tailor B</option></select></label>' +
        '<label class="mf"><span>Tailor notes</span><textarea rows="3" data-notes placeholder="Notes for the tailor…">' + esc(o.notes || '') + '</textarea></label>' +
        '<div class="row2"><button class="btn-small solid" data-save>Save changes</button><button class="btn-small" data-next>Next →</button></div>' +
      '</div>' +
      '<div class="card"><div class="card-title">Items</div><div class="order-items">' + items + '</div>' +
        '<label class="mf"><span>Final total</span><input type="number" data-total value="' + final + '"></label>' +
        '<div class="kv"><span>Estimated total</span><b>Rs. ' + (o.total || 0).toLocaleString() + '</b></div>' +
        (o.delivery ? '<div class="kv"><span>Delivery</span><b>' + esc(o.delivery.method === 'home' ? 'Home delivery · Rs. 200' : 'Pick up at shop · Free') + '</b></div>' : '') +
        (o.delivery && o.delivery.address ? '<div class="kv"><span>Address</span><b>' + esc(o.delivery.address) + '</b></div>' : '') +
        '<div class="kv"><span>Paid</span><b>Rs. ' + paid.toLocaleString() + '</b></div>' +
        '<div class="kv"><span>Balance</span><b class="bal">Rs. ' + bal.toLocaleString() + '</b></div>' +
      '</div>' +
      '<div class="card"><div class="card-title">Measurement history</div>' + meas + '</div>' +
      '<div class="card"><div class="card-title">Payments</div>' +
        '<label class="mf"><span>Amount received (PKR)</span><input type="number" data-paid value="' + paid + '"></label>' +
        '<button class="btn-primary" data-savepay>Record payment</button>' +
      '</div>';
  }

  function mgCustomersList() {
    var q = (managerState.cq || '').toLowerCase();
    var list = customers.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).filter(function (c) {
      if (!q) return true;
      return (c.name + ' ' + (c.phone || '')).toLowerCase().indexOf(q) !== -1;
    });
    var rows = list.map(function (c) {
      var n = Object.keys(c.measurements || {}).length;
      var oc = orders.filter(function (o) { return ((o.custom && o.custom.customer) || '').toLowerCase() === c.name.toLowerCase(); }).length;
      return '<button class="cust-row" data-cust="' + c.id + '"><span class="avatar sm">' + esc((c.name || '?').slice(0, 2).toUpperCase()) + '</span><span class="cust-info"><b>' + esc(c.name) + '</b><span>' + (c.phone || '—') + ' · ' + oc + ' orders</span></span><span class="cust-meta">' + n + ' meas.</span><span class="chev">›</span></button>';
    }).join('');
    return '<div class="pad" style="padding-bottom:10px"><button class="btn-primary" data-addcust>+ Add customer</button></div>' +
      '<label class="search mg"><input type="search" data-cq placeholder="Search name, phone, order no…" value="' + esc(managerState.cq || '') + '"></label>' +
      '<div class="cust-list">' + (rows || '<div class="empty small">No customers found</div>') + '</div>';
  }

  function mgCustomerEdit() {
    var c = customers.filter(function (x) { return x.id === managerState.customerId; })[0] || { id: null, name: '', phone: '', measurements: {} };
    var fields = DESK_FIELDS.map(function (f) {
      return '<label class="mf"><span>' + esc(f[1]) + '</span><input type="number" inputmode="decimal" step="0.5" min="0" placeholder="—" data-f="' + f[0] + '" value="' + (c.measurements[f[0]] || '') + '"></label>';
    }).join('');
    return '<div class="cust-form"><div class="mf-grid">' +
      '<label class="mf"><span>Name</span><input type="text" data-fname value="' + esc(c.name) + '" placeholder="Full name"></label>' +
      '<label class="mf"><span>Phone</span><input type="tel" data-fphone value="' + esc(c.phone) + '" placeholder="03xx-xxxxxxx"></label>' +
      '</div>' +
      '<div class="custom-sub">Measurements (taken at shop)</div>' +
      '<div class="mf-grid">' + fields + '</div></div>' +
      '<button class="btn-primary" data-savecust>Save Profile</button>' +
      '<button class="btn-ghost" data-backcust>← Back to list</button>';
  }

  function mgCatalog() {
    var tabs = [['garments', 'Garments'], ['styles', 'Styles'], ['fabrics', 'Fabrics'], ['photos', 'Photos']].map(function (t) {
      return '<button class="mtab ' + (catState.tab === t[0] ? 'on' : '') + '" data-cattab="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    var addLabel = { garments: '+ Add garment', styles: '+ Add style', fabrics: '+ Add fabric' }[catState.tab] || '';
    var list = function (arr, labelFn) {
      return '<div class="cat-list">' + arr.map(function (it) {
        return '<div class="cat-row"><div class="cat-main"><b>' + esc(it.name) + '</b><span>' + labelFn(it) + '</span></div><button class="btn-small" data-editcat="' + it.id + '">Edit</button></div>';
      }).join('') + '</div>';
    };
    var head = '<div class="mtabs sub">' + tabs + '</div>' +
      (addLabel ? '<div class="pad" style="padding-bottom:10px"><button class="btn-primary" data-addcat>' + addLabel + '</button></div>' : '');
    if (catState.tab === 'garments') {
      return head + list(garments, function (g) { return '· ' + esc(g.cat) + (g.price ? ' · Rs. ' + g.price.toLocaleString() : ''); });
    }
    if (catState.tab === 'styles') {
      return head + list(styles, function (s) { return s.price ? 'Rs. ' + s.price.toLocaleString() : '—'; });
    }
    if (catState.tab === 'fabrics') {
      return head + list(fabrics, function (f) { return (f.price ? 'Rs. ' + f.price.toLocaleString() : '—') + ' · ' + (f.stock || 0) + ' qty'; });
    }
    // Photos tab
    var prods = PRODUCTS.map(function (p) {
      return '<div class="cat-row"><div class="thumb img"><img src="' + getPhoto(p.id, p.img) + '" onerror="this.style.display=\'none\'"></div><span class="cat-name">' + esc(p.name) + '</span><button class="btn-small" data-editphoto="' + p.id + '">Edit</button></div>';
    }).join('');
    var cats = CATEGORIES.map(function (c) {
      return '<div class="cat-row"><span class="thumb">' + c.emoji + '</span><span class="cat-name">' + esc(c.label) + '</span><button class="btn-small" data-editphoto="cat:' + c.id + '">Edit</button></div>';
    }).join('');
    return head + '<div class="sec-title">Product photos</div><div class="cat-list">' + prods + '</div>' +
      '<div class="sec-title">Category thumbnails</div><div class="cat-list">' + cats + '</div>';
  }

  function openCatalogEditor(tab, id) {
    var arr = tab === 'styles' ? styles : tab === 'fabrics' ? fabrics : garments;
    var save = tab === 'styles' ? saveStyles : tab === 'fabrics' ? saveFabrics : saveGarments;
    var item = id ? arr.filter(function (x) { return x.id === id; })[0] : null;
    var isNew = !item;
    var m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="modal-box"><div class="modal-title">' + (isNew ? 'Add' : 'Edit') + ' ' + tab.slice(0, -1) + '</div>' +
      '<label class="mf"><span>Name</span><input type="text" data-n value="' + esc(item ? item.name : '') + '" placeholder="Name"></label>' +
      (tab === 'garments' ? '<label class="mf"><span>Category</span><select data-c><option ' + ((item ? item.cat : 'Men') === 'Men' ? 'selected' : '') + '>Men</option><option ' + ((item ? item.cat : '') === 'Children' ? 'selected' : '') + '>Children</option></select></label>' : '') +
      '<label class="mf"><span>Price (PKR)</span><input type="number" data-p value="' + (item && item.price ? item.price : '') + '" placeholder="0"></label>' +
      (tab === 'fabrics' ? '<label class="mf"><span>Stock (qty)</span><input type="number" data-s value="' + (item && item.stock ? item.stock : '') + '" placeholder="0"></label>' : '') +
      '<button class="btn-primary" data-saveit>Save</button>' +
      (isNew ? '' : '<button class="btn-ghost danger" data-delit>Delete</button>') +
      '<button class="btn-ghost" data-close>Cancel</button></div>';
    document.body.appendChild(m);
    function close() { m.remove(); }
    $('[data-close]', m).addEventListener('click', close);
    $('[data-saveit]', m).addEventListener('click', function () {
      var n = $('[data-n]', m).value.trim();
      if (!n) { toast('Enter a name'); return; }
      var data = { id: item ? item.id : tab.slice(0, 1) + Date.now().toString().slice(-6), name: n, price: Number($('[data-p]', m).value) || 0 };
      if (tab === 'garments') data.cat = $('[data-c]', m).value;
      if (tab === 'fabrics') data.stock = Number($('[data-s]', m).value) || 0;
      if (isNew) { arr.push(data); } else { Object.keys(data).forEach(function (k) { item[k] = data[k]; }); }
      save(); close(); toast('Saved'); renderManager();
    });
    var del = $('[data-delit]', m);
    if (del) del.addEventListener('click', function () {
      var i = arr.indexOf(item); if (i > -1) arr.splice(i, 1);
      save(); close(); toast('Deleted'); renderManager();
    });
  }

  function mgMore() {
    return '<div class="menu" style="margin-top:8px"><div class="menu-row"><span>🪡</span> IIK Tailor — Manager</div><div class="menu-row"><span>📁</span> Data saved on this device</div><div class="menu-row"><span>ℹ️</span> v1.0</div></div>';
  }

  function fileToDataUrl(file, cb) {
    var r = new FileReader();
    r.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 600, scale = Math.min(1, max / Math.max(img.width, img.height));
        var cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL('image/jpeg', 0.82));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }

  function openPhotoEditor(key) {
    var label = key.indexOf('cat:') === 0 ? 'Category thumbnail' : (product(key) || {}).name || 'Product';
    var cur = getPhoto(key, key.indexOf('cat:') === 0 ? null : (product(key) || {}).img);
    var m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="modal-box"><div class="modal-title">Update photo — ' + esc(label) + '</div>' +
      '<div class="ph-preview"><img src="' + (cur || '') + '" onerror="this.style.display=\'none\'"></div>' +
      '<label class="btn-primary filebtn">📁 Choose image…<input type="file" accept="image/*" hidden></label>' +
      '<label class="mf"><span>…or paste an image URL</span><input type="text" data-url placeholder="https://…"></label>' +
      '<button class="btn-primary" data-saveurl>Save URL</button>' +
      '<button class="btn-ghost" data-reset>Reset to default</button>' +
      '<button class="btn-ghost" data-close>Cancel</button></div>';
    document.body.appendChild(m);
    function close() { m.remove(); }
    $('[data-close]', m).addEventListener('click', close);
    $('[data-reset]', m).addEventListener('click', function () { setPhoto(key, null); close(); toast('Reset to default'); if (managerState.tab === 'catalog') renderManager(); });
    var fi = $('input[type=file]', m);
    fi.addEventListener('change', function () {
      if (!fi.files[0]) return;
      fileToDataUrl(fi.files[0], function (url) { setPhoto(key, url); close(); toast('Photo updated'); renderManager(); });
    });
    var urlInput = $('[data-url]', m);
    var su = $('[data-saveurl]', m);
    su.addEventListener('click', function () {
      var v = (urlInput.value || '').trim();
      if (!v) { toast('Enter an image URL'); return; }
      setPhoto(key, v); close(); toast('Photo updated'); renderManager();
    });
  }

  function wireManager(wrap) {
    $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('more'); }); });
    $all('[data-mtab]', wrap).forEach(function (t) {
      t.addEventListener('click', function () { managerState.tab = t.getAttribute('data-mtab'); managerState.orderId = null; managerState.customerId = null; renderManager(); });
    });
    var q = $('[data-q]', wrap);
    if (q) q.addEventListener('input', function () { managerState.query = q.value; var d = $('#view-manager'); var pos = d.scrollTop; renderManager(); });
    $all('[data-oid]', wrap).forEach(function (r) { r.addEventListener('click', function () { managerState.orderId = r.getAttribute('data-oid'); renderManager(); }); });
    var backlist = $('[data-backlist]', wrap);
    if (backlist) backlist.addEventListener('click', function () { managerState.orderId = null; renderManager(); });
    var custprofile = $('[data-custprofile]', wrap);
    if (custprofile) custprofile.addEventListener('click', function () {
      var o = orders.filter(function (x) { return x.id === managerState.orderId; })[0];
      var name = orderCustomer(o);
      var c = customers.filter(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })[0];
      if (!c) { c = upsertCustomer(name, '', {}); }
      managerState.customerId = c.id; managerState.tab = 'customers'; renderManager();
    });
    var addmeas = $('[data-addmeas]', wrap);
    if (addmeas) addmeas.addEventListener('click', function () {
      var o = orders.filter(function (x) { return x.id === managerState.orderId; })[0];
      var name = orderCustomer(o);
      var c = customers.filter(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })[0];
      if (!c) { c = upsertCustomer(name, '', {}); }
      managerState.customerId = c.id; managerState.tab = 'customers'; renderManager();
    });
    var o = orders.filter(function (x) { return x.id === managerState.orderId; })[0];
    if (o) {
      var statusSel = $('[data-status]', wrap), assignedSel = $('[data-assigned]', wrap), notes = $('[data-notes]', wrap), totalIn = $('[data-total]', wrap);
      if (statusSel) statusSel.addEventListener('change', function () { o.status = statusSel.value; write('iik_orders', orders); renderManager(); });
      if (assignedSel) assignedSel.addEventListener('change', function () { o.assigned = assignedSel.value; write('iik_orders', orders); renderManager(); });
      if (notes) notes.addEventListener('input', function () { o.notes = notes.value; write('iik_orders', orders); });
      if (totalIn) totalIn.addEventListener('input', function () { o.total = Number(totalIn.value) || 0; write('iik_orders', orders); renderManager(); });
      var save = $('[data-save]', wrap);
      if (save) save.addEventListener('click', function () { write('iik_orders', orders); toast('Order saved'); });
      var next = $('[data-next]', wrap);
      if (next) next.addEventListener('click', function () {
        var flow = ['New', 'Stitching', 'Ready', 'Delivered'];
        var i = flow.indexOf(o.status || 'New');
        o.status = flow[Math.min(i + 1, flow.length - 1)] || 'New';
        write('iik_orders', orders); renderManager(); toast('Status → ' + o.status);
      });
      var paidIn = $('[data-paid]', wrap), savepay = $('[data-savepay]', wrap);
      if (savepay) savepay.addEventListener('click', function () { o.paid = Number(paidIn ? paidIn.value : 0) || 0; write('iik_orders', orders); renderManager(); toast('Payment recorded'); });
    }
    $all('[data-cust]', wrap).forEach(function (r) { r.addEventListener('click', function () { managerState.customerId = r.getAttribute('data-cust'); renderManager(); }); });
    var addcust = $('[data-addcust]', wrap);
    if (addcust) addcust.addEventListener('click', function () { managerState.customerId = null; renderManager(); });
    var backcust = $('[data-backcust]', wrap);
    if (backcust) backcust.addEventListener('click', function () { managerState.customerId = null; renderManager(); });
    var fname = $('[data-fname]', wrap), fphone = $('[data-fphone]', wrap);
    var savecust = $('[data-savecust]', wrap);
    if (savecust) savecust.addEventListener('click', function () {
      var name = (fname ? fname.value : '').trim();
      if (!name) { toast('Enter a customer name'); return; }
      var meas = {};
      $all('.mf input[data-f]', wrap).forEach(function (i) { if (i.value) meas[i.getAttribute('data-f')] = i.value; });
      upsertCustomer(name, fphone ? fphone.value : '', meas);
      toast('Saved ' + name + '\'s measurements');
      managerState.customerId = null; renderManager();
    });
    $all('[data-editphoto]', wrap).forEach(function (b) { b.addEventListener('click', function () { openPhotoEditor(b.getAttribute('data-editphoto')); }); });
    $all('[data-ofilt]', wrap).forEach(function (b) { b.addEventListener('click', function () { managerState.orderFilter = b.getAttribute('data-ofilt'); renderManager(); }); });
    var cq = $('[data-cq]', wrap);
    if (cq) cq.addEventListener('input', function () { managerState.cq = cq.value; renderManager(); });
    $all('[data-cattab]', wrap).forEach(function (t) { t.addEventListener('click', function () { catState.tab = t.getAttribute('data-cattab'); catState.edit = null; renderManager(); }); });
    var addcat = $('[data-addcat]', wrap); if (addcat) addcat.addEventListener('click', function () { openCatalogEditor(catState.tab, null); });
    $all('[data-editcat]', wrap).forEach(function (b) { b.addEventListener('click', function () { openCatalogEditor(catState.tab, b.getAttribute('data-editcat')); }); });
  }

  function renderManager() {
    var wrap = $('#view-manager');
    var tabs = ['dashboard', 'customers', 'orders', 'catalog', 'more'].map(function (t) {
      return '<button class="mtab ' + (managerState.tab === t ? 'on' : '') + '" data-mtab="' + t + '">' + t.charAt(0).toUpperCase() + t.slice(1) + '</button>';
    }).join('');
    var inner;
    if (managerState.tab === 'dashboard') inner = mgDashboard();
    else if (managerState.tab === 'orders') inner = managerState.orderId ? mgOrderDetail() : mgOrdersList();
    else if (managerState.tab === 'customers') inner = managerState.customerId ? mgCustomerEdit() : mgCustomersList();
    else if (managerState.tab === 'catalog') inner = mgCatalog();
    else inner = mgMore();
    wrap.innerHTML = '<div class="page-head"><button class="back" data-back>←</button><h1>Owner / Manager</h1></div>' +
      '<div class="mtabs">' + tabs + '</div>' + inner;
    wireManager(wrap);
  }

  /* ------------------- Sign in (Customer / Staff) ------------------- */
  function renderLogin() {
    var wrap = $('#view-login');
    var roleTabs = '<div class="login-roles">' +
      '<button class="lrole ' + (loginState.role === 'customer' ? 'on' : '') + '" data-lrole="customer">Customer sign in</button>' +
      '<button class="lrole ' + (loginState.role === 'staff' ? 'on' : '') + '" data-lrole="staff">Staff sign in</button>' +
      '</div>';
    var body;
    if (loginState.role === 'customer') {
      var stabs = '<div class="login-subtabs">' +
        '<button class="lsub ' + (loginState.tab === 'signin' ? 'on' : '') + '" data-ltab="signin">Sign in</button>' +
        '<button class="lsub ' + (loginState.tab === 'create' ? 'on' : '') + '" data-ltab="create">Create account</button>' +
        '<button class="lsub ' + (loginState.tab === 'track' ? 'on' : '') + '" data-ltab="track">Track Order</button>' +
        '</div>';
      if (loginState.tab === 'create') {
        body = stabs + '<div class="lh">Create your account</div>' +
          '<label class="mf"><span>Full name</span><input type="text" data-lname placeholder="Your name"></label>' +
          '<label class="mf"><span>Mobile number</span><input type="tel" data-lphone placeholder="e.g. 0300 1234567"></label>' +
          '<label class="mf"><span>Password</span><input type="password" data-lpass placeholder="Password"></label>' +
          '<button class="btn-primary" data-ldo>Create account</button>' +
          '<p class="linkline">Already have an account? <button class="link" data-ltab="signin">Sign in</button></p>';
      } else if (loginState.tab === 'track') {
        body = stabs + '<div class="lh">Track your order</div>' +
          '<label class="mf"><span>Order number</span><input type="text" data-loid placeholder="e.g. SK-20261116-001"></label>' +
          '<label class="mf"><span>Mobile number</span><input type="tel" data-lphone placeholder="e.g. 0300 1234567"></label>' +
          '<button class="btn-primary" data-ltrack>Track Order</button>';
      } else if (loginState.tab === 'reset') {
        body = stabs + '<div class="lh">Reset password / PIN</div>' +
          '<label class="mf"><span>Mobile number</span><input type="tel" data-rphone placeholder="e.g. 0300 1234567"></label>' +
          '<label class="mf"><span>New password</span><input type="password" data-rpass placeholder="New password"></label>' +
          '<label class="mf"><span>Confirm password</span><input type="password" data-rpass2 placeholder="Confirm password"></label>' +
          '<label class="mf"><span>New PIN (optional, 4 digits)</span><input type="password" inputmode="numeric" maxlength="4" data-rpin placeholder="4-digit PIN"></label>' +
          '<button class="btn-primary" data-reset>Reset password</button>' +
          '<p class="linkline"><button class="link" data-ltab="signin">← Back to sign in</button></p>';
      } else {
        body = stabs + '<div class="lh">Sign in to continue</div>' +
          '<label class="mf"><span>Mobile number</span><input type="tel" data-lphone placeholder="e.g. 0300 1234567"></label>' +
          '<label class="mf"><span>Password</span><input type="password" data-lpass placeholder="Password"></label>' +
          '<button class="btn-primary" data-ldo>Sign in</button>' +
          '<p class="forgotline"><button class="link" data-ltab="reset">Forgot password?</button></p>' +
          '<p class="linkline">No account? <button class="link" data-ltab="create">Create one</button></p>';
      }
    } else {
      body = '<div class="lh">Staff sign in to continue</div>' +
        '<label class="mf"><span>Staff ID / mobile</span><input type="text" data-lphone placeholder="Staff ID"></label>' +
        '<label class="mf"><span>Password</span><input type="password" data-lpass placeholder="Password"></label>' +
        '<button class="btn-primary" data-ldo>Sign in</button>';
    }
    wrap.innerHTML = '<div class="login-wrap">' +
      '<button class="login-back" data-lback>← Back</button>' +
      '<div class="login-brand"><span class="name">IIK Tailor</span><span class="tag">Stitching Your Style</span></div>' +
      '<div class="login-card">' + roleTabs + body + '</div>' +
      '<p class="login-foot">🪡 Premium men\'s fashion &amp; custom tailoring</p></div>';
    wireLogin(wrap);
  }

  function wireLogin(wrap) {
    var lback = $('[data-lback]', wrap);
    if (lback) lback.addEventListener('click', function () { var a = loginState.after; loginState.after = null; show(a === 'checkout' ? 'cart' : 'home'); });
    $all('[data-lrole]', wrap).forEach(function (b) { b.addEventListener('click', function () { loginState.role = b.getAttribute('data-lrole'); renderLogin(); }); });
    $all('[data-ltab]', wrap).forEach(function (b) { b.addEventListener('click', function () { loginState.tab = b.getAttribute('data-ltab'); renderLogin(); }); });
    var ldo = $('[data-ldo]', wrap);
    if (ldo) ldo.addEventListener('click', function () {
      var phone = ($('[data-lphone]', wrap).value || '').trim();
      var pass = $('[data-lpass]', wrap).value || '';
      if (!phone || !pass) { toast('Enter your details'); return; }
      function afterCustomer() {
        var a = loginState.after; loginState.after = null;
        if (a === 'checkout') { var o = placeOrder(cartDelivery); if (o) { toast('Order placed — ' + o.id); cartDelivery = { method: 'home', address: '' }; show('orders'); return; } }
        show('home');
      }
      if (loginState.role === 'staff') {
        session = { role: 'staff', phone: phone, name: 'Staff' }; write('iik_session', session);
        var a = loginState.after; loginState.after = null;
        toast('Welcome back, Staff'); show(a || 'manager'); return;
      }
      if (loginState.tab === 'create') {
        var name = ($('[data-lname]', wrap).value || '').trim() || 'Customer';
        if (!accounts.some(function (x) { return x.phone === phone; })) accounts.push({ phone: phone, password: pass, name: name });
        write('iik_accounts', accounts);
        session = { role: 'customer', phone: phone, name: name }; write('iik_session', session);
        toast('Welcome, ' + name); afterCustomer(); return;
      }
      var acc = accounts.filter(function (x) { return x.phone === phone; })[0];
      if (!acc || acc.password !== pass) { toast('Invalid mobile or password'); return; }
      session = { role: 'customer', phone: phone, name: acc.name }; write('iik_session', session);
      toast('Welcome, ' + acc.name); afterCustomer();
    });
    var ltrack = $('[data-ltrack]', wrap);
    if (ltrack) ltrack.addEventListener('click', function () {
      var oid = ($('[data-loid]', wrap).value || '').trim();
      var o = orders.filter(function (x) { return x.id.toLowerCase() === oid.toLowerCase(); })[0];
      if (!o) { toast('Order not found'); return; }
      toast('Order ' + o.id + ' — ' + (o.status || 'Confirmed'));
    });
    var reset = $('[data-reset]', wrap);
    if (reset) reset.addEventListener('click', function () {
      var phone = ($('[data-rphone]', wrap).value || '').trim();
      var pass = $('[data-rpass]', wrap).value || '';
      var pass2 = $('[data-rpass2]', wrap).value || '';
      var pin = ($('[data-rpin]', wrap).value || '').trim();
      var acc = accounts.filter(function (x) { return x.phone === phone; })[0];
      if (!acc) { toast('No account found for that number'); return; }
      if (!pass || pass.length < 4) { toast('Enter a password (min 4 characters)'); return; }
      if (pass !== pass2) { toast('Passwords do not match'); return; }
      if (pin && pin.length !== 4) { toast('PIN must be 4 digits'); return; }
      acc.password = pass;
      if (pin) acc.pin = pin;
      write('iik_accounts', accounts);
      toast('Password reset — sign in with your new password');
      loginState.tab = 'signin'; renderLogin();
    });
  }

  /* ------------------- View: More ------------------- */
  function renderMore() {
    var wrap = $('#view-more');
    wrap.innerHTML =
      '<div class="page-head"><button class="back" data-back>←</button><h1>More</h1></div>' +
      '<div class="profile"><div class="avatar">' + (session ? esc((session.name || 'II').slice(0, 2).toUpperCase()) : 'II') + '</div><div><div class="profile-name">' + (session ? esc(session.name) : 'Guest') + '</div><div class="profile-sub">' + (session ? (session.phone || (session.role === 'staff' ? 'Staff' : '')) : 'Sign in to save orders & measurement profile') + '</div></div>' + (session ? '' : '<button class="btn-small" data-m="signin">Sign in</button>') + '</div>' +
      '<div class="sec-title" style="padding:0 16px 6px">OWNER / MANAGER</div>' +
      '<div class="menu" style="margin-top:0">' +
        '<button class="menu-row" data-m="manager"><span>📊</span> Owner Dashboard <span class="chev">›</span></button>' +
        '<button class="menu-row" data-m="desk"><span>📏</span> Measurement Desk <span class="chev">›</span></button>' +
        '<button class="menu-row" data-m="photos"><span>🖼️</span> Manage Catalog Photos <span class="chev">›</span></button>' +
      '</div>' +
      '<div class="menu">' +
        '<a class="menu-row" href="#"><span>👤</span> My Profile <span class="chev">›</span></a>' +
        '<a class="menu-row" href="#"><span>📍</span> Address Book <span class="chev">›</span></a>' +
        '<a class="menu-row" href="#"><span>🎁</span> Offers &amp; Vouchers <span class="chev">›</span></a>' +
        '<a class="menu-row" href="#"><span>💬</span> Help &amp; Support <span class="chev">›</span></a>' +
        '<a class="menu-row" href="#"><span>⚙️</span> Settings <span class="chev">›</span></a>' +
        '<a class="menu-row" href="#"><span>ℹ️</span> About IIK Tailor <span class="chev">›</span></a>' +
      '</div>' +
      '<div class="menu"><button class="menu-row" data-m="logout"><span>🚪</span> Log out <span class="chev">›</span></button></div>' +
      '<div class="menu"><div class="menu-row muted"><span>🪡</span> IIK Tailor — Stitching Your Style · v1.0</div></div>';
    $all('[data-back]', wrap).forEach(function (b) { b.addEventListener('click', function () { show('home'); }); });
    $all('[data-m]', wrap).forEach(function (b) { b.addEventListener('click', function () {
      var v = b.getAttribute('data-m');
      if (v === 'logout') { session = null; write('iik_session', null); toast('Signed out'); show('home'); return; }
      if (v === 'signin') { loginState.after = null; loginState.role = 'customer'; loginState.tab = 'signin'; show('login'); return; }
      if (v === 'manager' || v === 'desk' || v === 'photos') {
        if (session && session.role === 'staff') { show(v); return; }
        loginState.after = v; loginState.role = 'staff'; loginState.tab = 'signin';
        toast('Staff sign in required'); show('login'); return;
      }
      show(v);
    }); });
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
