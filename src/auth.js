const {
  createHash,
  randomBytes,
  scrypt: scryptCallback,
  timingSafeEqual
} = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(scryptCallback);
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PASSWORD_KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, PASSWORD_KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, encodedHash) {
  const parts = encodedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' ||
      !/^[0-9a-f]{32}$/.test(parts[1]) ||
      !/^[0-9a-f]{128}$/.test(parts[2])) {
    return false;
  }

  const salt = Buffer.from(parts[1], 'hex');
  const expectedKey = Buffer.from(parts[2], 'hex');
  const actualKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH, SCRYPT_OPTIONS);
  return timingSafeEqual(actualKey, expectedKey);
}

function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

module.exports = {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword
};
