const test = require('node:test');
const assert = require('node:assert/strict');
const requireAdminKey = require('../src/middleware/requireAdminKey');

function invokeMiddleware(headers) {
  const response = {
    statusCode: 200,
    body: null,
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

  requireAdminKey(
    { get: (name) => headers[name] },
    response,
    () => {
      nextCalled = true;
    }
  );

  return { response, nextCalled };
}

test('blocks write requests if the admin key is not configured', () => {
  const previousKey = process.env.ADMIN_API_KEY;
  delete process.env.ADMIN_API_KEY;

  try {
    const { response, nextCalled } = invokeMiddleware({});
    assert.equal(response.statusCode, 503);
    assert.equal(nextCalled, false);
  } finally {
    if (previousKey === undefined) {
      delete process.env.ADMIN_API_KEY;
    } else {
      process.env.ADMIN_API_KEY = previousKey;
    }
  }
});

test('rejects missing and incorrect admin keys', () => {
  const previousKey = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = 'expected-secret';

  try {
    const missing = invokeMiddleware({});
    const incorrect = invokeMiddleware({ 'x-admin-key': 'wrong-secret' });
    assert.equal(missing.response.statusCode, 401);
    assert.equal(incorrect.response.statusCode, 401);
    assert.equal(missing.nextCalled, false);
    assert.equal(incorrect.nextCalled, false);
  } finally {
    if (previousKey === undefined) {
      delete process.env.ADMIN_API_KEY;
    } else {
      process.env.ADMIN_API_KEY = previousKey;
    }
  }
});

test('allows requests with the configured admin key', () => {
  const previousKey = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = 'expected-secret';

  try {
    const { response, nextCalled } = invokeMiddleware({
      'x-admin-key': 'expected-secret'
    });
    assert.equal(response.statusCode, 200);
    assert.equal(nextCalled, true);
  } finally {
    if (previousKey === undefined) {
      delete process.env.ADMIN_API_KEY;
    } else {
      process.env.ADMIN_API_KEY = previousKey;
    }
  }
});
