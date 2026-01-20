const mongoose = require('mongoose');

const EventoSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  descricao: { type: String },

  // 👇 CORRETO PARA CALENDÁRIO
  data: { type: String, required: true },

  criadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Evento', EventoSchema);
