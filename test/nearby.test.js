const test = require('node:test');
const assert = require('node:assert/strict');
const createNearbyHandler = require('../src/routes/nearby');

async function invokeNearby(query, database) {
  const response = {
    body: null,
    json(body) {
      this.body = body;
      return this;
    }
  };
  let nextError;

  await createNearbyHandler(database)(
    { body: query, user: { id: 42 } },
    response,
    (error) => {
      nextError = error;
    }
  );
  return { response, nextError };
}

test('nearby search validates coordinates and uses the default radius', async () => {
  let queryArguments;
  const database = {
    query: async (sql, values) => {
      queryArguments = { sql, values };
      return { rows: [{ id: 8, name: 'Parque Central', distance_km: 2.4 }] };
    }
  };

  const { response, nextError } = await invokeNearby({
    latitude: 4.711,
    longitude: -74.072,
  }, database);

  assert.equal(nextError, undefined);
  assert.deepEqual(queryArguments.values, [4.711, -74.072, 10, 42]);
  assert.match(queryArguments.sql, /latitude IS NOT NULL AND p\.longitude IS NOT NULL/);
  assert.match(queryArguments.sql, /user_category_preferences/);
  assert.deepEqual(response.body, {
    status: 'success',
    data: [{ id: 8, name: 'Parque Central', distance_km: 2.4 }],
    radius_km: 10
  });
});

test('nearby search rejects invalid coordinates, radius, and unknown parameters', async () => {
  let queryCount = 0;
  const database = {
    query: async () => {
      queryCount += 1;
      return { rows: [] };
    }
  };

  const invalidCases = [
    { latitude: '91', longitude: '0' },
    { latitude: '4', longitude: '-181' },
    { latitude: '4', longitude: '5', radius_km: '51' },
    { latitude: '4', longitude: '5', admin: 'true' },
  ];

  for (const query of invalidCases) {
    const { nextError } = await invokeNearby(query, database);
    assert.equal(nextError.statusCode, 400);
  }
  assert.equal(queryCount, 0);
});
