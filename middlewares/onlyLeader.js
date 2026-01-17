function onlyLeader(req, res, next) {
  if (req.user.role !== 'leader') {
    return res.status(403).json({
      status: false,
      errorMessage: 'Apenas líderes podem realizar esta ação'
    });
  }
  next();
}

module.exports = onlyLeader;
