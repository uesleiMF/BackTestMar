require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const streamifier = require('streamifier');

const cloudinary = require('./config/cloudinary');

const Evento = require('./model/evento');
const User = require('./model/user');
const Casal = require('./model/casal');
const History = require('./model/history');
const CasalSimple = require('./model/casalSimple');

const app = express();

// ==============================
// MIDDLEWARES GLOBAIS - ORDEM IMPORTANTE!
// ==============================

// 1. CORS - deve vir PRIMEIRO!
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',              // caso use Vite no dev
  'https://rede-amai-ieq.vercel.app',   // seu frontend atual no Vercel
  // Adicione aqui outros domínios se testar em Netlify, Render, etc.
  // Exemplo: 'https://seu-app.netlify.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite requisições sem origin (Postman, curl, etc.) ou origens permitidas
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`[CORS BLOCKED] Origin não permitido: ${origin}`);
      callback(new Error('Origem não permitida pelo CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 200  // ← MUITO IMPORTANTE para evitar problemas com 204
}));

// Força handling de todas as OPTIONS (redundância útil no Render)
app.options('*', cors());

// 2. Body parser
app.use(express.json());

// Debug temporário - veja nos logs do Render qual origin está chegando
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url} - Origin: ${req.headers.origin || 'sem origin'}`);
  next();
});

// ----------------------------
// DATABASE CONNECTION (DB_URL)
// ----------------------------
mongoose.connect(process.env.DB_URL)
  .then(() => console.log('✅ MongoDB conectado com sucesso'))
  .catch(err => {
    console.error('❌ Erro MongoDB:', err.message);
    process.exit(1);
  });

// ----------------------------
// MULTER CONFIG
// ----------------------------
const upload = multer({
  storage: multer.memoryStorage()
});

// ----------------------------
// JWT MIDDLEWARE
// ----------------------------
function verifyToken(req, res, next) {
  let token = req.headers['authorization'];

  if (!token)
    return res.status(401).json({ status: false, errorMessage: 'Token não enviado!' });

  if (token.startsWith('Bearer ')) {
    token = token.slice(7).trim();
  }

  jwt.verify(token, process.env.SECRET, (err, decoded) => {
    if (err)
      return res.status(401).json({ status: false, errorMessage: 'Token inválido!' });

    req.user = decoded;
    next();
  });
}

// ----------------------------
// PERMISSÃO: SOMENTE LÍDER
// ----------------------------
function onlyLeader(req, res, next) {
  if (!req.user || req.user.role !== 'leader') {
    return res.status(403).json({
      status: false,
      errorMessage: 'Acesso permitido apenas para líderes'
    });
  }
  next();
}

// ----------------------------
// ROTAS BÁSICAS
// ----------------------------
app.get('/', (req, res) => {
  res.json({ status: true, message: 'API Online e funcionando!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ----------------------------
// REGISTER
// ----------------------------
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ status: false, errorMessage: 'Campos obrigatórios!' });

    const exists = await User.findOne({ username });
    if (exists)
      return res.status(400).json({ status: false, errorMessage: 'Usuário já existe!' });

    const hash = await bcrypt.hash(password, 10);

    await new User({
      username,
      password: hash
    }).save();

    res.json({ status: true, message: 'Registrado com sucesso!' });

  } catch {
    res.status(500).json({ status: false, errorMessage: 'Erro no registro' });
  }
});

// ----------------------------
// LOGIN
// ----------------------------
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user)
      return res.status(400).json({ status: false, errorMessage: 'Usuário não encontrado!' });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ status: false, errorMessage: 'Senha incorreta!' });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      status: true,
      token,
      id: user._id,
      role: user.role
    });

  } catch {
    res.status(500).json({ status: false, errorMessage: 'Erro no login' });
  }
});

// ----------------------------
// HISTÓRICO DE NOMES
// ----------------------------
app.post('/history/add', verifyToken, async (req, res) => {
  try {
    const { name } = req.body;

    const user = await User.findById(req.user.id);
    if (!user.nameHistory.includes(name)) {
      user.nameHistory.push(name);
      await user.save();
    }

    res.json({ status: true, history: user.nameHistory });
  } catch {
    res.status(500).json({ status: false, errorMessage: 'Erro no histórico' });
  }
});

app.get('/history', verifyToken, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ status: true, history: user.nameHistory });
});

app.delete('/history/clear', verifyToken, async (req, res) => {
  const user = await User.findById(req.user.id);
  user.nameHistory = [];
  await user.save();
  res.json({ status: true });
});


// ----------------------------
// ADD CASAL
// ----------------------------
app.post('/add-casal', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const { name, desc, niverH, niverM, tel } = req.body;

    if (!name)
      return res.status(400).json({ status: false, errorMessage: 'Preencha o nome!' });

    const user = await User.findById(req.user.id);
    if (!user.nameHistory.includes(name)) {
      user.nameHistory.push(name);
      await user.save();
    }

    let imageUrl = '';
    let publicId = '';

    if (req.file) {
      const uploadCloud = () =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream((err, result) => {
            if (result) resolve(result);
            else reject(err);
          });
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });

      const uploaded = await uploadCloud();
      imageUrl = uploaded.secure_url;
      publicId = uploaded.public_id;
    }

    const newCasal = new Casal({
      user_id: req.user.id,
      name,
      desc,
      niverH,
      niverM,
      tel,
      image: imageUrl,
      public_id: publicId,
      is_delete: false,
      date: new Date()
    });

    await newCasal.save();
    res.json({ status: true, message: "Casal criado!", casal: newCasal });

  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao criar casal' });
  }
});


// ----------------------------
// GET CASAL
// ----------------------------
app.get('/get-casal', verifyToken, async (req, res) => {
  try {
    const data = await Casal.find({
      user_id: req.user.id,
      is_delete: false
    }).sort({ date: -1 });

    res.json({ status: true, casal: data });

  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao buscar dados' });
  }
});


// ----------------------------
// UPDATE CASAL
// ----------------------------
app.put('/update-casal/:id', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const { name, desc, tel, niverH, niverM } = req.body;
    const updateData = { name, desc, tel, niverH, niverM };

    if (req.file) {
      const uploadCloud = () =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream((err, result) => {
            if (result) resolve(result);
            else reject(err);
          });
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });

      const uploaded = await uploadCloud();
      updateData.image = uploaded.secure_url;
      updateData.public_id = uploaded.public_id;
    }

    const updated = await Casal.findByIdAndUpdate(req.params.id, updateData, { new: true });

    res.json({ status: true, message: 'Atualizado!', casal: updated });

  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao atualizar' });
  }
});


// ----------------------------
// DELETE CASAL
// ----------------------------
app.delete('/delete-casal/:id', verifyToken, async (req, res) => {
  try {
    await Casal.findByIdAndUpdate(req.params.id, { is_delete: true });
    res.json({ status: true, message: 'Deletado!' });

  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao deletar' });
  }
});


// ----------------------------
// ROTAS DE ANIVERSARIANTES
// ----------------------------

// Todos com aniversário preenchido
app.get('/aniversariantes', verifyToken, async (req, res) => {
  try {
    const data = await Casal.find({
      user_id: req.user.id,
      is_delete: false,
      $or: [
        { niverH: { $exists: true, $ne: "" } },
        { niverM: { $exists: true, $ne: "" } }
      ]
    });

    res.json({ status: true, aniversariantes: data });

  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao buscar aniversariantes' });
  }
});


// Aniversariantes do mês
app.get('/aniversariantes-mes', verifyToken, async (req, res) => {
  try {
    const hoje = new Date();
    const mesAtual = (hoje.getMonth() + 1).toString().padStart(2, '0');

    const data = await Casal.find({
      user_id: req.user.id,
      is_delete: false,
      $or: [
        { niverH: { $regex: `-${mesAtual}-` } },
        { niverM: { $regex: `-${mesAtual}-` } }
      ]
    });

    res.json({ status: true, aniversariantes: data });

  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao buscar aniversariantes do mês' });
  }
});


// Aniversariantes do dia
app.get('/aniversariantes-dia', verifyToken, async (req, res) => {
  try {
    const hoje = new Date();
    const mes = (hoje.getMonth() + 1).toString().padStart(2, '0');
    const dia = hoje.getDate().toString().padStart(2, '0');
    const hojeFormato = `${dia}-${mes}`;

    const data = await Casal.find({
      user_id: req.user.id,
      is_delete: false,
      $or: [
        { niverH: { $regex: hojeFormato } },
        { niverM: { $regex: hojeFormato } }
      ]
    });

    res.json({ status: true, aniversariantes: data });

  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao buscar aniversariantes do dia' });
  }
});


// Apagar apenas data do esposo
app.put('/delete-niver-esposo/:id', verifyToken, async (req, res) => {
  try {
    const upd = await Casal.findByIdAndUpdate(
      req.params.id,
      { niverH: "" },
      { new: true }
    );

    res.json({ status: true, message: 'Aniversário do esposo removido!', casal: upd });

  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao apagar aniversário do esposo' });
  }
});


// Apagar apenas data da esposa
app.put('/delete-niver-esposa/:id', verifyToken, async (req, res) => {
  try {
    const upd = await Casal.findByIdAndUpdate(
      req.params.id,
      { niverM: "" },
      { new: true }
    );

    res.json({ status: true, message: 'Aniversário da esposa removido!', casal: upd });

  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao apagar aniversário da esposa' });
  }
});


// --// ----------------------------
// ADD CASAIS SIMPLES
// ----------------------------
app.post('/add-casal-simple', verifyToken, async (req, res) => {
  try {
    const { name, birthDate } = req.body;
    if (!name || !birthDate)
      return res.status(400).json({ status: false, errorMessage: 'Nome e data de nascimento são obrigatórios!' });

    const newCasal = new CasalSimple({
      user_id: req.user.id,
      name,
      birthDate
    });

    await newCasal.save();
    res.json({ status: true, message: 'Casal simples criado!', casal: newCasal });
  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao criar casal simples' });
  }
});

// ----------------------------
// LISTAR CASAIS SIMPLES
// ----------------------------
app.get('/get-casal-simple', verifyToken, async (req, res) => {
  try {
    const data = await CasalSimple.find({
      user_id: req.user.id,
      is_delete: false
    }).sort({ date: -1 });

    res.json({ status: true, casal: data });
  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao buscar casal simples' });
  }
});

// ----------------------------
// ATUALIZAR CASAIS SIMPLES
// ----------------------------
app.put('/update-casal-simple/:id', verifyToken, async (req, res) => {
  try {
    const { name, birthDate } = req.body;
    if (!name || !birthDate)
      return res.status(400).json({ status: false, errorMessage: 'Nome e data de nascimento são obrigatórios!' });

    const updated = await CasalSimple.findByIdAndUpdate(
      req.params.id,
      { name, birthDate },
      { new: true }
    );

    res.json({ status: true, message: 'Casal simples atualizado!', casal: updated });
  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao atualizar casal simples' });
  }
});

// ----------------------------
// DELETAR CASAIS SIMPLES
// ----------------------------
app.delete('/delete-casal-simple/:id', verifyToken, async (req, res) => {
  try {
    await CasalSimple.findByIdAndUpdate(req.params.id, { is_delete: true });
    res.json({ status: true, message: 'Casal simples deletado!' });
  } catch (error) {
    res.status(500).json({ status: false, errorMessage: 'Erro ao deletar casal simples' });
  }
});

/* ==============================
   EVENTOS / CALENDÁRIO
============================== */

// Criar evento
app.post('/eventos', verifyToken, async (req, res) => {
  try {
    const { titulo, descricao, data } = req.body;

    if (!titulo || !data)
      return res.status(400).json({
        status: false,
        errorMessage: 'Título e data são obrigatórios'
      });

    const evento = await new Evento({
      titulo,
      descricao,
      data,
      criadoPor: req.user.id
    }).save();

    res.json({ status: true, evento });

  } catch (error) {
    res.status(500).json({
      status: false,
      errorMessage: 'Erro ao criar evento'
    });
  }
});

// Listar eventos (para calendário)
app.get('/eventos', verifyToken, async (req, res) => {
  try {
    const eventos = await Evento.find().sort({ data: 1 });
    res.json({ status: true, eventos });
  } catch {
    res.status(500).json({
      status: false,
      errorMessage: 'Erro ao buscar eventos'
    });
  }
});

// Atualizar evento
app.put('/eventos/:id', verifyToken, async (req, res) => {
  try {
    const evento = await Evento.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({ status: true, evento });
  } catch {
    res.status(500).json({
      status: false,
      errorMessage: 'Erro ao atualizar evento'
    });
  }
});

// Deletar evento
app.delete('/eventos/:id', verifyToken, async (req, res) => {
  try {
    await Evento.findByIdAndDelete(req.params.id);
    res.json({ status: true, message: 'Evento removido' });
  } catch {
    res.status(500).json({
      status: false,
      errorMessage: 'Erro ao deletar evento'
    });
  }
});


// ----------------------------
// START SERVER
// ----------------------------
app.listen(process.env.PORT, () => {
  console.log("Server running on port " + process.env.PORT);
});
