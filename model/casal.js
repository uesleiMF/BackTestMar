// model/casal.js
const mongoose = require('mongoose');

const CasalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  desc: { type: String, default: '' },
  niverH: { type: String, default: '' },
  niverM: { type: String, default: '' },
  tel: { type: String, default: '' },
  image: { type: String, default: '' },      // URL Cloudinary
  public_id: { type: String, default: '' },  // Cloudinary public_id
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  is_delete: { type: Boolean, default: false },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Casal', CasalSchema);
