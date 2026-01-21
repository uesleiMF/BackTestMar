const jwt = require("jsonwebtoken");
const User = require("../model/User");

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ errorMessage: "Token ausente" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔥 aqui está o ponto-chave
    req.userId = decoded.id;

    const user = await User.findById(decoded.id).select("role");
    req.user = user;

    next();
  } catch {
    res.status(401).json({ errorMessage: "Token inválido" });
  }
};
