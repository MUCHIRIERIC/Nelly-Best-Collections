const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB successfully'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// =====================================================================
// SCHEMAS & MODELS
// =====================================================================
const UserSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  blocked: { type: Boolean, default: false }
}, { timestamps: true });
const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  subCategory: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  image: { type: String, required: true },
  description: { type: String, default: '' },
  inStock: { type: Boolean, default: true },
  isWeeklyDeal: { type: Boolean, default: false },
  weeklyGiftDescription: { type: String, default: '' }
}, { timestamps: true });
const Product = mongoose.model('Product', ProductSchema);

const SettingsSchema = new mongoose.Schema({
  tagline: { type: String, default: 'Quality Fashion for Everyone' },
  whatsappNumber: { type: String, default: '254746956162' },
  freeShippingThreshold: { type: Number, default: 0 }, // 0 = disabled
  announcement: { type: String, default: '' },
  paymentInstructions: { type: String, default: '' }
});
const Settings = mongoose.model('Settings', SettingsSchema);

// One document per delivery area. Fee is editable per area or per county.
const ShippingLocationSchema = new mongoose.Schema({
  county: { type: String, required: true, index: true },
  area: { type: String, required: true },
  fee: { type: Number, required: true, min: 0 },
  active: { type: Boolean, default: true }
});
ShippingLocationSchema.index({ county: 1, area: 1 }, { unique: true });
const ShippingLocation = mongoose.model('ShippingLocation', ShippingLocationSchema);

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const OrderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  customer: {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' }
  },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    qty: Number,
    image: String
  }],
  shipping: {
    county: String,
    area: String,
    address: { type: String, default: '' },
    fee: { type: Number, default: 0 }
  },
  subtotal: Number,
  total: Number,
  paymentMethod: { type: String, enum: ['mpesa', 'cod'], default: 'mpesa' },
  paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
  status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
  note: { type: String, default: '' },
  adminNote: { type: String, default: '' }
}, { timestamps: true });
const Order = mongoose.model('Order', OrderSchema);

// =====================================================================
// KENYAN SHIPPING DATA  (all 47 counties + main towns/areas)
// Default fees are by distance from Mwea (Kirinyaga). Edit them in the
// admin panel -> Shipping tab.
// =====================================================================
const TIER_FEES = { local: 100, nairobi: 250, near: 300, mid: 400, far: 550, remote: 800 };
const KENYA_LOCATIONS = [
  ['Mombasa', 'far', 'Mombasa CBD,Nyali,Likoni,Changamwe,Kisauni,Mikindani,Bamburi'],
  ['Kwale', 'far', 'Ukunda,Kwale Town,Msambweni,Lunga Lunga,Kinango,Diani'],
  ['Kilifi', 'far', 'Kilifi Town,Malindi,Mtwapa,Watamu,Mariakani,Kaloleni,Mazeras'],
  ['Tana River', 'remote', 'Hola,Garsen,Bura,Madogo'],
  ['Lamu', 'remote', 'Lamu Town,Mpeketoni,Witu,Faza'],
  ['Taita-Taveta', 'far', 'Voi,Wundanyi,Taveta,Mwatate'],
  ['Garissa', 'remote', 'Garissa Town,Dadaab,Masalani,Modogashe'],
  ['Wajir', 'remote', 'Wajir Town,Habaswein,Eldas,Tarbaj'],
  ['Mandera', 'remote', 'Mandera Town,Elwak,Rhamu,Takaba'],
  ['Marsabit', 'remote', 'Marsabit Town,Moyale,Sololo,Laisamis'],
  ['Isiolo', 'mid', 'Isiolo Town,Merti,Garbatulla,Kinna'],
  ['Meru', 'near', 'Meru Town,Maua,Nkubu,Timau,Mitunguu,Kianjai'],
  ['Tharaka-Nithi', 'near', 'Chuka,Marimanti,Chogoria,Kathwana'],
  ['Embu', 'near', 'Embu Town,Runyenjes,Siakago,Kiritiri,Manyatta'],
  ['Kitui', 'mid', 'Kitui Town,Mwingi,Mutomo,Kyuso,Kabati'],
  ['Machakos', 'near', 'Machakos Town,Athi River,Kangundo,Tala,Matuu,Mlolongo'],
  ['Makueni', 'mid', 'Wote,Emali,Makindu,Sultan Hamud,Mtito Andei'],
  ['Nyandarua', 'near', 'Ol Kalou,Engineer,Ndaragwa,Njabini,Ol Joro Orok'],
  ['Nyeri', 'near', 'Nyeri Town,Karatina,Othaya,Mukurwe-ini,Naro Moru,Mweiga'],
  ['Kirinyaga', 'local', 'Mwea,Wanguru,Kutus,Kerugoya,Sagana,Kianyaga,Baricho,Kagio,Ngurubani,Makutano'],
  ["Murang'a", 'near', "Murang'a Town,Kenol,Maragua,Kangari,Kandara,Makuyu"],
  ['Kiambu', 'near', 'Thika,Ruiru,Juja,Kiambu Town,Limuru,Kikuyu,Githunguri,Karuri,Gatundu,Kamiti'],
  ['Turkana', 'remote', 'Lodwar,Kakuma,Lokichogio,Lokichar'],
  ['West Pokot', 'far', 'Kapenguria,Makutano (West Pokot),Chepareria,Sigor'],
  ['Samburu', 'remote', "Maralal,Baragoi,Archer's Post,Wamba"],
  ['Trans-Nzoia', 'far', 'Kitale,Kiminini,Endebess,Saboti'],
  ['Uasin Gishu', 'mid', "Eldoret,Moi's Bridge,Burnt Forest,Turbo,Ziwa"],
  ['Elgeyo-Marakwet', 'mid', 'Iten,Kapsowar,Tambach,Chebiemit'],
  ['Nandi', 'mid', 'Kapsabet,Nandi Hills,Mosoriot,Kabiyet'],
  ['Baringo', 'mid', 'Kabarnet,Eldama Ravine,Marigat,Kabartonjo'],
  ['Laikipia', 'near', 'Nanyuki,Nyahururu,Rumuruti,Naibor'],
  ['Nakuru', 'mid', 'Nakuru Town,Naivasha,Gilgil,Molo,Njoro,Subukia,Mai Mahiu'],
  ['Narok', 'mid', 'Narok Town,Kilgoris,Ololulunga,Mulot'],
  ['Kajiado', 'mid', 'Kitengela,Ngong,Ongata Rongai,Kajiado Town,Kiserian,Isinya,Namanga'],
  ['Kericho', 'mid', 'Kericho Town,Litein,Kipkelion,Londiani'],
  ['Bomet', 'mid', 'Bomet Town,Sotik,Longisa,Mulot (Bomet)'],
  ['Kakamega', 'far', 'Kakamega Town,Mumias,Malava,Butere,Lurambi'],
  ['Vihiga', 'far', 'Mbale,Luanda,Chavakali,Hamisi'],
  ['Bungoma', 'far', 'Bungoma Town,Webuye,Kimilili,Chwele,Malakisi'],
  ['Busia', 'far', 'Busia Town,Malaba,Port Victoria,Funyula,Nambale'],
  ['Siaya', 'far', 'Siaya Town,Bondo,Ugunja,Yala,Usenge'],
  ['Kisumu', 'far', 'Kisumu Town,Ahero,Maseno,Muhoroni,Kondele'],
  ['Homa Bay', 'far', 'Homa Bay Town,Mbita,Kendu Bay,Oyugis,Ndhiwa'],
  ['Migori', 'far', 'Migori Town,Awendo,Rongo,Isebania,Kehancha'],
  ['Kisii', 'far', 'Kisii Town,Ogembo,Suneka,Nyamache'],
  ['Nyamira', 'far', 'Nyamira Town,Keroka,Nyansiongo'],
  ['Nairobi', 'nairobi', 'Nairobi CBD,Westlands,Kilimani,Karen,Embakasi,Eastleigh,Kasarani,Roysambu,Langata,Kibera,Dagoretti,Githurai,Donholm,Umoja,Kayole,South B,South C,Lavington,Parklands,Ruai,Ngara,Pangani,Kahawa,Zimmerman']
];

const seedShipping = async () => {
  if ((await ShippingLocation.countDocuments()) > 0) return;
  const docs = [];
  for (const [county, tier, towns] of KENYA_LOCATIONS) {
    const fee = TIER_FEES[tier];
    for (const area of towns.split(',')) docs.push({ county, area: area.trim(), fee });
    docs.push({ county, area: 'Other (specify in address)', fee });
  }
  await ShippingLocation.insertMany(docs);
  console.log(`✅ Seeded ${docs.length} shipping areas across ${KENYA_LOCATIONS.length} counties`);
};

// =====================================================================
// ADMIN CONFIG & SEEDING
// =====================================================================
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS
  ? process.env.ADMIN_EMAILS.split(',')
  : ['muchirimunene031@gmail.com', 'ericnelly53@gmail.com', 'muthoninellian@gmail.com']
).map((e) => e.trim().toLowerCase());

const seed = async () => {
  try {
    for (const email of ADMIN_EMAILS) {
      const existing = await User.findOne({ email });
      if (!existing) {
        const hashed = await bcrypt.hash(process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@123', 10);
        await User.create({ email, password: hashed, isAdmin: true });
        console.log(`✅ Admin seeded: ${email}  (change the default password after first login!)`);
      }
    }
    if (!(await Settings.findOne())) await Settings.create({});
    await seedShipping();
  } catch (err) {
    console.error('Seeding error:', err);
  }
};
mongoose.connection.once('open', seed);

// =====================================================================
// HELPERS & MIDDLEWARE
// =====================================================================
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const signToken = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
const publicUser = (u) => ({ id: u._id, email: u.email, name: u.name, isAdmin: u.isAdmin });

const normalizePhone = (raw = '') => {
  const m = String(raw).replace(/[\s-]/g, '').match(/^(?:\+?254|0)?([71]\d{8})$/);
  return m ? `254${m[1]}` : null;
};

const loadUser = async (req) => {
  const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    return user && !user.blocked ? user : null;
  } catch { return null; }
};

// Role and blocked-state are read from the DB each request, so changes apply immediately.
const protect = wrap(async (req, res, next) => {
  const user = await loadUser(req);
  if (!user) return res.status(401).json({ message: 'Not authorized' });
  req.user = user;
  next();
});
const optionalAuth = wrap(async (req, res, next) => { req.user = await loadUser(req); next(); });
const adminOnly = (req, res, next) =>
  req.user && req.user.isAdmin ? next() : res.status(403).json({ message: 'Admin access required' });
const admin = [protect, adminOnly];

const makeOrderNumber = () => {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `NBC-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
};

// =====================================================================
// AUTH
// =====================================================================
app.post('/api/register', wrap(async (req, res) => {
  const { name, password } = req.body;
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !password || password.length < 6)
    return res.status(400).json({ message: 'Valid email and a password of 6+ characters are required' });
  if (await User.findOne({ email })) return res.status(400).json({ message: 'User already exists' });

  const user = await User.create({
    name, email,
    password: await bcrypt.hash(password, 10),
    isAdmin: ADMIN_EMAILS.includes(email)
  });
  res.status(201).json({ token: signToken(user), ...publicUser(user) });
}));

app.post('/api/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password)))
    return res.status(401).json({ message: 'Invalid credentials' });
  if (user.blocked) return res.status(403).json({ message: 'This account has been blocked. Contact the shop.' });
  res.json({ token: signToken(user), ...publicUser(user) });
}));

app.get('/api/me', protect, (req, res) => res.json(publicUser(req.user)));

app.put('/api/me/password', protect, wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'New password must be 6+ characters' });
  if (!(await bcrypt.compare(currentPassword || '', req.user.password)))
    return res.status(400).json({ message: 'Current password is incorrect' });
  req.user.password = await bcrypt.hash(newPassword, 10);
  await req.user.save();
  res.json({ message: 'Password updated' });
}));

// =====================================================================
// PRODUCTS
// =====================================================================
const PRODUCT_FIELDS = ['name', 'category', 'subCategory', 'price', 'image', 'description', 'inStock'];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

app.get('/api/products', wrap(async (req, res) => {
  res.json(await Product.find({}).sort({ _id: -1 }));
}));

app.post('/api/products', admin, wrap(async (req, res) => {
  const product = await Product.create(pick(req.body, PRODUCT_FIELDS));
  res.status(201).json(product);
}));

app.put('/api/products/:id', admin, wrap(async (req, res) => {
  const updated = await Product.findByIdAndUpdate(req.params.id, pick(req.body, PRODUCT_FIELDS), { new: true, runValidators: true });
  if (!updated) return res.status(404).json({ message: 'Product not found' });
  res.json(updated);
}));

app.delete('/api/products/:id', admin, wrap(async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: 'Product deleted successfully' });
}));

// Set (or clear when productId is empty) the weekly deal
app.put('/api/weekly-deal', admin, wrap(async (req, res) => {
  const { productId, weeklyGiftDescription } = req.body;
  await Product.updateMany({}, { isWeeklyDeal: false, weeklyGiftDescription: '' });
  if (!productId) return res.json({ message: 'Weekly deal cleared' });
  const updated = await Product.findByIdAndUpdate(productId, { isWeeklyDeal: true, weeklyGiftDescription: weeklyGiftDescription || '' }, { new: true });
  res.json(updated);
}));

// =====================================================================
// SETTINGS
// =====================================================================
app.get('/api/settings', wrap(async (req, res) => {
  res.json((await Settings.findOne()) || (await Settings.create({})));
}));

app.put('/api/settings', admin, wrap(async (req, res) => {
  const settings = (await Settings.findOne()) || (await Settings.create({}));
  const data = pick(req.body, ['tagline', 'whatsappNumber', 'freeShippingThreshold', 'announcement', 'paymentInstructions']);
  if (data.whatsappNumber !== undefined) {
    const p = normalizePhone(data.whatsappNumber);
    if (!p) return res.status(400).json({ message: 'Invalid WhatsApp number' });
    data.whatsappNumber = p;
  }
  if (data.freeShippingThreshold !== undefined) data.freeShippingThreshold = Math.max(0, Number(data.freeShippingThreshold) || 0);
  Object.assign(settings, data);
  await settings.save();
  res.json(settings);
}));

// =====================================================================
// SHIPPING
// =====================================================================
app.get('/api/shipping', wrap(async (req, res) => {
  res.json(await ShippingLocation.find({ active: true }).sort({ county: 1, area: 1 }));
}));

app.get('/api/admin/shipping', admin, wrap(async (req, res) => {
  res.json(await ShippingLocation.find({}).sort({ county: 1, area: 1 }));
}));

app.post('/api/admin/shipping', admin, wrap(async (req, res) => {
  const { county, area, fee } = req.body;
  if (!county || !area || fee === undefined) return res.status(400).json({ message: 'county, area and fee are required' });
  try {
    res.status(201).json(await ShippingLocation.create({ county, area: String(area).trim(), fee: Number(fee) }));
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'That area already exists in this county' });
    throw e;
  }
}));

app.put('/api/admin/shipping/:id', admin, wrap(async (req, res) => {
  const data = pick(req.body, ['area', 'fee', 'active']);
  if (data.fee !== undefined) data.fee = Math.max(0, Number(data.fee) || 0);
  res.json(await ShippingLocation.findByIdAndUpdate(req.params.id, data, { new: true }));
}));

app.delete('/api/admin/shipping/:id', admin, wrap(async (req, res) => {
  await ShippingLocation.findByIdAndDelete(req.params.id);
  res.json({ message: 'Area removed' });
}));

// Bulk: set fee and/or active for every area in a county
app.put('/api/admin/shipping-county', admin, wrap(async (req, res) => {
  const { county } = req.body;
  const data = pick(req.body, ['fee', 'active']);
  if (!county || !Object.keys(data).length) return res.status(400).json({ message: 'county and fee/active required' });
  if (data.fee !== undefined) data.fee = Math.max(0, Number(data.fee) || 0);
  const r = await ShippingLocation.updateMany({ county }, data);
  res.json({ updated: r.modifiedCount });
}));

// =====================================================================
// ORDERS
// =====================================================================
app.post('/api/orders', optionalAuth, wrap(async (req, res) => {
  const { items, customer = {}, locationId, address = '', note = '', paymentMethod = 'mpesa' } = req.body;

  const phone = normalizePhone(customer.phone);
  if (!customer.name || !phone) return res.status(400).json({ message: 'Valid name and Kenyan phone number are required' });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Cart is empty' });
  if (!mongoose.isValidObjectId(locationId)) return res.status(400).json({ message: 'Please choose a shipping location' });

  const location = await ShippingLocation.findOne({ _id: locationId, active: true });
  if (!location) return res.status(400).json({ message: 'That shipping location is not available' });

  // Prices always come from the database, never from the browser.
  const ids = items.map((i) => i.id).filter((id) => mongoose.isValidObjectId(id));
  const products = await Product.find({ _id: { $in: ids } });
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const orderItems = [];
  for (const i of items) {
    const p = byId.get(String(i.id));
    if (!p) return res.status(400).json({ message: `A product in your cart no longer exists: ${i.name || ''}` });
    if (!p.inStock) return res.status(400).json({ message: `${p.name} is out of stock` });
    const qty = Math.min(50, Math.max(1, parseInt(i.qty, 10) || 1));
    orderItems.push({ product: p._id, name: p.name, price: p.price, qty, image: p.image });
  }

  const settings = (await Settings.findOne()) || {};
  const subtotal = orderItems.reduce((s, i) => s + i.price * i.qty, 0);
  const free = settings.freeShippingThreshold > 0 && subtotal >= settings.freeShippingThreshold;
  const fee = free ? 0 : location.fee;

  const order = await Order.create({
    orderNumber: makeOrderNumber(),
    user: req.user ? req.user._id : null,
    customer: { name: String(customer.name).trim(), phone, email: customer.email || (req.user && req.user.email) || '' },
    items: orderItems,
    shipping: { county: location.county, area: location.area, address, fee },
    subtotal,
    total: subtotal + fee,
    paymentMethod: paymentMethod === 'cod' ? 'cod' : 'mpesa',
    note
  });
  res.status(201).json(order);
}));

app.get('/api/orders/mine', protect, wrap(async (req, res) => {
  res.json(await Order.find({ user: req.user._id }).sort({ createdAt: -1 }));
}));

app.get('/api/admin/orders', admin, wrap(async (req, res) => {
  const filter = ORDER_STATUSES.includes(req.query.status) ? { status: req.query.status } : {};
  res.json(await Order.find(filter).sort({ createdAt: -1 }).limit(500));
}));

app.put('/api/admin/orders/:id', admin, wrap(async (req, res) => {
  const data = pick(req.body, ['status', 'paymentStatus', 'adminNote']);
  if (data.status && !ORDER_STATUSES.includes(data.status)) return res.status(400).json({ message: 'Invalid status' });
  res.json(await Order.findByIdAndUpdate(req.params.id, data, { new: true }));
}));

app.delete('/api/admin/orders/:id', admin, wrap(async (req, res) => {
  await Order.findByIdAndDelete(req.params.id);
  res.json({ message: 'Order deleted' });
}));

// =====================================================================
// CUSTOMERS / USERS
// =====================================================================
app.get('/api/admin/users', admin, wrap(async (req, res) => {
  res.json(await User.find({}).select('-password').sort({ createdAt: -1 }));
}));

app.put('/api/admin/users/:id', admin, wrap(async (req, res) => {
  if (String(req.params.id) === String(req.user._id))
    return res.status(400).json({ message: 'You cannot change your own role or status' });
  const data = pick(req.body, ['isAdmin', 'blocked']);
  res.json(await User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-password'));
}));

app.delete('/api/admin/users/:id', admin, wrap(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) return res.status(400).json({ message: 'You cannot delete yourself' });
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: 'User deleted' });
}));

// =====================================================================
// DASHBOARD STATS
// =====================================================================
app.get('/api/admin/stats', admin, wrap(async (req, res) => {
  const [orders, products, customers, outOfStock, recent, byCounty] = await Promise.all([
    Order.find({}, 'status total paymentStatus'),
    Product.countDocuments(),
    User.countDocuments({ isAdmin: false }),
    Product.countDocuments({ inStock: false }),
    Order.find({}).sort({ createdAt: -1 }).limit(5),
    Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: '$shipping.county', orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
      { $sort: { orders: -1 } }, { $limit: 5 }
    ])
  ]);
  const live = orders.filter((o) => o.status !== 'cancelled');
  res.json({
    totalOrders: orders.length,
    pendingOrders: orders.filter((o) => o.status === 'pending').length,
    revenue: live.reduce((s, o) => s + o.total, 0),
    paidRevenue: live.filter((o) => o.paymentStatus === 'paid').reduce((s, o) => s + o.total, 0),
    products, customers, outOfStock,
    recentOrders: recent,
    topCounties: byCounty
  });
}));

// --- ERROR HANDLER ---
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' });
  res.status(500).json({ message: 'Server error' });
});

// --- START SERVER ---
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
