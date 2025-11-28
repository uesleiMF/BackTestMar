require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('./config/cloudinary');
const streamifier = require('streamifier');

const User = require('./model/user');
const Casal = require('./model/casal');

const app = express();
app.use(cors());
app.use(express.json());

// ----------------------------
// DATABASE CONNECTION
// ----------------------------
mongoose.connect(process.env.DB_URL, {
  user: process.env.DB_USER,
  pass: process.env.DB_PASS,
  dbName: process.env.DB_DATA
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('DB Error:', err));

// ----------------------------
// MULTER CONFIG (Upload memória)
// ----------------------------
const upload = multer({
  storage: multer.memoryStorage()
});

// ----------------------------
// MIDDLEWARE LOGIN (JWT)
// ----------------------------
function verifyToken(req, res, next) {
  const token = req.headers['authorization'];

  if (!token)
    return res.status(401).json({ status: false, errorMessage: 'Token não enviado!' });

  jwt.verify(token, process.env.SECRET, (err, decoded) => {
    if (err)
      return res.status(401).json({ status: false, errorMessage: 'Token inválido!' });

    req.user = decoded;
    next();
  });
}

// ----------------------------
// ROTA DE REGISTRO
// ----------------------------
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ status: false, errorMessage: 'Campos obrigatórios!' });

    const userExists = await User.findOne({ username });

    if (userExists)
      return res.status(400).json({ status: false, errorMessage: 'Usuário já existe!' });

    const hash = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hash
    });

    await newUser.save();

    res.json({ status: true, message: 'Registrado com sucesso!' });

  } catch (error) {
    console.log(error);
    res.status(500).json({ status: false, errorMessage: 'Erro no registro' });
  }
});

// ----------------------------
// LOGIN
// ----------------------------
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const findUser = await User.findOne({ username });

    if (!findUser)
      return res.status(400).json({ status: false, errorMessage: 'Usuário não encontrado!' });

    const match = await bcrypt.compare(password, findUser.password);

    if (!match)
      return res.status(400).json({ status: false, errorMessage: 'Senha incorreta!' });

    const token = jwt.sign({ id: findUser._id }, process.env.SECRET, { expiresIn: "30d" });

    res.json({ status: true, token });

  } catch (error) {
    console.log(error);
    res.status(500).json({ status: false, errorMessage: 'Erro no login' });
  }
});

// ----------------------------
// ADD CASAL (UPLOAD CLOUDINARY)
// ----------------------------
app.post('/add-casal', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const { name, age } = req.body;

    if (!name || !age)
      return res.status(400).json({ status: false, errorMessage: 'Preencha todos os campos!' });

    let imageUrl = null;

    if (req.file) {
      const uploadCloud = () => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream((err, result) => {
            if (result) resolve(result);
            else reject(err);
          });
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });
      };

      const uploaded = await uploadCloud();
      imageUrl = uploaded.secure_url;
    }

    const newCasal = new Casal({
      user_id: req.user.id,
      name,
      age,
      image: imageUrl,
      is_delete: false,
      date: new Date()
    });

    await newCasal.save();

    res.json({
      status: true,
      message: "Casal criado com sucesso!",
      casal: newCasal
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ status: false, errorMessage: 'Erro ao criar casal' });
  }
});

// ----------------------------
// GET CASAL DO USUÁRIO LOGADO
// ----------------------------
app.get('/get-casal', verifyToken, async (req, res) => {
  try {
    const data = await Casal.find({ user_id: req.user.id, is_delete: false })
      .sort({ date: -1 });

    res.json({ status: true, casal: data });

  } catch (error) {
    console.log(error);
    res.status(500).json({ status: false, errorMessage: 'Erro ao buscar dados' });
  }
});

// ----------------------------
// UPDATE CASAL
// ----------------------------
app.put('/update-casal/:id', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const { name, age } = req.body;
    let updateData = { name, age };

    if (req.file) {
      const uploadCloud = () => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream((err, result) => {
            if (result) resolve(result);
            else reject(err);
          });
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });
      };

      const uploaded = await uploadCloud();
      updateData.image = uploaded.secure_url;
    }

    const updated = await Casal.findByIdAndUpdate(req.params.id, updateData, { new: true });

    res.json({ status: true, message: 'Atualizado!', casal: updated });

  } catch (error) {
    console.log(error);
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
    console.log(error);
    res.status(500).json({ status: false, errorMessage: 'Erro ao deletar' });
  }
});

// ----------------------------
// START SERVER
// ----------------------------
app.listen(process.env.PORT, () => {
  console.log("Server running on port " + process.env.PORT);
});
