'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search, ShoppingCart, User, Menu, X, MessageCircle, Plus, Minus, Package, Settings as SettingsIcon,
  LogOut, Trash2, Edit, LayoutDashboard, Truck, Users, ClipboardList, MapPin, ChevronDown, ChevronRight,
  Ban, ShieldCheck, Check
} from 'lucide-react';

// =====================================================================
// CONFIG & TYPES
// =====================================================================
const API_BASE_URL = 'https://nelly-best-collections-4.onrender.com';

type Product = {
  _id?: string; id?: string; name: string; category: string; subCategory: string; price: number;
  image: string; description?: string; inStock?: boolean; isWeeklyDeal?: boolean; weeklyGiftDescription?: string;
};
type CartItem = { id: string; name: string; price: number; image: string; qty: number };
type ShipLoc = { _id: string; county: string; area: string; fee: number; active: boolean };
type ShopSettings = {
  tagline: string; whatsappNumber: string; freeShippingThreshold: number; announcement: string; paymentInstructions: string;
};
type AuthUser = { token: string; email: string; name: string; isAdmin: boolean };
type OrderItem = { name: string; price: number; qty: number; image?: string };
type Order = {
  _id: string; orderNumber: string; createdAt: string; status: string; paymentStatus: string; paymentMethod: string;
  customer: { name: string; phone: string; email?: string };
  items: OrderItem[];
  shipping: { county: string; area: string; address?: string; fee: number };
  subtotal: number; total: number; note?: string; adminNote?: string;
};
type AdminUser = { _id: string; name?: string; email: string; isAdmin: boolean; blocked: boolean; createdAt: string };
type Notify = (msg: string, type?: 'success' | 'error') => void;

const DEFAULT_SETTINGS: ShopSettings = {
  tagline: 'Quality Fashion for Everyone', whatsappNumber: '254746956162',
  freeShippingThreshold: 0, announcement: '', paymentInstructions: ''
};

const CATEGORIES: Record<string, string[]> = {
  'Male Clothes': ['Boxers', 'Vests', 'Soccer Shorts', 'Ankle Socks'],
  'Female Clothes': ['Panties', "Bra's", 'Blouse/Tops'],
  'Kids Wear': ['Socks', 'Shoes', 'Trousers', 'Shirts', 'Jackets']
};

const FALLBACK_PRODUCTS: Product[] = [
  { id: 'fallback-1', name: 'Cotton Boxers Pack', category: 'Male Clothes', subCategory: 'Boxers', price: 850, image: 'https://images.unsplash.com/photo-1552514339-38b444747c32?w=400&q=80' },
  { id: 'fallback-2', name: 'Seamless Panties', category: 'Female Clothes', subCategory: 'Panties', price: 300, image: 'https://images.unsplash.com/photo-1618228965007-96a66dc10cbf?w=400&q=80' },
  { id: 'fallback-3', name: 'Gym Vest', category: 'Male Clothes', subCategory: 'Vests', price: 400, image: 'https://images.unsplash.com/photo-1509942774315-9cb26574f194?w=400&q=80' },
  { id: 'fallback-4', name: 'Push-up Bra', category: 'Female Clothes', subCategory: "Bra's", price: 750, image: 'https://images.unsplash.com/photo-1588661601050-058b888da87c?w=400&q=80' }
];

// Used only if the shipping API can't be reached. Normally counties + areas + fees come from the server.
const KENYA_COUNTIES = [
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa', 'Homa Bay', 'Isiolo', 'Kajiado',
  'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu',
  'Machakos', 'Makueni', 'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa', "Murang'a", 'Nairobi', 'Nakuru', 'Nandi',
  'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta', 'Tana River', 'Tharaka-Nithi',
  'Trans-Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot'
];

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800', confirmed: 'bg-blue-100 text-blue-800',
  shipped: 'bg-purple-100 text-purple-800', delivered: 'bg-green-100 text-green-800', cancelled: 'bg-red-100 text-red-700'
};

// =====================================================================
// HELPERS
// =====================================================================
const pid = (p: Product) => (p._id || p.id || '') as string;
const money = (n: number | string) => `Ksh ${Number(n || 0).toLocaleString('en-KE')}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
const getImageUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('blob:')) return url;
  return url.startsWith('/uploads') ? `${API_BASE_URL}${url}` : url;
};

class ApiError extends Error { status: number; constructor(m: string, s: number) { super(m); this.status = s; } }

async function api(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message || `Request failed (${res.status})`, res.status);
  return data;
}

type MsgData = {
  orderNumber?: string; name: string; phone: string; county: string; area: string; address: string;
  items: OrderItem[]; subtotal: number; fee: number; total: number; payment: string; note?: string;
};
const buildWhatsAppMessage = (o: MsgData) =>
  `Hello Nellie Best Collections! ${o.orderNumber ? `I have placed order *${o.orderNumber}*.` : 'I would like to order:'}\n\n` +
  o.items.map((it, i) => `${i + 1}. ${it.name} x${it.qty} - ${money(it.price * it.qty)}`).join('\n') +
  `\n\n*Subtotal:* ${money(o.subtotal)}\n*Shipping (${o.area}, ${o.county}):* ${o.fee ? money(o.fee) : 'FREE / to be confirmed'}\n*Total:* ${money(o.total)}` +
  `\n\n*Name:* ${o.name}\n*Phone:* ${o.phone}\n*Delivery:* ${o.county} - ${o.area}${o.address ? `, ${o.address}` : ''}\n*Payment:* ${o.payment === 'cod' ? 'Pay on delivery' : 'M-Pesa'}` +
  (o.note ? `\n*Note:* ${o.note}` : '') + '\n\nPlease confirm my order and delivery.';

const inputCls = 'w-full p-2 border rounded text-sm outline-none focus:border-pink-500';
const btnPink = 'bg-pink-600 text-white rounded font-semibold hover:bg-pink-700 transition disabled:opacity-50';

// =====================================================================
// MAIN APP
// =====================================================================
export default function NellieBestCollections() {
  // --- DATA ---
  const [products, setProducts] = useState<Product[]>([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [shipping, setShipping] = useState<ShipLoc[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // --- AUTH ---
  const [auth, setAuth] = useState<AuthUser | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const isAdmin = !!auth?.isAdmin;
  const isClient = !!auth && !auth.isAdmin;

  // --- UI ---
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartStep, setCartStep] = useState<'cart' | 'checkout' | 'done'>('cart');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [displayCount, setDisplayCount] = useState(8);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentView, setCurrentView] = useState<'catalog' | 'client-dashboard'>('catalog');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [myOrders, setMyOrders] = useState<Order[]>([]);

  // --- CHECKOUT ---
  const [co, setCo] = useState({ name: '', phone: '', email: '', county: '', locationId: '', address: '', note: '', payment: 'mpesa' });
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);

  const notify: Notify = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // --- LOADERS ---
  const loadProducts = useCallback(async () => {
    try {
      const data = await api('/api/products');
      setUsingFallback(data.length === 0);
      setProducts(data.length > 0 ? data : FALLBACK_PRODUCTS);
    } catch {
      setUsingFallback(true);
      setProducts(FALLBACK_PRODUCTS);
    }
  }, []);
  const loadShipping = useCallback(async () => {
    try { setShipping(await api('/api/shipping')); } catch { /* fallback counties used */ }
  }, []);
  const loadSettings = useCallback(async () => {
    try { const d = await api('/api/settings'); if (d) setSettings({ ...DEFAULT_SETTINGS, ...d }); } catch { /* defaults */ }
  }, []);

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem('nbc_cart');
      if (savedCart) setCart(JSON.parse(savedCart));
      const savedAuth = localStorage.getItem('nbc_auth');
      if (savedAuth) {
        const a: AuthUser = JSON.parse(savedAuth);
        setAuth(a);
        // Re-check the session so removed/blocked accounts and role changes apply
        api('/api/me', { token: a.token })
          .then((u) => {
            const fresh = { ...a, isAdmin: u.isAdmin, name: u.name || a.name };
            setAuth(fresh);
            localStorage.setItem('nbc_auth', JSON.stringify(fresh));
          })
          .catch((err) => {
            if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
              localStorage.removeItem('nbc_auth');
              setAuth(null);
            }
          });
      }
    } catch { /* ignore corrupt storage */ }
    setHydrated(true);
    loadProducts(); loadSettings(); loadShipping();
  }, [loadProducts, loadSettings, loadShipping]);

  useEffect(() => { if (hydrated) localStorage.setItem('nbc_cart', JSON.stringify(cart)); }, [cart, hydrated]);

  useEffect(() => {
    if (auth && !auth.isAdmin && currentView === 'client-dashboard') {
      api('/api/orders/mine', { token: auth.token }).then(setMyOrders).catch(() => setMyOrders([]));
    }
  }, [auth, currentView]);

  // Pre-fill checkout from the logged-in client
  useEffect(() => {
    if (auth && !auth.isAdmin) setCo((c) => ({ ...c, name: c.name || auth.name || '', email: c.email || auth.email }));
  }, [auth]);

  // --- SLIDESHOW ---
  const slideImages = useMemo(() => {
    const list = products.length > 0 ? products : FALLBACK_PRODUCTS;
    return list.slice(0, 5).map((p) => getImageUrl(p.image) || p.image);
  }, [products]);
  useEffect(() => {
    if (slideImages.length === 0) return;
    const t = setInterval(() => setCurrentSlide((p) => (p + 1) % slideImages.length), 4000);
    return () => clearInterval(t);
  }, [slideImages.length]);

  // --- FILTERING ---
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return products.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.price.toString().includes(q);
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory || p.subCategory === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  // --- AUTH HANDLERS ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(''); setAuthBusy(true);
    try {
      const data = await api(isSignUp ? '/api/register' : '/api/login', {
        method: 'POST', body: { name: nameInput, email: email.trim(), password }
      });
      const a: AuthUser = { token: data.token, email: data.email, name: data.name || data.email.split('@')[0], isAdmin: !!data.isAdmin };
      setAuth(a);
      localStorage.setItem('nbc_auth', JSON.stringify(a));
      setShowLogin(false); setEmail(''); setPassword(''); setNameInput('');
      setCurrentView('catalog');
      notify(a.isAdmin ? 'Welcome back, admin' : `Welcome, ${a.name}!`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not connect to the server');
    } finally { setAuthBusy(false); }
  };

  const handleLogout = () => {
    setAuth(null); setMyOrders([]);
    localStorage.removeItem('nbc_auth');
    setCurrentView('catalog');
  };

  // --- CART ---
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const addToCart = (p: Product) => {
    if (p.inStock === false) return notify('Sorry, this item is out of stock', 'error');
    const id = pid(p);
    setCart((c) => c.find((i) => i.id === id)
      ? c.map((i) => (i.id === id ? { ...i, qty: Math.min(50, i.qty + 1) } : i))
      : [...c, { id, name: p.name, price: Number(p.price), image: p.image, qty: 1 }]);
    notify(`${p.name} added to cart`);
  };
  const changeQty = (id: string, delta: number) =>
    setCart((c) => c.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Math.min(50, i.qty + delta)) } : i)));
  const removeFromCart = (id: string) => setCart((c) => c.filter((i) => i.id !== id));

  const openCart = () => { setCartStep('cart'); setIsCartOpen(true); };

  // --- SHIPPING ---
  const counties = useMemo(() => (shipping.length ? Array.from(new Set(shipping.map((l) => l.county))) : KENYA_COUNTIES), [shipping]);
  const areas = useMemo(() => shipping.filter((l) => l.county === co.county), [shipping, co.county]);
  const selectedLoc = shipping.find((l) => l._id === co.locationId);
  const threshold = settings.freeShippingThreshold || 0;
  const freeShipping = threshold > 0 && cartTotal >= threshold;
  const shippingFee = selectedLoc ? (freeShipping ? 0 : selectedLoc.fee) : 0;
  const grandTotal = cartTotal + shippingFee;
  const waNumber = settings.whatsappNumber || DEFAULT_SETTINGS.whatsappNumber;

  const localMsg = (): MsgData => ({
    name: co.name, phone: co.phone, county: co.county || 'N/A', area: selectedLoc?.area || 'N/A', address: co.address,
    items: cart, subtotal: cartTotal, fee: shippingFee, total: grandTotal, payment: co.payment, note: co.note
  });

  const placeOrder = async () => {
    if (!co.name.trim() || !co.phone.trim()) return notify('Enter your name and phone number', 'error');
    if (!co.county) return notify('Choose your county', 'error');
    if (shipping.length && !co.locationId) return notify('Choose your delivery area', 'error');
    setPlacing(true);
    try {
      const order: Order = await api('/api/orders', {
        method: 'POST', token: auth?.token,
        body: {
          items: cart.map((i) => ({ id: i.id, name: i.name, qty: i.qty })),
          customer: { name: co.name, phone: co.phone, email: co.email },
          locationId: co.locationId, address: co.address, note: co.note, paymentMethod: co.payment
        }
      });
      setPlacedOrder(order); setCart([]); setCartStep('done');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not place order', 'error');
    } finally { setPlacing(false); }
  };

  const whatsappOrderOnly = () => {
    if (!co.name.trim() || !co.phone.trim() || !co.county) return notify('Fill in your name, phone and county first', 'error');
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(buildWhatsAppMessage(localMsg()))}`, '_blank');
  };

  const placedOrderWhatsApp = () => {
    if (!placedOrder) return;
    const o = placedOrder;
    const msg = buildWhatsAppMessage({
      orderNumber: o.orderNumber, name: o.customer.name, phone: o.customer.phone, county: o.shipping.county, area: o.shipping.area,
      address: o.shipping.address || '', items: o.items, subtotal: o.subtotal, fee: o.shipping.fee, total: o.total,
      payment: o.paymentMethod, note: o.note
    });
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const weeklyDealProduct = products.find((p) => p.isWeeklyDeal) || products[0] || FALLBACK_PRODUCTS[0];
  const adminProducts = usingFallback ? [] : products;

  // =====================================================================
  // RENDER
  // =====================================================================
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* ANNOUNCEMENT BAR */}
      {settings.announcement && !isAdmin && (
        <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 text-white text-center text-sm py-2 px-4">
          {settings.announcement}
        </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {!isAdmin && (
              <button className="lg:hidden" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu"><Menu size={28} /></button>
            )}
            <div className="flex flex-col cursor-pointer" onClick={() => setCurrentView('catalog')}>
              <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 animate-[pulse_3s_ease-in-out_infinite]">
                Nellie Best Collections
              </h1>
              <p className="text-xs text-gray-500 italic">{isAdmin ? 'Admin Control Panel' : settings.tagline}</p>
            </div>
          </div>

          {!isAdmin && (
            <div className="hidden md:flex flex-1 max-w-md mx-8 relative">
              <input type="text" placeholder="Search by name, category, or price..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-300 focus:ring-2 focus:ring-pink-500 outline-none" />
              <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
            </div>
          )}

          <div className="flex items-center gap-4 md:gap-6">
            {!isAdmin && <button onClick={() => setCurrentView('catalog')} className="hidden md:block font-medium hover:text-pink-600 transition">Catalog</button>}
            <a href="#footer" className="hidden md:block font-medium hover:text-pink-600 transition">Contact</a>

            {!isAdmin && (
              <div className="relative cursor-pointer hover:text-pink-600" onClick={openCart}>
                <ShoppingCart size={24} />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{cartCount}</span>
                )}
              </div>
            )}

            {isAdmin ? (
              <button onClick={handleLogout} className="flex items-center gap-2 text-red-600 font-medium bg-red-50 px-4 py-2 rounded-full hover:bg-red-100 transition">
                <LogOut size={20} /> <span className="hidden md:block">Exit Admin</span>
              </button>
            ) : isClient ? (
              <div className="flex items-center gap-4">
                <button onClick={() => setCurrentView('client-dashboard')} className="flex items-center gap-2 text-pink-600 font-medium hover:text-pink-800 transition">
                  <User size={20} /> <span className="hidden md:block">Hi, {auth?.name}</span>
                </button>
                <button onClick={handleLogout} className="text-gray-500 hover:text-red-500" title="Logout"><LogOut size={20} /></button>
              </div>
            ) : (
              <button onClick={() => setShowLogin(true)} className="flex items-center gap-2 bg-pink-600 text-white px-4 py-2 rounded-full hover:bg-pink-700 transition">
                <User size={20} /> <span className="hidden md:block">Login / Sign Up</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MOBILE SEARCH */}
      {!isAdmin && (
        <div className="md:hidden p-4 bg-white border-b">
          <div className="relative">
            <input type="text" placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-300 focus:ring-2 focus:ring-pink-500 outline-none" />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row relative">
        {/* CATEGORY SIDEBAR */}
        {!isAdmin && currentView === 'catalog' && (
          <aside className={`${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static top-0 left-0 h-full w-64 bg-white shadow-xl lg:shadow-none lg:border-r z-40 transition-transform duration-300 ease-in-out`}>
            <div className="p-4 flex justify-between items-center lg:hidden border-b">
              <span className="font-bold text-lg">Categories</span>
              <button onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
            </div>
            <div className="p-4 overflow-y-auto h-full pb-24">
              <button onClick={() => { setSelectedCategory('All'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left py-2 px-3 rounded-lg font-medium mb-2 ${selectedCategory === 'All' ? 'bg-pink-100 text-pink-700' : 'hover:bg-gray-100'}`}>
                All Products
              </button>
              {Object.entries(CATEGORIES).map(([cat, subcats]) => (
                <div key={cat} className="mb-4">
                  <button onClick={() => setSelectedCategory(cat)}
                    className={`w-full text-left py-2 px-3 rounded-lg font-bold ${selectedCategory === cat ? 'bg-pink-100 text-pink-700' : 'hover:bg-gray-100'}`}>
                    {cat}
                  </button>
                  <div className="ml-4 mt-1 space-y-1">
                    {subcats.map((sub) => (
                      <button key={sub} onClick={() => { setSelectedCategory(sub); setIsMobileMenuOpen(false); }}
                        className={`block w-full text-left py-1.5 px-3 text-sm rounded-md ${selectedCategory === sub ? 'text-pink-600 bg-pink-50' : 'text-gray-600 hover:text-pink-600 hover:bg-gray-50'}`}>
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* MAIN */}
        <main className={`flex-1 w-full ${!isAdmin && currentView === 'catalog' ? 'lg:w-[calc(100%-16rem)]' : ''}`}>
          {isAdmin && auth ? (
            <AdminPanel token={auth.token} selfEmail={auth.email} products={adminProducts} usingFallback={usingFallback}
              reloadProducts={loadProducts} settings={settings} setSettings={setSettings} reloadShipping={loadShipping} notify={notify} />
          ) : currentView === 'client-dashboard' && isClient ? (
            <ClientDashboard name={auth?.name || ''} email={auth?.email || ''} orders={myOrders} onLogout={handleLogout} onBrowse={() => setCurrentView('catalog')} />
          ) : (
            <>
              {/* HERO */}
              <section className="p-4 md:p-6 lg:p-8 flex flex-col xl:flex-row gap-6">
                <div className="w-full xl:w-2/3 h-[300px] md:h-[400px] rounded-2xl overflow-hidden relative shadow-lg group">
                  {slideImages.map((img, idx) => (
                    <img key={idx} src={img} alt="Banner"
                      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${idx === currentSlide ? 'opacity-100' : 'opacity-0'}`} />
                  ))}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                  <div className="absolute bottom-6 left-6 text-white">
                    <h2 className="text-3xl font-bold mb-2">New Arrivals</h2>
                    <p>Upgrade your wardrobe with our latest fashion trends.</p>
                  </div>
                </div>

                <div className="w-full xl:w-1/3 rounded-2xl p-1 bg-gradient-to-br from-pink-500 to-purple-600 shadow-[0_0_20px_rgba(236,72,153,0.6)] animate-pulse">
                  <div className="bg-white w-full h-full rounded-xl p-6 flex flex-col justify-center items-center text-center">
                    <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full mb-4 animate-bounce">ITEM OF THE WEEK + FREE GIFT!</span>
                    <img src={getImageUrl(weeklyDealProduct.image) || weeklyDealProduct.image} alt="Weekly Deal" className="w-32 h-32 object-cover rounded-lg mb-4 shadow-md" />
                    <h3 className="font-bold text-xl mb-1">{weeklyDealProduct.name}</h3>
                    <p className="text-pink-600 font-bold text-lg mb-2">{money(weeklyDealProduct.price)}</p>
                    <p className="text-sm text-gray-500">{weeklyDealProduct.weeklyGiftDescription || 'Buy this today and get a free special gift!'}</p>
                    <button onClick={() => addToCart(weeklyDealProduct)} className="mt-4 w-full bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition flex justify-center items-center gap-2">
                      <ShoppingCart size={18} /> Add to Cart
                    </button>
                  </div>
                </div>
              </section>

              {/* CATALOG */}
              <section id="catalog" className="p-4 md:p-6 lg:p-8">
                <div className="flex justify-between items-end mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">{selectedCategory === 'All' ? 'All Products' : selectedCategory}</h2>
                  <span className="text-sm text-gray-500">{filteredProducts.length} items found</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  {filteredProducts.slice(0, displayCount).map((product) => {
                    const out = product.inStock === false;
                    return (
                      <div key={pid(product)} className="bg-white rounded-xl shadow-sm hover:shadow-xl transition-shadow border border-gray-100 overflow-hidden group flex flex-col">
                        <div className="h-48 md:h-56 overflow-hidden relative">
                          <img src={getImageUrl(product.image) || product.image} alt={product.name}
                            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${out ? 'grayscale opacity-60' : ''}`} />
                          <span className="absolute top-2 right-2 bg-white/90 text-xs font-bold px-2 py-1 rounded shadow-sm text-gray-700">{product.subCategory}</span>
                          {out && <span className="absolute bottom-2 left-2 bg-gray-900 text-white text-xs font-bold px-2 py-1 rounded">Out of stock</span>}
                        </div>
                        <div className="p-4 flex flex-col flex-1">
                          <h3 className="font-semibold text-gray-800 mb-1 line-clamp-1">{product.name}</h3>
                          <p className="text-pink-600 font-bold mb-3 mt-auto">{money(product.price)}</p>
                          <button onClick={() => addToCart(product)} disabled={out}
                            className="w-full border border-pink-600 text-pink-600 py-2 rounded-lg hover:bg-pink-600 hover:text-white transition-colors flex justify-center items-center gap-2 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-pink-600">
                            <ShoppingCart size={18} /> {out ? 'Unavailable' : 'Add'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {displayCount < filteredProducts.length && (
                  <div className="mt-8 flex justify-center">
                    <button onClick={() => setDisplayCount((p) => p + 8)} className="bg-gray-900 text-white px-8 py-3 rounded-full hover:bg-gray-800 transition shadow-md">Show More Products</button>
                  </div>
                )}
                {filteredProducts.length === 0 && <div className="text-center py-12 text-gray-500">No products found matching your search or category.</div>}
              </section>
            </>
          )}
        </main>
      </div>

      {/* CART / CHECKOUT PANEL */}
      {isCartOpen && !isAdmin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={() => setIsCartOpen(false)}>
          <div className="bg-white w-full max-w-md h-full shadow-2xl p-6 relative flex flex-col animate-[slideIn_0.3s_ease-out]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setIsCartOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-black"><X size={28} /></button>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 border-b pb-4">
              {cartStep === 'cart' ? <><ShoppingCart /> Your Cart</> : cartStep === 'checkout' ? <><Truck /> Delivery Details</> : <><Check className="text-green-600" /> Order Placed</>}
            </h2>

            {/* STEP 1: CART */}
            {cartStep === 'cart' && (
              <>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                      <ShoppingCart size={48} className="mb-4 opacity-50" />
                      <p>Your cart is empty.</p>
                      <button onClick={() => setIsCartOpen(false)} className="mt-4 text-pink-600 font-semibold underline">Continue Shopping</button>
                    </div>
                  ) : cart.map((item) => (
                    <div key={item.id} className="flex gap-3 items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <img src={getImageUrl(item.image) || item.image} alt={item.name} className="w-16 h-16 object-cover rounded shadow-sm" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-800 text-sm truncate">{item.name}</h4>
                        <p className="text-pink-600 font-bold text-sm mt-1">{money(item.price * item.qty)}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <button onClick={() => changeQty(item.id, -1)} className="border rounded p-0.5 hover:bg-gray-200"><Minus size={14} /></button>
                          <span className="text-sm w-5 text-center">{item.qty}</span>
                          <button onClick={() => changeQty(item.id, 1)} className="border rounded p-0.5 hover:bg-gray-200"><Plus size={14} /></button>
                        </div>
                      </div>
                      <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 p-2" title="Remove"><Trash2 size={18} /></button>
                    </div>
                  ))}
                </div>
                {cart.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex justify-between font-bold text-gray-800 mb-1"><span>Items:</span><span>{cartCount}</span></div>
                    <div className="flex justify-between font-extrabold text-xl mb-2"><span>Subtotal:</span><span className="text-pink-600">{money(cartTotal)}</span></div>
                    <p className="text-xs text-gray-500 mb-4">
                      {threshold > 0
                        ? (freeShipping ? '🎉 You qualify for FREE shipping!' : `Add ${money(threshold - cartTotal)} more for free shipping.`)
                        : 'Shipping is calculated at the next step based on your county.'}
                    </p>
                    <button onClick={() => setCartStep('checkout')} className="w-full bg-pink-600 text-white py-3 rounded-lg font-bold hover:bg-pink-700 transition shadow-lg flex justify-center items-center gap-2">
                      <Truck size={20} /> Continue to Delivery
                    </button>
                  </div>
                )}
              </>
            )}

            {/* STEP 2: CHECKOUT */}
            {cartStep === 'checkout' && (
              <>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  <input className={inputCls} placeholder="Full name *" value={co.name} onChange={(e) => setCo({ ...co, name: e.target.value })} />
                  <input className={inputCls} placeholder="Phone (e.g. 0712 345 678) *" inputMode="tel" value={co.phone} onChange={(e) => setCo({ ...co, phone: e.target.value })} />
                  <input className={inputCls} placeholder="Email (optional)" type="email" value={co.email} onChange={(e) => setCo({ ...co, email: e.target.value })} />

                  <div>
                    <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><MapPin size={12} /> County *</label>
                    <select className={inputCls} value={co.county} onChange={(e) => setCo({ ...co, county: e.target.value, locationId: '' })}>
                      <option value="">Select county ({counties.length} available)</option>
                      {counties.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {shipping.length > 0 && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Town / Area *</label>
                      <select className={inputCls} value={co.locationId} disabled={!co.county} onChange={(e) => setCo({ ...co, locationId: e.target.value })}>
                        <option value="">{co.county ? 'Select your area' : 'Choose a county first'}</option>
                        {areas.map((a) => <option key={a._id} value={a._id}>{a.area} — {money(freeShipping ? 0 : a.fee)}</option>)}
                      </select>
                    </div>
                  )}
                  <textarea className={inputCls} rows={2} placeholder="Street, estate, landmark or pickup stage" value={co.address} onChange={(e) => setCo({ ...co, address: e.target.value })} />
                  <textarea className={inputCls} rows={2} placeholder="Note to seller (optional)" value={co.note} onChange={(e) => setCo({ ...co, note: e.target.value })} />

                  <div className="flex gap-2 text-sm">
                    {[['mpesa', 'M-Pesa'], ['cod', 'Pay on delivery']].map(([v, l]) => (
                      <label key={v} className={`flex-1 border rounded p-2 text-center cursor-pointer ${co.payment === v ? 'border-pink-500 bg-pink-50 text-pink-700 font-semibold' : ''}`}>
                        <input type="radio" className="hidden" checked={co.payment === v} onChange={() => setCo({ ...co, payment: v })} />{l}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t space-y-1 text-sm">
                  <div className="flex justify-between"><span>Subtotal</span><span>{money(cartTotal)}</span></div>
                  <div className="flex justify-between">
                    <span>Shipping {selectedLoc ? `(${selectedLoc.area})` : ''}</span>
                    <span>{selectedLoc ? (freeShipping ? 'FREE' : money(shippingFee)) : 'Select area'}</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-lg pt-1"><span>Total</span><span className="text-pink-600">{money(grandTotal)}</span></div>
                  <button onClick={placeOrder} disabled={placing} className={`${btnPink} w-full py-3 mt-3 text-base shadow-lg`}>{placing ? 'Placing order...' : 'Place Order'}</button>
                  <button onClick={whatsappOrderOnly} className="w-full text-green-600 text-xs font-semibold underline pt-2">Having trouble? Send this order on WhatsApp instead</button>
                  <button onClick={() => setCartStep('cart')} className="w-full text-gray-500 text-xs pt-1">← Back to cart</button>
                </div>
              </>
            )}

            {/* STEP 3: DONE */}
            {cartStep === 'done' && placedOrder && (
              <div className="flex-1 overflow-y-auto space-y-4 text-sm">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-gray-600">Your order number</p>
                  <p className="text-2xl font-extrabold text-green-700">{placedOrder.orderNumber}</p>
                  <p className="mt-1 font-bold">{money(placedOrder.total)} <span className="font-normal text-gray-500">(incl. {money(placedOrder.shipping.fee)} shipping)</span></p>
                </div>
                <p className="text-gray-600">Delivering to <strong>{placedOrder.shipping.area}, {placedOrder.shipping.county}</strong>.
                  {placedOrder.paymentMethod === 'cod' ? ' You will pay when your order arrives.' : ' Pay via M-Pesa and we will confirm your order.'}</p>
                {settings.paymentInstructions && placedOrder.paymentMethod === 'mpesa' && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3 whitespace-pre-line">{settings.paymentInstructions}</div>
                )}
                <button onClick={placedOrderWhatsApp} className="w-full bg-green-500 text-white py-3 rounded-lg font-bold hover:bg-green-600 transition shadow-lg flex justify-center items-center gap-2">
                  <MessageCircle size={22} /> Send Order on WhatsApp
                </button>
                <button onClick={() => { setIsCartOpen(false); setCartStep('cart'); }} className="w-full text-pink-600 font-semibold underline">Continue Shopping</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WHATSAPP FLOATING BUTTON */}
      {!isCartOpen && !isAdmin && (
        <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer"
          className="fixed bottom-6 right-6 bg-green-500 text-white p-4 rounded-full shadow-[0_4px_14px_rgba(34,197,94,0.5)] hover:scale-110 transition-transform z-40 flex items-center justify-center">
          <MessageCircle size={32} />
        </a>
      )}

      {/* FOOTER */}
      <footer id="footer" className="bg-gray-900 text-gray-300 pt-12 pb-6 mt-12 border-t-4 border-pink-600">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="text-white text-xl font-bold mb-4">Nellie Best Collections</h3>
            <p className="text-sm mb-4">Your one-stop shop for high-quality, fashionable clothing for men, women, and kids. We deliver to all 47 counties in Kenya.</p>
          </div>
          <div>
            <h3 className="text-white text-lg font-bold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><button onClick={() => setCurrentView('catalog')} className="hover:text-pink-400">Home</button></li>
              <li><a href="#catalog" className="hover:text-pink-400">Shop Catalog</a></li>
              <li><a href="#" className="hover:text-pink-400">About Us</a></li>
              <li><a href="#" className="hover:text-pink-400">Return Policy</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white text-lg font-bold mb-4">Contact Us</h3>
            <ul className="space-y-2 text-sm">
              <li>📞 Phone: +254 768 450250 / +254746956162</li>
              <li>✉️ Email: muthoninellian@gmail.com</li>
              <li>📍 Location: Mwea, Kenya</li>
            </ul>
          </div>
        </div>
        <div className="text-center text-sm border-t border-gray-800 pt-6">&copy; {new Date().getFullYear()} Nellie Best Collections. All rights reserved.</div>
      </footer>

      {/* AUTH MODAL */}
      {showLogin && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden relative shadow-2xl">
            <button onClick={() => setShowLogin(false)} className="absolute top-4 right-4 text-gray-400 hover:text-black z-10"><X size={24} /></button>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-center mb-6">{isSignUp ? 'Create an Account' : 'Welcome Back'}</h2>
              <form onSubmit={handleAuth} className="space-y-4">
                {isSignUp && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Enter your name"
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 outline-none bg-gray-50" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 outline-none bg-gray-50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" required minLength={6}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 outline-none bg-gray-50" />
                </div>
                {authError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{authError}</p>}
                <button type="submit" disabled={authBusy} className={`${btnPink} w-full py-2 mt-2 shadow-md`}>
                  {authBusy ? 'Please wait...' : isSignUp ? 'Sign Up & Continue' : 'Login'}
                </button>
              </form>
              <div className="mt-4 text-center text-sm">
                <span className="text-gray-600">{isSignUp ? 'Already have an account?' : "Don't have an account?"}</span>
                <button onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }} className="ml-1 text-pink-600 font-bold hover:underline">{isSignUp ? 'Login here' : 'Sign up'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-lg shadow-xl text-sm font-semibold text-white ${toast.type === 'error' ? 'bg-red-600' : 'bg-gray-900'}`}>
          {toast.msg}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }` }} />
    </div>
  );
}

// =====================================================================
// CLIENT DASHBOARD
// =====================================================================
function ClientDashboard({ name, email, orders, onLogout, onBrowse }: {
  name: string; email: string; orders: Order[]; onLogout: () => void; onBrowse: () => void;
}) {
  return (
    <div className="p-6 lg:p-12 min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold mb-8 flex items-center gap-3"><User size={32} className="text-pink-600" /> My Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit">
            <h3 className="font-bold text-xl mb-4 border-b pb-2">Account</h3>
            <div className="space-y-2 text-gray-700 text-sm">
              <p><strong className="text-gray-900">Name:</strong> {name}</p>
              <p className="break-all"><strong className="text-gray-900">Email:</strong> {email}</p>
              <p><strong className="text-gray-900">Orders:</strong> {orders.length}</p>
            </div>
            <button onClick={onLogout} className="mt-6 border border-red-500 text-red-500 px-6 py-2 rounded-lg hover:bg-red-50 transition w-full">Log Out</button>
          </div>
          <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-xl mb-4 border-b pb-2">Order History</h3>
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Package size={48} className="text-gray-300 mb-4" />
                <p className="text-gray-500 mb-6">You haven&apos;t placed any orders yet.</p>
                <button onClick={onBrowse} className="bg-pink-600 text-white px-6 py-2 rounded-lg hover:bg-pink-700 transition">Browse Catalog</button>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((o) => (
                  <div key={o._id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start gap-2 flex-wrap">
                      <div><p className="font-bold">{o.orderNumber}</p><p className="text-xs text-gray-500">{fmtDate(o.createdAt)}</p></div>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize ${STATUS_STYLES[o.status] || ''}`}>{o.status}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">{o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</p>
                    <p className="text-xs text-gray-500 mt-1">To {o.shipping.area}, {o.shipping.county} · {o.paymentStatus === 'paid' ? 'Paid' : 'Payment pending'}</p>
                    <p className="font-bold text-pink-600 mt-1">{money(o.total)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// ADMIN PANEL
// =====================================================================
type AdminTab = 'overview' | 'products' | 'orders' | 'customers' | 'shipping' | 'settings';
const ADMIN_TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
  { id: 'orders', label: 'Orders', icon: <ClipboardList size={18} /> },
  { id: 'products', label: 'Products', icon: <Package size={18} /> },
  { id: 'customers', label: 'Customers', icon: <Users size={18} /> },
  { id: 'shipping', label: 'Shipping', icon: <Truck size={18} /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon size={18} /> }
];

function AdminPanel(props: {
  token: string; selfEmail: string; products: Product[]; usingFallback: boolean; reloadProducts: () => void;
  settings: ShopSettings; setSettings: (s: ShopSettings) => void; reloadShipping: () => void; notify: Notify;
}) {
  const [tab, setTab] = useState<AdminTab>('overview');
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-pink-50">
      <aside className="w-full md:w-60 bg-white border-r border-gray-200 shadow-sm p-3 md:p-6">
        <h2 className="hidden md:flex text-xl font-bold mb-6 items-center gap-2 text-gray-800"><ShieldCheck /> Admin</h2>
        <nav className="flex md:flex-col gap-2 overflow-x-auto">
          {ADMIN_TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-xl font-bold transition-all ${tab === t.id ? 'bg-pink-600 text-white shadow-md' : 'text-gray-600 hover:bg-pink-50'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex-1 p-4 md:p-6 min-w-0">
        {props.usingFallback && (tab === 'overview' || tab === 'products') && (
          <div className="mb-4 bg-yellow-50 border border-yellow-300 text-yellow-800 text-sm rounded p-3">
            The shop has no products saved yet (or the server is waking up). Add your first product below, or refresh in a few seconds.
          </div>
        )}
        {tab === 'overview' && <OverviewTab {...props} goTo={setTab} />}
        {tab === 'orders' && <OrdersTab token={props.token} notify={props.notify} />}
        {tab === 'products' && <ProductsTab {...props} />}
        {tab === 'customers' && <CustomersTab token={props.token} selfEmail={props.selfEmail} notify={props.notify} />}
        {tab === 'shipping' && <ShippingTab token={props.token} notify={props.notify} reloadShipping={props.reloadShipping} />}
        {tab === 'settings' && <SettingsTab {...props} />}
      </div>
    </div>
  );
}

const Card = ({ title, icon, children, glow }: { title: string; icon?: React.ReactNode; children: React.ReactNode; glow?: boolean }) => (
  <div className={`bg-white p-5 rounded-xl shadow-sm border ${glow ? 'border-pink-300 shadow-[0_0_15px_rgba(236,72,153,0.3)]' : 'border-gray-200'}`}>
    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">{icon} {title}</h3>
    {children}
  </div>
);

// ---------- Overview ----------
function OverviewTab({ token, products, reloadProducts, notify, goTo }: {
  token: string; products: Product[]; reloadProducts: () => void; notify: Notify; goTo: (t: AdminTab) => void;
}) {
  const [stats, setStats] = useState<any>(null);
  const current = products.find((p) => p.isWeeklyDeal);
  const [dealId, setDealId] = useState('');
  const [gift, setGift] = useState('');

  useEffect(() => { api('/api/admin/stats', { token }).then(setStats).catch(() => notify('Could not load stats', 'error')); }, [token, notify]);
  useEffect(() => { if (current) { setDealId(pid(current)); setGift(current.weeklyGiftDescription || ''); } }, [current?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveDeal = async (clear = false) => {
    try {
      await api('/api/weekly-deal', { method: 'PUT', token, body: { productId: clear ? '' : dealId, weeklyGiftDescription: gift } });
      if (clear) { setDealId(''); setGift(''); }
      notify(clear ? 'Weekly deal cleared' : 'Weekly deal updated');
      reloadProducts();
    } catch (e) { notify(e instanceof Error ? e.message : 'Failed', 'error'); }
  };

  const tiles = stats ? [
    ['Total Orders', stats.totalOrders, 'orders'], ['Pending', stats.pendingOrders, 'orders'],
    ['Revenue', money(stats.revenue), 'orders'], ['Paid Revenue', money(stats.paidRevenue), 'orders'],
    ['Products', stats.products, 'products'], ['Out of Stock', stats.outOfStock, 'products'],
    ['Customers', stats.customers, 'customers']
  ] : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map(([label, val, to]) => (
          <button key={label as string} onClick={() => goTo(to as AdminTab)} className="bg-white p-4 rounded-xl border border-gray-200 text-left hover:border-pink-400 transition">
            <p className="text-xs text-gray-500">{label}</p><p className="text-2xl font-extrabold text-gray-800">{val}</p>
          </button>
        ))}
        {!stats && <p className="text-gray-500 col-span-full">Loading stats...</p>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Recent Orders" icon={<ClipboardList />}>
          {stats?.recentOrders?.length ? stats.recentOrders.map((o: Order) => (
            <div key={o._id} className="flex justify-between items-center border-b last:border-0 py-2 text-sm">
              <div><p className="font-semibold">{o.orderNumber}</p><p className="text-xs text-gray-500">{o.customer.name} · {o.shipping.county}</p></div>
              <div className="text-right"><p className="font-bold">{money(o.total)}</p><span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[o.status]}`}>{o.status}</span></div>
            </div>
          )) : <p className="text-gray-500 text-sm">No orders yet.</p>}
        </Card>
        <Card title="Top Counties" icon={<MapPin />}>
          {stats?.topCounties?.length ? stats.topCounties.map((c: any) => (
            <div key={c._id} className="flex justify-between border-b last:border-0 py-2 text-sm"><span>{c._id}</span><span className="text-gray-600">{c.orders} orders · {money(c.revenue)}</span></div>
          )) : <p className="text-gray-500 text-sm">Sales by county will appear here.</p>}
        </Card>
        <Card title="Item of the Week" glow>
          <select value={dealId} onChange={(e) => setDealId(e.target.value)} className={`${inputCls} mb-3`}>
            <option value="">Select product</option>
            {products.map((p) => <option key={pid(p)} value={pid(p)}>{p.name}</option>)}
          </select>
          <input value={gift} onChange={(e) => setGift(e.target.value)} placeholder="Free gift (e.g. Free Socks)" className={`${inputCls} mb-3`} />
          <div className="flex gap-2">
            <button onClick={() => saveDeal()} disabled={!dealId} className={`${btnPink} flex-1 p-2 text-sm`}>Update Weekly Deal</button>
            {current && <button onClick={() => saveDeal(true)} className="border border-red-400 text-red-500 px-3 rounded text-sm hover:bg-red-50">Clear</button>}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------- Orders ----------
function OrdersTab({ token, notify }: { token: string; notify: Notify }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setOrders(await api(`/api/admin/orders${filter === 'all' ? '' : `?status=${filter}`}`, { token })); }
    catch (e) { notify(e instanceof Error ? e.message : 'Failed to load orders', 'error'); }
    finally { setLoading(false); }
  }, [token, filter, notify]);
  useEffect(() => { load(); }, [load]);

  const update = async (id: string, body: object) => {
    try {
      const u = await api(`/api/admin/orders/${id}`, { method: 'PUT', token, body });
      setOrders((os) => os.map((o) => (o._id === id ? { ...o, ...u } : o)));
      notify('Order updated');
    } catch (e) { notify(e instanceof Error ? e.message : 'Failed', 'error'); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this order permanently?')) return;
    try { await api(`/api/admin/orders/${id}`, { method: 'DELETE', token }); setOrders((os) => os.filter((o) => o._id !== id)); notify('Order deleted'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Failed', 'error'); }
  };

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-4">
        {['all', ...ORDER_STATUSES].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-4 py-1.5 rounded-full text-sm font-semibold capitalize ${filter === s ? 'bg-pink-600 text-white' : 'bg-white border text-gray-600 hover:bg-pink-50'}`}>{s}</button>
        ))}
      </div>
      {loading ? <p className="text-gray-500">Loading orders...</p> : orders.length === 0 ? <p className="text-gray-500">No orders found.</p> : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div key={o._id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-extrabold text-lg">{o.orderNumber}</p>
                  <p className="text-xs text-gray-500">{fmtDate(o.createdAt)} · {o.paymentMethod === 'cod' ? 'Pay on delivery' : 'M-Pesa'}</p>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <select value={o.status} onChange={(e) => update(o._id, { status: e.target.value })} className={`text-sm font-semibold rounded-full px-3 py-1 border capitalize ${STATUS_STYLES[o.status]}`}>
                    {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => update(o._id, { paymentStatus: o.paymentStatus === 'paid' ? 'unpaid' : 'paid' })}
                    className={`text-sm font-semibold rounded-full px-3 py-1 border ${o.paymentStatus === 'paid' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-gray-100 text-gray-600'}`}>
                    {o.paymentStatus === 'paid' ? '✓ Paid' : 'Mark paid'}
                  </button>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4 mt-3 text-sm">
                <div>
                  <p className="font-semibold">{o.customer.name}</p>
                  <p className="text-gray-600">{o.customer.phone}{o.customer.email ? ` · ${o.customer.email}` : ''}</p>
                  <p className="text-gray-600 mt-1 flex items-start gap-1"><MapPin size={14} className="mt-0.5 shrink-0" /> {o.shipping.area}, {o.shipping.county}{o.shipping.address ? ` — ${o.shipping.address}` : ''}</p>
                  {o.note && <p className="mt-1 italic text-gray-500">&ldquo;{o.note}&rdquo;</p>}
                </div>
                <div>
                  {o.items.map((i, idx) => <div key={idx} className="flex justify-between"><span>{i.name} ×{i.qty}</span><span>{money(i.price * i.qty)}</span></div>)}
                  <div className="flex justify-between text-gray-500 border-t mt-1 pt-1"><span>Shipping</span><span>{money(o.shipping.fee)}</span></div>
                  <div className="flex justify-between font-bold"><span>Total</span><span className="text-pink-600">{money(o.total)}</span></div>
                </div>
              </div>
              <div className="flex gap-4 mt-3 pt-3 border-t text-sm">
                <a href={`https://wa.me/${o.customer.phone}?text=${encodeURIComponent(`Hello ${o.customer.name}, this is Nellie Best Collections about your order ${o.orderNumber} (${money(o.total)}). Status: ${o.status}.`)}`}
                  target="_blank" rel="noreferrer" className="text-green-600 font-semibold flex items-center gap-1"><MessageCircle size={16} /> WhatsApp customer</a>
                <button onClick={() => remove(o._id)} className="text-red-500 flex items-center gap-1 ml-auto"><Trash2 size={16} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Products ----------
function ProductsTab({ token, products, reloadProducts, notify }: { token: string; products: Product[]; reloadProducts: () => void; notify: Notify }) {
  const blank = { name: '', price: '', category: 'Male Clothes', subCategory: 'Boxers', image: '', description: '' };
  const [form, setForm] = useState(blank);
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: '', category: 'Male Clothes', subCategory: 'Boxers', price: '', image: '' });

  const call = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); notify(ok); reloadProducts(); } catch (e) { notify(e instanceof Error ? e.message : 'Failed', 'error'); }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    call(async () => { await api('/api/products', { method: 'POST', token, body: { ...form, price: Number(form.price) } }); setForm(blank); }, 'Product added');
  };
  const startEdit = (p: Product) => { setEditingId(pid(p)); setEdit({ name: p.name, category: p.category, subCategory: p.subCategory, price: String(p.price), image: p.image }); };
  const saveEdit = (id: string) => call(async () => { await api(`/api/products/${id}`, { method: 'PUT', token, body: { ...edit, price: Number(edit.price) } }); setEditingId(null); }, 'Product updated');
  const toggleStock = (p: Product) => call(() => api(`/api/products/${pid(p)}`, { method: 'PUT', token, body: { inStock: p.inStock === false } }), p.inStock === false ? 'Back in stock' : 'Marked out of stock');
  const remove = (p: Product) => { if (window.confirm(`Delete "${p.name}"?`)) call(() => api(`/api/products/${pid(p)}`, { method: 'DELETE', token }), 'Product deleted'); };

  const shown = products.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()) || p.category.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <Card title="Add New Product" icon={<Plus />}>
        <form onSubmit={add} className="space-y-3">
          <input className={inputCls} placeholder="Product Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className={inputCls} type="number" min={0} placeholder="Price (Ksh)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, subCategory: CATEGORIES[e.target.value][0] })}>
            {Object.keys(CATEGORIES).map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className={inputCls} value={form.subCategory} onChange={(e) => setForm({ ...form, subCategory: e.target.value })}>
            {CATEGORIES[form.category].map((s) => <option key={s}>{s}</option>)}
          </select>
          <input className={inputCls} placeholder="Image URL https://..." value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} required />
          {form.image && <img src={form.image} alt="Preview" className="h-24 mx-auto object-contain rounded border" onError={(e) => (e.currentTarget.style.display = 'none')} onLoad={(e) => (e.currentTarget.style.display = 'block')} />}
          <button type="submit" className={`${btnPink} w-full p-2 text-sm`}>Save Item</button>
        </form>
      </Card>

      <div className="xl:col-span-2">
        <Card title={`Inventory (${products.length})`} icon={<SettingsIcon />}>
          <input className={`${inputCls} mb-3`} placeholder="Filter by name or category..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[640px]">
              <thead><tr className="bg-gray-50 border-b"><th className="p-2">Image</th><th className="p-2">Name</th><th className="p-2">Category</th><th className="p-2">Price</th><th className="p-2">Stock</th><th className="p-2 text-right">Actions</th></tr></thead>
              <tbody>
                {shown.map((p) => {
                  const id = pid(p); const ed = editingId === id;
                  return (
                    <tr key={id} className="border-b hover:bg-gray-50 align-top">
                      <td className="p-2"><img src={getImageUrl(p.image) || p.image} alt={p.name} className="w-12 h-12 object-cover rounded" /></td>
                      <td className="p-2">{ed ? <div className="space-y-1"><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /><input className={inputCls} placeholder="Image URL" value={edit.image} onChange={(e) => setEdit({ ...edit, image: e.target.value })} /></div> : p.name}</td>
                      <td className="p-2">{ed ? (
                        <div className="space-y-1">
                          <select className={inputCls} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value, subCategory: CATEGORIES[e.target.value][0] })}>{Object.keys(CATEGORIES).map((c) => <option key={c}>{c}</option>)}</select>
                          <select className={inputCls} value={edit.subCategory} onChange={(e) => setEdit({ ...edit, subCategory: e.target.value })}>{(CATEGORIES[edit.category] || []).map((s) => <option key={s}>{s}</option>)}</select>
                        </div>
                      ) : <>{p.category}<br /><span className="text-xs text-gray-500">{p.subCategory}</span></>}</td>
                      <td className="p-2">{ed ? <input type="number" className={`${inputCls} w-24`} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /> : money(p.price)}</td>
                      <td className="p-2"><button onClick={() => toggleStock(p)} className={`text-xs font-bold px-2 py-1 rounded-full ${p.inStock === false ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{p.inStock === false ? 'Out' : 'In stock'}</button></td>
                      <td className="p-2 text-right space-x-3 whitespace-nowrap">
                        {ed ? (<><button onClick={() => saveEdit(id)} className="text-green-600 font-bold">Save</button><button onClick={() => setEditingId(null)} className="text-gray-500 font-bold">Cancel</button></>) : (
                          <><button onClick={() => startEdit(p)} className="text-blue-500 hover:text-blue-700" title="Edit"><Edit size={18} /></button><button onClick={() => remove(p)} className="text-red-500 hover:text-red-700" title="Delete"><Trash2 size={18} /></button></>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && <p className="text-center text-gray-500 py-6">No products found.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------- Customers ----------
function CustomersTab({ token, selfEmail, notify }: { token: string; selfEmail: string; notify: Notify }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const load = useCallback(() => { api('/api/admin/users', { token }).then(setUsers).catch((e) => notify(e.message, 'error')); }, [token, notify]);
  useEffect(() => { load(); }, [load]);

  const patch = async (u: AdminUser, body: object, msg: string) => {
    try { await api(`/api/admin/users/${u._id}`, { method: 'PUT', token, body }); notify(msg); load(); } catch (e) { notify(e instanceof Error ? e.message : 'Failed', 'error'); }
  };
  const del = async (u: AdminUser) => {
    if (!window.confirm(`Delete ${u.email}?`)) return;
    try { await api(`/api/admin/users/${u._id}`, { method: 'DELETE', token }); notify('User deleted'); load(); } catch (e) { notify(e instanceof Error ? e.message : 'Failed', 'error'); }
  };

  const shown = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card title={`Customers & Admins (${users.length})`} icon={<Users />}>
      <input className={`${inputCls} mb-3`} placeholder="Search name or email..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[640px]">
          <thead><tr className="bg-gray-50 border-b"><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Role</th><th className="p-2">Joined</th><th className="p-2 text-right">Actions</th></tr></thead>
          <tbody>
            {shown.map((u) => {
              const self = u.email === selfEmail;
              return (
                <tr key={u._id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{u.name || '—'}</td>
                  <td className="p-2 break-all">{u.email}</td>
                  <td className="p-2">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${u.blocked ? 'bg-red-100 text-red-700' : u.isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{u.blocked ? 'Blocked' : u.isAdmin ? 'Admin' : 'Client'}</span>
                  </td>
                  <td className="p-2">{fmtDate(u.createdAt)}</td>
                  <td className="p-2 text-right space-x-3 whitespace-nowrap">
                    {self ? <span className="text-xs text-gray-400">You</span> : (
                      <>
                        <button onClick={() => patch(u, { isAdmin: !u.isAdmin }, u.isAdmin ? 'Admin rights removed' : 'Promoted to admin')} className="text-purple-600 text-xs font-semibold">{u.isAdmin ? 'Remove admin' : 'Make admin'}</button>
                        <button onClick={() => patch(u, { blocked: !u.blocked }, u.blocked ? 'User unblocked' : 'User blocked')} className="text-orange-600" title={u.blocked ? 'Unblock' : 'Block'}><Ban size={16} /></button>
                        <button onClick={() => del(u)} className="text-red-500" title="Delete"><Trash2 size={16} /></button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Shipping ----------
function ShippingTab({ token, notify, reloadShipping }: { token: string; notify: Notify; reloadShipping: () => void }) {
  const [locs, setLocs] = useState<ShipLoc[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [countyFee, setCountyFee] = useState<Record<string, string>>({});
  const [areaFee, setAreaFee] = useState<Record<string, string>>({});
  const [newArea, setNewArea] = useState({ area: '', fee: '' });

  const load = useCallback(() => { api('/api/admin/shipping', { token }).then(setLocs).catch((e) => notify(e.message, 'error')); }, [token, notify]);
  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const m = new Map<string, ShipLoc[]>();
    locs.forEach((l) => m.set(l.county, [...(m.get(l.county) || []), l]));
    return Array.from(m.entries()).filter(([c]) => c.toLowerCase().includes(q.toLowerCase()));
  }, [locs, q]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); notify(ok); load(); reloadShipping(); } catch (e) { notify(e instanceof Error ? e.message : 'Failed', 'error'); }
  };
  const setCounty = (county: string, body: object, ok: string) => run(() => api('/api/admin/shipping-county', { method: 'PUT', token, body: { county, ...body } }), ok);

  return (
    <Card title={`Shipping Zones — ${grouped.length} counties, ${locs.length} areas`} icon={<Truck />}>
      <p className="text-sm text-gray-500 mb-3">Set a delivery fee for a whole county, or fine-tune individual towns. Switch a county off if you don&apos;t deliver there.</p>
      <input className={`${inputCls} mb-3`} placeholder="Search county..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="space-y-2">
        {grouped.map(([county, list]) => {
          const allActive = list.every((l) => l.active);
          const isOpen = open === county;
          return (
            <div key={county} className="border rounded-lg">
              <div className="flex flex-wrap items-center gap-2 p-3">
                <button onClick={() => setOpen(isOpen ? null : county)} className="flex items-center gap-1 font-bold flex-1 min-w-[140px] text-left">
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />} {county} <span className="text-xs font-normal text-gray-400">({list.length})</span>
                </button>
                <span className="text-xs text-gray-500">{money(Math.min(...list.map((l) => l.fee)))}{list.some((l) => l.fee !== list[0].fee) ? '+' : ''}</span>
                <input type="number" min={0} placeholder="Fee" value={countyFee[county] ?? ''} onChange={(e) => setCountyFee({ ...countyFee, [county]: e.target.value })} className="w-20 p-1.5 border rounded text-sm" />
                <button disabled={!countyFee[county]} onClick={() => setCounty(county, { fee: Number(countyFee[county]) }, `${county} fees updated`).then(() => setCountyFee({ ...countyFee, [county]: '' }))}
                  className={`${btnPink} px-3 py-1.5 text-xs`}>Apply to all</button>
                <button onClick={() => setCounty(county, { active: !allActive }, allActive ? `${county} disabled` : `${county} enabled`)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full ${allActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{allActive ? 'Delivering' : 'Off'}</button>
              </div>
              {isOpen && (
                <div className="border-t bg-gray-50 p-3 space-y-1.5">
                  {list.map((l) => (
                    <div key={l._id} className="flex items-center gap-2 text-sm">
                      <span className={`flex-1 ${l.active ? '' : 'line-through text-gray-400'}`}>{l.area}</span>
                      <input type="number" min={0} value={areaFee[l._id] ?? String(l.fee)} onChange={(e) => setAreaFee({ ...areaFee, [l._id]: e.target.value })} className="w-24 p-1 border rounded" />
                      <button onClick={() => run(() => api(`/api/admin/shipping/${l._id}`, { method: 'PUT', token, body: { fee: Number(areaFee[l._id] ?? l.fee) } }), `${l.area} saved`)} className="text-green-600" title="Save fee"><Check size={18} /></button>
                      <button onClick={() => run(() => api(`/api/admin/shipping/${l._id}`, { method: 'PUT', token, body: { active: !l.active } }), l.active ? 'Area disabled' : 'Area enabled')} className="text-orange-500" title="Toggle"><Ban size={16} /></button>
                      <button onClick={() => window.confirm(`Remove ${l.area}?`) && run(() => api(`/api/admin/shipping/${l._id}`, { method: 'DELETE', token }), 'Area removed')} className="text-red-500" title="Remove"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2 border-t mt-2">
                    <input placeholder="New town / area" value={newArea.area} onChange={(e) => setNewArea({ ...newArea, area: e.target.value })} className="flex-1 p-1.5 border rounded text-sm" />
                    <input type="number" min={0} placeholder="Fee" value={newArea.fee} onChange={(e) => setNewArea({ ...newArea, fee: e.target.value })} className="w-20 p-1.5 border rounded text-sm" />
                    <button disabled={!newArea.area || !newArea.fee} onClick={() => run(async () => { await api('/api/admin/shipping', { method: 'POST', token, body: { county, area: newArea.area, fee: Number(newArea.fee) } }); setNewArea({ area: '', fee: '' }); }, 'Area added')} className={`${btnPink} px-3 text-xs`}>Add</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- Settings ----------
function SettingsTab({ token, settings, setSettings, notify }: { token: string; settings: ShopSettings; setSettings: (s: ShopSettings) => void; notify: Notify }) {
  const [f, setF] = useState(settings);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  useEffect(() => setF(settings), [settings]);

  const save = async () => {
    try {
      const saved = await api('/api/settings', { method: 'PUT', token, body: { ...f, freeShippingThreshold: Number(f.freeShippingThreshold) || 0 } });
      setSettings({ ...DEFAULT_SETTINGS, ...saved }); notify('Settings saved');
    } catch (e) { notify(e instanceof Error ? e.message : 'Failed', 'error'); }
  };
  const changePw = async () => {
    try { await api('/api/me/password', { method: 'PUT', token, body: pw }); setPw({ currentPassword: '', newPassword: '' }); notify('Password changed'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Failed', 'error'); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Shop Settings" icon={<SettingsIcon />}>
        <div className="space-y-3 text-sm">
          <label className="block"><span className="text-xs text-gray-500">Tagline</span><input className={inputCls} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-gray-500">Announcement banner (leave empty to hide)</span><input className={inputCls} value={f.announcement} onChange={(e) => setF({ ...f, announcement: e.target.value })} placeholder="e.g. Free delivery in Kirinyaga this week!" /></label>
          <label className="block"><span className="text-xs text-gray-500">Order WhatsApp number</span><input className={inputCls} value={f.whatsappNumber} onChange={(e) => setF({ ...f, whatsappNumber: e.target.value })} placeholder="2547XXXXXXXX" /></label>
          <label className="block"><span className="text-xs text-gray-500">Free shipping above (Ksh, 0 = off)</span><input type="number" min={0} className={inputCls} value={f.freeShippingThreshold} onChange={(e) => setF({ ...f, freeShippingThreshold: Number(e.target.value) })} /></label>
          <label className="block"><span className="text-xs text-gray-500">M-Pesa payment instructions (shown after an order)</span><textarea rows={3} className={inputCls} value={f.paymentInstructions} onChange={(e) => setF({ ...f, paymentInstructions: e.target.value })} placeholder={'Pay to Till No: XXXXXX\nUse your order number as reference.'} /></label>
          <button onClick={save} className={`${btnPink} w-full p-2`}>Save Settings</button>
        </div>
      </Card>
      <Card title="Change My Password" icon={<ShieldCheck />}>
        <div className="space-y-3">
          <input type="password" className={inputCls} placeholder="Current password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          <input type="password" className={inputCls} placeholder="New password (6+ characters)" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          <button onClick={changePw} disabled={!pw.currentPassword || pw.newPassword.length < 6} className={`${btnPink} w-full p-2 text-sm`}>Update Password</button>
        </div>
      </Card>
    </div>
  );
}
