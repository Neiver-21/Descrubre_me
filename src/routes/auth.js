const express = require('express');
const db = require('../config/db');
const requireUser = require('../middleware/requireUser')(db);
const {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword
} = require('../auth');

const router = express.Router();
const SESSION_DAYS = 30;
const DUMMY_PASSWORD_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function validateCredentials(body, registration) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('El cuerpo debe ser un objeto JSON');
  }

  const allowedFields = registration
    ? ['name', 'email', 'password']
    : ['email', 'password'];
  const unknownField = Object.keys(body).find((field) => !allowedFields.includes(field));
  if (unknownField) {
    throw badRequest(`Campo no permitido: ${unknownField}`);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('Escribe un correo electrónico válido');
  }

  if (typeof body.password !== 'string' ||
      body.password.length < 8 || body.password.length > 128) {
    throw badRequest('La contraseña debe tener entre 8 y 128 caracteres');
  }

  if (!registration) {
    return { email, password: body.password };
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 120) {
    throw badRequest('El nombre debe tener entre 1 y 120 caracteres');
  }
  return { name, email, password: body.password };
}

async function createSession(userId) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const result = await db.query(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 day'))
     RETURNING expires_at`,
    [tokenHash, userId, SESSION_DAYS]
  );
  return { token, expires_at: result.rows[0].expires_at };
}

router.post('/register', asyncRoute(async (req, res) => {
  const { name, email, password } = validateCredentials(req.body, true);
  const passwordHash = await hashPassword(password);
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);

  let result;
  try {
    result = await db.query(
      `WITH new_user AS (
         INSERT INTO users (display_name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, display_name AS name, email
       ),
       new_session AS (
         INSERT INTO auth_sessions (token_hash, user_id, expires_at)
         SELECT $4, id, NOW() + ($5 * INTERVAL '1 day') FROM new_user
         RETURNING user_id, expires_at
       )
       SELECT new_user.id, new_user.name, new_user.email, new_session.expires_at
       FROM new_user
       JOIN new_session ON new_session.user_id = new_user.id`,
      [name, email, passwordHash, tokenHash, SESSION_DAYS]
    );
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'users_email_unique') {
      return res.status(409).json({ status: 'error', message: 'Ese correo ya tiene una cuenta' });
    }
    throw error;
  }

  const { id, name: displayName, email: userEmail, expires_at } = result.rows[0];
  return res.status(201).json({
    status: 'success',
    data: {
      token,
      expires_at,
      user: { id, name: displayName, email: userEmail }
    }
  });
}));

router.post('/login', asyncRoute(async (req, res) => {
  const { email, password } = validateCredentials(req.body, false);
  const result = await db.query(
    'SELECT id, display_name AS name, email, password_hash FROM users WHERE email = $1',
    [email]
  );
  const user = result.rows[0];
  const passwordMatches = user
    ? await verifyPassword(password, user.password_hash)
    : await verifyPassword(password, DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) {
    return res.status(401).json({ status: 'error', message: 'Correo o contraseña incorrectos' });
  }

  const session = await createSession(user.id);
  return res.json({
    status: 'success',
    data: {
      ...session,
      user: { id: user.id, name: user.name, email: user.email }
    }
  });
}));

router.get('/me', requireUser, (req, res) => {
  res.json({ status: 'success', data: { user: req.user } });
});

router.post('/logout', requireUser, asyncRoute(async (req, res) => {
  await db.query('DELETE FROM auth_sessions WHERE token_hash = $1', [req.authTokenHash]);
  return res.json({ status: 'success', message: 'Sesión cerrada' });
}));

module.exports = router;
