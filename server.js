require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const cors = require('cors');

const User = require('./model/user');
const Casal = require('./model/casal');

const app = express();

// ---------- Configurações Cloudinary ----------
cloudinary.config({
cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
api_key: process.env.CLOUDINARY_API_KEY,
api_secret: process.env.CLOUDINARY_API_SECRET
});

// ---------- Middlewares ----------
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------- CORS Global ----------
app.use(cors({
origin: '*', // permite qualquer origem
methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'token']
}));

// ---------- Tratamento de pré-vôo OPTIONS ----------
app.options('*', (req, res) => {
res.header('Access-Control-Allow-Origin', '*');
res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization,token');
res.sendStatus(200);
});

// ---------- JWT Auth Middleware ----------
app.use((req, res, next) => {
// rotas públicas
if (['/', '/login', '/register'].includes(req.path)) return next();

const authHeader = req.headers.authorization || req.headers.token;
if (!authHeader) return res.status(401).json({ status: false, errorMessage: 'Token não enviado!' });

let token = authHeader;
if (token.toLowerCase().startsWith('bearer ')) token = token.slice(7).trim();

jwt.verify(token, process.env.SECRET, (err, decoded) => {
if (err || !decoded || !decoded.id) return res.status(401).json({ status: false, errorMessage: 'Usuário não autorizado!' });
req.user = decoded;
next();
});
});

// ---------- DB Connect ----------
(async function connectDB() {
try {
if (!process.env.DB_URL) throw new Error('DB_URL não encontrada no .env');
await mongoose.connect(process.env.DB_URL);
console.log('DB conectado');
} catch (err) {
console.error('Erro ao conectar DB:', err);
process.exit(1);
}
})();

// ---------- JWT Generator ----------
function generateToken(userDoc) {
return new Promise((resolve, reject) => {
jwt.sign({ id: userDoc._id, username: userDoc.username }, process.env.SECRET, { expiresIn: '1d' }, (err, token) => {
if (err) return reject(err);
resolve(token);
});
});
}

// ---------- Multer memory storage ----------
const upload = multer({ storage: multer.memoryStorage() });

// ---------- Rotas ----------

// Test
app.get('/', (req, res) => res.json({ status: true, title: 'APIs rodando' }));

// Register
app.post('/register', async (req, res) => {
try {
const { username, password } = req.body;
if (!username || !password) return res.status(400).json({ status: false, errorMessage: 'Adicione username e password' });


const exists = await User.findOne({ username });
if (exists) return res.status(400).json({ status: false, errorMessage: `Usuario ${username} já existe!` });

const hashed = await bcrypt.hash(password, 10);
const newUser = new User({ username, password: hashed });
await newUser.save();

res.status(201).json({ status: true, title: 'Usuário registrado com sucesso.' });


} catch (e) {
console.error('Register error:', e);
res.status(500).json({ status: false, errorMessage: 'Erro ao registrar usuário.' });
}
});

// Login
app.post('/login', async (req, res) => {
try {
const { username, password } = req.body;
if (!username || !password) return res.status(400).json({ status: false, errorMessage: 'Adicione username e password' });


const found = await User.findOne({ username });
if (!found) return res.status(400).json({ status: false, errorMessage: 'Nome de usuário ou senha está incorreta!' });

const match = await bcrypt.compare(password, found.password);
if (!match) return res.status(400).json({ status: false, errorMessage: 'Nome de usuário ou senha está incorreta!' });

const token = await generateToken(found);
res.json({ status: true, message: 'Usuario logado com sucesso.', token, id: found._id });


} catch (e) {
console.error('Login error:', e);
res.status(500).json({ status: false, errorMessage: 'Erro no login.' });
}
});

// ---------- Start Server ----------
const port = process.env.PORT || 2000;
app.listen(port, () => {
console.log(`Servidor rodando na porta ${port}`);
});
