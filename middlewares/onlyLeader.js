function onlyLeader(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      status: false,
      errorMessage: "Usuário não autenticado"
    });
  }

  if (req.user.role !== "leader") {
    return res.status(403).json({
      status: false,
      errorMessage: "Apenas líderes podem realizar esta ação"
    });
  }

  next();
}

module.exports = onlyLeader;
