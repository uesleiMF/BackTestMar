const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  role: {
    type: String,
    enum: ['user', 'leader'],
    default: 'user'
  },

  date: { type: Date, default: Date.now },

  // Histórico de nomes de casais
  nameHistory: { type: [String], default: [] }
});

module.exports = mongoose.model('User', UserSchema);
