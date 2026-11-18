const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createGetPreferencesHandler,
  createUpdatePreferencesHandler
} = require('../src/routes/preferences');

async function invoke(handler, request) {
  const response = {
    statusCode: 200,
    body: null,
    json(body) {
      this.body = body;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    }
  };
  let nextError;

  await handler(request, response, (error) => {
    nextError = error;
  });
  return { response, nextError };
}

test('preferences endpoint returns the authenticated user selections', async () => {
  let queryArguments;
  const database = {
    query: async (sql, values) => {
      queryArguments = { sql, values };
      return { rows: [{ category_id: 2 }, { category_id: 5 }] };
    }
  };

  const { response, nextError } = await invoke(
    createGetPreferencesHandler(database),
    { user: { id: 42 } }
  );

  assert.equal(nextError, undefined);
  assert.deepEqual(queryArguments.values, [42]);
  assert.deepEqual(response.body, {
    status: 'success',
    data: { category_ids: [2, 5] }
  });
});

test('updating preferences replaces selections in a transaction', async () => {
  const statements = [];
  const client = {
    query: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.startsWith('SELECT id FROM categories')) {
        return { rowCount: 2, rows: [{ id: 2 }, { id: 5 }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {}
  };
  const database = { connect: async () => client };

  const { response, nextError } = await invoke(
    createUpdatePreferencesHandler(database),
    { user: { id: 42 }, body: { category_ids: [2, 5] } }
  );

  assert.equal(nextError, undefined);
  assert.deepEqual(statements.map((statement) => statement.sql), [
    'BEGIN',
    'SELECT id FROM categories WHERE id = ANY($1::integer[])',
    'DELETE FROM user_category_preferences WHERE user_id = $1',
    `INSERT INTO user_category_preferences (user_id, category_id)
           SELECT $1, category_id
           FROM UNNEST($2::integer[]) AS requested(category_id)`,
    'COMMIT'
  ]);
  assert.deepEqual(response.body, {
    status: 'success',
    data: { category_ids: [2, 5] }
  });
});

test('clearing preferences removes the filter and restores all categories', async () => {
  const statements = [];
  const client = {
    query: async (sql) => {
      statements.push(sql);
      if (sql.startsWith('SELECT id FROM categories')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {}
  };
  const database = { connect: async () => client };

  const { response, nextError } = await invoke(
    createUpdatePreferencesHandler(database),
    { user: { id: 42 }, body: { category_ids: [] } }
  );

  assert.equal(nextError, undefined);
  assert.deepEqual(statements, [
    'BEGIN',
    'SELECT id FROM categories WHERE id = ANY($1::integer[])',
    'DELETE FROM user_category_preferences WHERE user_id = $1',
    'COMMIT'
  ]);
  assert.deepEqual(response.body, {
    status: 'success',
    data: { category_ids: [] }
  });
});

test('updating preferences rejects invalid categories without deleting saved choices', async () => {
  const statements = [];
  const client = {
    query: async (sql) => {
      statements.push(sql);
      if (sql.startsWith('SELECT id FROM categories')) {
        return { rowCount: 1, rows: [{ id: 2 }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {}
  };
  const database = { connect: async () => client };

  const { response, nextError } = await invoke(
    createUpdatePreferencesHandler(database),
    { user: { id: 42 }, body: { category_ids: [2, 99] } }
  );

  assert.equal(nextError, undefined);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(statements, [
    'BEGIN',
    'SELECT id FROM categories WHERE id = ANY($1::integer[])',
    'ROLLBACK'
  ]);
});

test('preference updates reject duplicate or unknown input fields', async () => {
  let connectCount = 0;
  const database = {
    connect: async () => {
      connectCount += 1;
      throw new Error('Should not connect for invalid input');
    }
  };
  const handler = createUpdatePreferencesHandler(database);

  const duplicate = await invoke(handler, {
    user: { id: 42 },
    body: { category_ids: [1, 1] }
  });
  const unknownField = await invoke(handler, {
    user: { id: 42 },
    body: { category_ids: [], admin: true }
  });

  assert.equal(duplicate.nextError.statusCode, 400);
  assert.equal(unknownField.nextError.statusCode, 400);
  assert.equal(connectCount, 0);
});
