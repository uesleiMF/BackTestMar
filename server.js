// server.js
require('dotenv').config();

const express = require('express');
const app = express();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // bcryptjs recomendado
const jwt = require('jsonwebtoken');
const cors = require('cors');

const cloudinary = require('./config/cloudinary');
const cloudinaryStorage = require('multer-storage-cloudinary'); // sintaxe antiga (v2.2.1)
const multer = require('multer');

const User = require('./model/user');
const Casal = require('./model/casal');

// ---------- Cloudinary storage (sintaxe antiga) ----------
const storage = cloudinaryStorage({
  cloudinary: cloudinary,
  folder: 'casais_app',
  allowedFormats: ['jpg', 'jpeg', 'png'],
  // opcional: você pode definir public_id gerado aqui também (string ou function)
  // publicId: (req, file) => `${Date.now()}_${file.originalname.split('.').slice(0,-1).join('.')}`
});

const upload = multer({ storage });

// ---------- Middlewares ----------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------- JWT auth middleware ----------
app.use((req, res, next) => {
  try {
    // rotas públicas
    if (req.path === '/' || req.path === '/login' || req.path === '/register') return next();

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

app.get('/', (req, res) => res.json({ status: true, title: 'APIs rodando' }));

// ---------- JWT generator ----------
function generateToken(userDoc) {
  return new Promise((resolve, reject) => {
    jwt.sign({ user: userDoc.username, id: userDoc._id }, process.env.SECRET, { expiresIn: '1d' }, (err, token) => {
      if (err) return reject(err);
      resolve(token);
    });
  });
}

// ---------- Register ----------
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

// ---------- Login ----------
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

// ---------- Add casal (upload para Cloudinary) ----------
app.post('/add-casal', upload.single('image'), async (req, res) => {
  try {
    const { name, desc, niverM, niverH, tel } = req.body;

    if (!req.file) return res.status(400).json({ status: false, errorMessage: 'Imagem é obrigatória.' });

    // A versão antiga retorna propriedades diferentes dependendo da config.
    // Vamos pegar url/path e public_id de forma robusta.
    const imageUrl = req.file.url || req.file.path || req.file.secure_url || req.file.location;
    const publicId = req.file.public_id || req.file.filename || '';

    const new_casal = new Casal({
      name,
      desc,
      niverH,
      niverM,
      tel,
      image: imageUrl || '',
      public_id: publicId || '',
      user_id: req.user.id
    });

    await new_casal.save();
    res.status(201).json({ status: true, title: 'Casal adicionado com sucesso.', casal: new_casal });

  } catch (e) {
    console.error('Add casal error:', e);
    res.status(500).json({ status: false, errorMessage: 'Erro ao adicionar casal.' });
  }
});

// ---------- Update casal ----------
app.post('/update-casal', upload.single('image'), async (req, res) => {
  try {
    const { id, name, desc, niverH, niverM, tel } = req.body;
    if (!id) return res.status(400).json({ status: false, errorMessage: 'Id é obrigatório' });

    const existing = await Casal.findById(id);
    if (!existing) return res.status(404).json({ status: false, errorMessage: 'Casal não encontrado' });

    // Se nova imagem enviada -> destruir antiga no Cloudinary
    if (req.file) {
      const publicIdNew = req.file.public_id || req.file.filename || '';
      const urlNew = req.file.url || req.file.path || req.file.secure_url || req.file.location;

      if (existing.public_id) {
        try { await cloudinary.uploader.destroy(existing.public_id); } catch (err) { console.warn('Erro ao destruir imagem antiga:', err); }
      }
      existing.image = urlNew || existing.image;
      existing.public_id = publicIdNew || existing.public_id;
    }

    if (name) existing.name = name;
    if (desc) existing.desc = desc;
    if (niverH) existing.niverH = niverH;
    if (niverM) existing.niverM = niverM;
    if (tel) existing.tel = tel;

    await existing.save();
    res.json({ status: true, title: 'Casal atualizado com sucesso.', casal: existing });

  } catch (e) {
    console.error('Update casal error:', e);
    res.status(500).json({ status: false, errorMessage: 'Erro ao atualizar casal.' });
  }
});

// ---------- Delete casal (soft + remove imagem Cloudinary) ----------
app.post('/delete-casal', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ status: false, errorMessage: 'Id é obrigatório' });

    const existing = await Casal.findById(id);
    if (!existing) return res.status(404).json({ status: false, errorMessage: 'Casal não encontrado' });

    if (existing.public_id) {
      try { await cloudinary.uploader.destroy(existing.public_id); } catch (err) { console.warn('Erro ao destruir imagem:', err); }
    }

    existing.is_delete = true;
    await existing.save();

    res.json({ status: true, title: 'Casal deletado.' });
  } catch (e) {
    console.error('Delete casal error:', e);
    res.status(500).json({ status: false, errorMessage: 'Erro ao deletar casal.' });
  }
});

// ---------- Get casal (paginação e busca) ----------
app.get('/get-casal', async (req, res) => {
  try {
    const query = { is_delete: false, user_id: req.user.id };

    if (req.query.search) query.name = { $regex: req.query.search, $options: 'i' };

    const perPage = parseInt(req.query.perPage, 10) || 5;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const [data, count] = await Promise.all([
      Casal.find(query, { date: 1, name: 1, desc: 1, niverH: 1, niverM: 1, tel: 1, image: 1 })
        .skip((perPage * page) - perPage)
        .limit(perPage),
      Casal.countDocuments(query)
    ]);

    if (!data || data.length === 0) return res.status(404).json({ status: false, errorMessage: 'Não há Casais cadastrados!' });

    res.json({
      status: true,
      title: 'Casais recuperados.',
      casais: data,
      current_page: page,
      total: count,
      pages: Math.ceil(count / perPage)
    });
  } catch (e) {
    console.error('Get casal error:', e);
    res.status(500).json({ status: false, errorMessage: 'Erro ao recuperar casais.' });
  }
});

// ---------- DB connect ----------
(async function connectDB(){
  try {
    const url = process.env.DB_URL;
    if (!url) {
      console.error('DB_URL não encontrada no .env');
      process.exit(1);
    }
    await mongoose.connect(url, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('DB conectado');
  } catch (err) {
    console.error('Erro ao conectar DB:', err);
    process.exit(1);
  }
})();

// ---------- Start server ----------
const port = process.env.PORT || 2000;
app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
