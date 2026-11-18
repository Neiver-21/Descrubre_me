const express = require('express');
const db = require('../config/db');

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateCategoryIds(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('El cuerpo debe ser un objeto JSON');
  }
  const unknownField = Object.keys(body).find((field) => field !== 'category_ids');
  if (unknownField) {
    throw badRequest(`Campo no permitido: ${unknownField}`);
  }
  if (!Array.isArray(body.category_ids) ||
      body.category_ids.length > 50 ||
      !body.category_ids.every((id) => Number.isSafeInteger(id) && id > 0) ||
      new Set(body.category_ids).size !== body.category_ids.length) {
    throw badRequest('category_ids debe ser una lista de hasta 50 identificadores únicos');
  }
  return body.category_ids;
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function createGetPreferencesHandler(database = db) {
  return async (req, res, next) => {
    try {
      const result = await database.query(
        `SELECT category_id
         FROM user_category_preferences
         WHERE user_id = $1
         ORDER BY category_id`,
        [req.user.id]
      );
      return res.json({
        status: 'success',
        data: { category_ids: result.rows.map((row) => row.category_id) }
      });
    } catch (error) {
      return next(error);
    }
  };
}

function createUpdatePreferencesHandler(database = db) {
  return async (req, res, next) => {
    let categoryIds;
    try {
      categoryIds = validateCategoryIds(req.body);
    } catch (error) {
      return next(error);
    }

    let client;
    let transactionOpen = false;
    try {
      client = await database.connect();
      await client.query('BEGIN');
      transactionOpen = true;

      const categories = await client.query(
        'SELECT id FROM categories WHERE id = ANY($1::integer[])',
        [categoryIds]
      );
      if (categories.rowCount !== categoryIds.length) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(400).json({
          status: 'error',
          message: 'Una o más categorías seleccionadas no existen'
        });
      }

      await client.query(
        'DELETE FROM user_category_preferences WHERE user_id = $1',
        [req.user.id]
      );
      if (categoryIds.length > 0) {
        await client.query(
          `INSERT INTO user_category_preferences (user_id, category_id)
           SELECT $1, category_id
           FROM UNNEST($2::integer[]) AS requested(category_id)`,
          [req.user.id, categoryIds]
        );
      }
      await client.query('COMMIT');
      transactionOpen = false;
      return res.json({
        status: 'success',
        data: { category_ids: categoryIds }
      });
    } catch (error) {
      if (client && transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          return next(rollbackError);
        }
      }
      return next(error);
    } finally {
      if (client) {
        client.release();
      }
    }
  };
}

function createPreferencesRouter(database = db) {
  const router = express.Router();
  router.get('/', asyncRoute(createGetPreferencesHandler(database)));
  router.put('/', asyncRoute(createUpdatePreferencesHandler(database)));
  return router;
}

module.exports = createPreferencesRouter;
module.exports.createGetPreferencesHandler = createGetPreferencesHandler;
module.exports.createUpdatePreferencesHandler = createUpdatePreferencesHandler;
module.exports.validateCategoryIds = validateCategoryIds;
