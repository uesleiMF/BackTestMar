// model/casalSimple.js
const mongoose = require('mongoose');

const CasalSimpleSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  age: { type: Number, required: true },
  is_delete: { type: Boolean, default: false },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CasalSimple', CasalSimpleSchema);
