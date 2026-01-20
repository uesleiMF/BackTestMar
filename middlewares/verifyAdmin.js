module.exports = function verifyAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      status: false,
      errorMessage: 'Acesso permitido apenas para administradores'
    });
  }
  next();
};
