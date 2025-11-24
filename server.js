require('dotenv').config()

const Conn = require('./conn/conn');
const express = require('express');
const app = express();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const casal = require('./model/casal.js');
const User = require('./model/user.js');

// ------- CONFIGS -------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${Date.now()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.png', '.jpg', '.jpeg'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) return cb(new Error('Only images are allowed'), false);
  cb(null, true);
};

const upload = multer({ storage, fileFilter });

// Middlewares
app.use(cors());
app.use(express.static(UPLOAD_DIR));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Simple JWT auth middleware
app.use(async (req, res, next) => {
  try {
    // Allow public routes
    if (req.path === '/' || req.path === '/login' || req.path === '/register') return next();

    // Accept either Authorization: Bearer <token> or token: <token>
    const authHeader = req.headers.authorization || req.headers.token;
    if (!authHeader) {
      return res.status(401).json({ status: false, errorMessage: 'Token não enviado!' });
    }

    let token = authHeader;
    if (typeof token === 'string' && token.toLowerCase().startsWith('bearer ')) {
      token = token.slice(7).trim();
    }

    jwt.verify(token, process.env.SECRET, (err, decoded) => {
      if (err || !decoded || !decoded.user) {
        return res.status(401).json({ status: false, errorMessage: 'Usuário não autorizado!' });
      }
      req.user = decoded; // { user, id, iat, exp }
      next();
    });

  } catch (e) {
    console.error('Auth middleware error:', e);
    res.status(400).json({ status: false, errorMessage: 'Algo deu errado no middleware!' });
  }
});

app.get('/', (req, res) => {
  res.status(200).json({ status: true, title: 'APIs rodando' });
});

// Helper to generate JWT
function generateToken(userDoc) {
  return new Promise((resolve, reject) => {
    jwt.sign({ user: userDoc.username, id: userDoc._id }, process.env.SECRET, { expiresIn: '1d' }, (err, token) => {
      if (err) return reject(err);
      resolve(token);
    });
  });
}

// REGISTER
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

// LOGIN
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ status: false, errorMessage: 'Adicione username e password' });

    const found = await User.findOne({ username });
    if (!found) return res.status(400).json({ status: false, errorMessage: 'Nome de usuário ou senha está incorreta!' });

    const match = await bcrypt.compare(password, found.password);
    if (!match) return res.status(400).json({ status: false, errorMessage: 'Nome de usuário ou senha está incorreta!' });

    const token = await generateToken(found);
    res.json({ status: true, message: 'Usuario logado com sucesso.', token });

  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ status: false, errorMessage: 'Erro no login.' });
  }
});

// Add casal
app.post('/add-casal', upload.single('image'), async (req, res) => {
  try {
    const { name, desc, niverM, niverH, tel } = req.body;
    if (!req.file || !name || !desc || !niverM || !niverH || !tel) {
      // If multer rejected the file, req.file will be undefined
      return res.status(400).json({ status: false, errorMessage: 'Adicione os parâmetros adequados e a imagem.' });
    }

    const new_casal = new casal({
      name,
      desc,
      niverH,
      niverM,
      tel,
      image: req.file.filename,
      user_id: req.user.id
    });

    await new_casal.save();
    res.status(201).json({ status: true, title: 'Casal adicionado com sucesso.' });

  } catch (e) {
    console.error('Add casal error:', e);
    res.status(500).json({ status: false, errorMessage: 'Erro ao adicionar casal.' });
  }
});

// Update casal
app.post('/update-casal', upload.single('image'), async (req, res) => {
  try {
    const { id, name, desc, niverH, niverM, tel } = req.body;
    if (!id) return res.status(400).json({ status: false, errorMessage: 'Id é obrigatório' });

    const existing = await casal.findById(id);
    if (!existing) return res.status(404).json({ status: false, errorMessage: 'Casal não encontrado' });

    // Remove old file if new uploaded
    if (req.file && existing.image) {
      const oldPath = path.join(UPLOAD_DIR, existing.image);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (err) { console.warn('Erro ao remover imagem antiga:', err); }
      }
      existing.image = req.file.filename;
    }

    if (name) existing.name = name;
    if (desc) existing.desc = desc;
    if (niverH) existing.niverH = niverH;
    if (niverM) existing.niverM = niverM;
    if (tel) existing.tel = tel;

    await existing.save();
    res.json({ status: true, title: 'Casal atualizado com sucesso.' });

  } catch (e) {
    console.error('Update casal error:', e);
    res.status(500).json({ status: false, errorMessage: 'Erro ao atualizar casal.' });
  }
});

// Delete casal (soft delete)
app.post('/delete-casal', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ status: false, errorMessage: 'Id é obrigatório' });

    const updated = await casal.findByIdAndUpdate(id, { is_delete: true }, { new: true });
    if (updated && updated.is_delete) {
      return res.json({ status: true, title: 'Casal deletado.' });
    }
    res.status(400).json({ status: false, errorMessage: 'Erro ao deletar casal.' });

  } catch (e) {
    console.error('Delete casal error:', e);
    res.status(500).json({ status: false, errorMessage: 'Erro ao deletar casal.' });
  }
});

// Get casal with pagination and search
app.get('/get-casal', async (req, res) => {
  try {
    const query = { is_delete: false, user_id: req.user.id };
    if (req.query.search) query.name = { $regex: req.query.search, $options: 'i' };

    const perPage = parseInt(req.query.perPage, 10) || 5;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const [data, count] = await Promise.all([
      casal.find(query, { date: 1, name: 1, desc: 1, niverH: 1, niverM: 1, tel: 1, image: 1 })
        .skip((perPage * page) - perPage)
        .limit(perPage),
      casal.countDocuments(query)
    ]);

    if (!data || data.length === 0) return res.status(404).json({ status: false, errorMessage: 'Não há Casais cadastrados!' });

    res.json({ status: true, title: 'Casais recuperados.', casais: data, current_page: page, total: count, pages: Math.ceil(count / perPage) });

  } catch (e) {
    console.error('Get casal error:', e);
    res.status(500).json({ status: false, errorMessage: 'Erro ao recuperar casais.' });
  }
});

// DB connect (uses your existing Conn wrapper)
const db_url = process.env.DB_URL;
const db_user = process.env.DB_USER;
const db_pass = process.env.DB_PASS;
const db_data = process.env.DB_DATA;

Conn(db_url, db_user, db_pass, db_data)
  .then(() => console.log('DB conectado'))
  .catch(err => console.error('Erro ao conectar DB:', err));

// Start server
const port = process.env.PORT || 2000;
app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
