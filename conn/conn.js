const mongoose = require("mongoose");

module.exports = async function Conn(DB_URL) {
  try {
    await mongoose.connect(DB_URL);
    console.log("DB conectado");
  } catch (err) {
    console.error("Erro ao conectar DB:", err);
  }
};
