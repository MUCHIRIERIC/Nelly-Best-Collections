const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// --- CLOUDINARY CONFIGURATION ---
// Add these to your .env file on your hosting platform
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'nellybest_collections',
        allowedFormats: ['jpg', 'png', 'jpeg', 'webp'],
    },
});
const upload = multer({ storage: storage });

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB successfully"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// --- SCHEMAS & MODELS ---
const UserSchema = new mongoose.Schema({
    name: { type: String, required: false },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    subCategory: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, required: true },
    isWeeklyDeal: { type: Boolean, default: false },
    weeklyGiftDescription: { type: String, default: "" }
});
const Product = mongoose.model('Product', ProductSchema);

const SettingsSchema = new mongoose.Schema({
    tagline: { type: String, default: "Quality Fashion for Everyone" }
});
const Settings = mongoose.model('Settings', SettingsSchema);

// --- ADMIN CONFIGURATION & SEEDING ---
const ADMIN_EMAILS = [
    "muchirimunene031@gmail.com",
    "ericnelly53@gmail.com",
    "muthoninellian@gmail.com"
];

const seedAdmins = async () => {
    for (const email of ADMIN_EMAILS) {
        const existingAdmin = await User.findOne({ email });
        if (!existingAdmin) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash("Admin@123", salt); // Default password for new admins
            await User.create({ email, password: hashedPassword, isAdmin: true });
            console.log(`✅ Admin seeded: ${email}`);
        }
    }
    
    const settings = await Settings.findOne();
    if (!settings) await Settings.create({});
};
seedAdmins();

// --- AUTH MIDDLEWARE ---
const protect = (req, res, next) => {
    const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token failed' });
    }
};

// --- API ROUTES ---

// 1. Unified Register (Handles both Admin detection and Clients)
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: 'User already exists' });

        const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            isAdmin
        });

        const token = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '30d' });
        res.status(201).json({ token, email: user.email, name: user.name, isAdmin: user.isAdmin });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// 2. Unified Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user && (await bcrypt.compare(password, user.password))) {
            const token = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '30d' });
            res.json({ token, email: user.email, name: user.name, isAdmin: user.isAdmin });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// 3. Get All Products
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find({}).sort({ _id: -1 });
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch products' });
    }
});

// 4. Add New Product (Admin Only, Cloudinary Upload)
app.post('/api/products', protect, upload.single('image'), async (req, res) => {
    try {
        if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

        const { name, category, subCategory, price } = req.body;
        // Cloudinary returns the secure URL in req.file.path
        const imageUrl = req.file ? req.file.path : req.body.image;

        const product = new Product({ name, category, subCategory, price, image: imageUrl });
        const savedProduct = await product.save();
        res.status(201).json(savedProduct);
    } catch (error) {
        res.status(500).json({ message: 'Failed to add product' });
    }
});

// 5. Update Product (Admin Only) - Aligns with page_2.tsx handleSaveEdit
app.put('/api/products/:id', protect, async (req, res) => {
    try {
        if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
        
        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedProduct);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update product' });
    }
});

// 6. Delete Product (Admin Only) - Aligns with page_2.tsx handleDeleteProduct
app.delete('/api/products/:id', protect, async (req, res) => {
    try {
        if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete product' });
    }
});

// 7. Set Weekly Deal (Admin Only) - Aligns with page_2.tsx handleWeeklyDealUpdate
app.put('/api/weekly-deal', protect, async (req, res) => {
    try {
        if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

        const { productId, weeklyGiftDescription } = req.body;
        
        // Reset previous deals
        await Product.updateMany({}, { isWeeklyDeal: false, weeklyGiftDescription: "" });
        
        // Apply new deal
        const updatedProduct = await Product.findByIdAndUpdate(
            productId, 
            { isWeeklyDeal: true, weeklyGiftDescription }, 
            { new: true }
        );
        res.json(updatedProduct);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update weekly deal' });
    }
});

// 8. Get Tagline Settings
app.get('/api/settings', async (req, res) => {
    const settings = await Settings.findOne();
    res.json(settings);
});

// 9. Update Tagline (Admin Only)
app.put('/api/settings', protect, async (req, res) => {
    try {
        if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

        const { tagline } = req.body;
        let settings = await Settings.findOne();
        settings.tagline = tagline;
        await settings.save();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update settings' });
    }
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
