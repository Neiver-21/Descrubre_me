const db = require('../config/db');
const { hashSessionToken } = require('../auth');

function createRequireUser(database = db) {
  return (req, res, next) => {
    const authorization = req.get('authorization');
    const match = typeof authorization === 'string'
      ? /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization)
      : null;

    if (!match) {
      res.set('WWW-Authenticate', 'Bearer');
      return res.status(401).json({ status: 'error', message: 'Debes iniciar sesión' });
    }

    const tokenHash = hashSessionToken(match[1]);
    return database.query(
      `SELECT u.id, u.display_name AS name, u.email
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [tokenHash]
    ).then((result) => {
      if (result.rowCount === 0) {
        res.set('WWW-Authenticate', 'Bearer');
        return res.status(401).json({ status: 'error', message: 'La sesión venció; inicia sesión nuevamente' });
      }

      req.user = result.rows[0];
      req.authTokenHash = tokenHash;
      return next();
    }).catch(next);
  };
}

module.exports = createRequireUser;
