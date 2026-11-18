const crypto = require('crypto');

function requireAdminKey(req, res, next) {
  const expectedKey = process.env.ADMIN_API_KEY;
  if (!expectedKey) {
    return res.status(503).json({
      status: 'error',
      message: 'La clave de administrador no está configurada'
    });
  }

  const providedKey = req.get('x-admin-key');
  if (typeof providedKey !== 'string') {
    return res.status(401).json({
      status: 'error',
      message: 'Se requiere una clave de administrador válida'
    });
  }

  const expected = Buffer.from(expectedKey);
  const provided = Buffer.from(providedKey);
  if (expected.length !== provided.length ||
      !crypto.timingSafeEqual(expected, provided)) {
    return res.status(401).json({
      status: 'error',
      message: 'Se requiere una clave de administrador válida'
    });
  }

  return next();
}

module.exports = requireAdminKey;
