const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword
} = require('../src/auth');
const createRequireUser = require('../src/middleware/requireUser');

test('password hashes do not contain the password and verify only the matching password', async () => {
  const password = 'UnaClaveSegura123';
  const encodedHash = await hashPassword(password);

  assert.equal(encodedHash.includes(password), false);
  assert.equal(await verifyPassword(password, encodedHash), true);
  assert.equal(await verifyPassword('otra-clave', encodedHash), false);
  assert.equal(await verifyPassword(password, 'invalid-hash'), false);
});

test('session tokens are random-format credentials and stored as one-way hashes', () => {
  const token = createSessionToken();

  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(hashSessionToken(token), token);
  assert.equal(hashSessionToken(token), hashSessionToken(token));
});

test('user middleware rejects missing and unknown bearer sessions', async () => {
  const middleware = createRequireUser({
    query: async () => ({ rowCount: 0, rows: [] })
  });
  const response = {
    statusCode: 200,
    body: null,
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  let nextCalled = false;

  middleware({ get: () => undefined }, response, () => {
    nextCalled = true;
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers['WWW-Authenticate'], 'Bearer');
  assert.equal(nextCalled, false);

  await middleware({ get: () => `Bearer ${createSessionToken()}` }, response, () => {
    nextCalled = true;
  });
  assert.equal(response.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('user middleware attaches the active user and token hash', async () => {
  const token = createSessionToken();
  const middleware = createRequireUser({
    query: async () => ({
      rowCount: 1,
      rows: [{ id: 1, name: 'Ana', email: 'ana@example.com' }]
    })
  });
  const request = { get: () => `Bearer ${token}` };
  const response = {};
  let nextCalled = false;

  await middleware(request, response, () => {
    nextCalled = true;
  });

  assert.deepEqual(request.user, { id: 1, name: 'Ana', email: 'ana@example.com' });
  assert.equal(request.authTokenHash, hashSessionToken(token));
  assert.equal(nextCalled, true);
});
