const express = require('express');
const db = require('../config/db');
const requireAdminKey = require('../middleware/requireAdminKey');

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateValue(name, value, definition) {
  if (value === null) {
    if (definition.nullable) {
      return null;
    }
    throw badRequest(`${name} no puede ser nulo`);
  }

  if (definition.type === 'string') {
    if (typeof value !== 'string') {
      throw badRequest(`${name} debe ser texto`);
    }
    if (definition.maxLength && value.length > definition.maxLength) {
      throw badRequest(`${name} supera el máximo de ${definition.maxLength} caracteres`);
    }
    return value;
  }

  if (definition.type === 'integer') {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw badRequest(`${name} debe ser un entero positivo`);
    }
    return value;
  }

  if (definition.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw badRequest(`${name} debe ser un número válido`);
    }
    if ((definition.min !== undefined && value < definition.min) ||
        (definition.max !== undefined && value > definition.max)) {
      throw badRequest(`${name} está fuera del rango permitido`);
    }
    return value;
  }

  if (definition.type === 'timestamp') {
    if (typeof value !== 'string' || value.trim() === '' ||
        Number.isNaN(Date.parse(value))) {
      throw badRequest(`${name} debe ser una fecha válida`);
    }
    return value;
  }

  throw new Error(`Tipo de campo no soportado: ${definition.type}`);
}

function validateBody(body, fields, requiredFields, partial) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('El cuerpo debe ser un objeto JSON');
  }

  const inputFields = Object.keys(body);
  if (inputFields.length === 0) {
    throw badRequest('Debes enviar al menos un campo');
  }

  const unknownFields = inputFields.filter(
    (field) => !Object.prototype.hasOwnProperty.call(fields, field)
  );
  if (unknownFields.length > 0) {
    throw badRequest(`Campo no permitido: ${unknownFields[0]}`);
  }

  if (!partial) {
    const missingField = requiredFields.find((field) => body[field] === undefined);
    if (missingField) {
      throw badRequest(`Falta el campo obligatorio: ${missingField}`);
    }
  }

  return inputFields.reduce((validated, field) => {
    validated[field] = validateValue(field, body[field], fields[field]);
    if (fields[field].type === 'string' && requiredFields.includes(field) &&
        validated[field].trim() === '') {
      throw badRequest(`${field} no puede estar vacío`);
    }
    return validated;
  }, {});
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function parseId(value) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw badRequest('El id debe ser un entero positivo');
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw badRequest('El id está fuera del rango permitido');
  }
  return id;
}

function parseFilterValue(field, value, type) {
  if (type === 'integer') {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
      throw badRequest(`${field} debe ser un entero positivo`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw badRequest(`${field} está fuera del rango permitido`);
    }
    return parsed;
  }
  return validateValue(field, value, { type });
}

function parsePagination(value, defaultValue, field) {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw badRequest(`${field} debe ser un entero no negativo`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw badRequest(`${field} está fuera del rango permitido`);
  }
  return parsed;
}

function createCrudRouter({ table, fields, requiredFields, filters = {} }) {
  const router = express.Router();
  const allowedQueryParams = new Set(['limit', 'offset', ...Object.keys(filters)]);

  router.get('/', asyncRoute(async (req, res) => {
    const unknownParams = Object.keys(req.query).filter((key) => !allowedQueryParams.has(key));
    if (unknownParams.length > 0) {
      throw badRequest(`Parámetro de búsqueda no permitido: ${unknownParams[0]}`);
    }

    const conditions = [];
    const values = [];
    Object.keys(filters).forEach((field) => {
      if (req.query[field] !== undefined) {
        values.push(parseFilterValue(field, req.query[field], filters[field]));
        conditions.push(`${field} = $${values.length}`);
      }
    });

    const limit = parsePagination(req.query.limit, 50, 'limit');
    const offset = parsePagination(req.query.offset, 0, 'offset');
    if (limit < 1 || limit > 100) {
      throw badRequest('limit debe estar entre 1 y 100');
    }

    values.push(limit, offset);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT * FROM ${table} ${where} ORDER BY id ASC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    res.json({ status: 'success', data: result.rows, limit, offset });
  }));

  router.get('/:id', asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    const result = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ status: 'error', message: 'Registro no encontrado' });
    }
    return res.json({ status: 'success', data: result.rows[0] });
  }));

  router.post('/', requireAdminKey, asyncRoute(async (req, res) => {
    const record = validateBody(req.body, fields, requiredFields, false);
    const columns = Object.keys(record);
    const values = columns.map((column) => record[column]);
    const placeholders = values.map((value, index) => `$${index + 1}`);
    const result = await db.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      values
    );
    return res.status(201).json({ status: 'success', data: result.rows[0] });
  }));

  router.patch('/:id', requireAdminKey, asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    const record = validateBody(req.body, fields, requiredFields, true);
    const columns = Object.keys(record);
    const values = columns.map((column) => record[column]);
    const assignments = columns.map((column, index) => `${column} = $${index + 1}`);
    values.push(id);
    const result = await db.query(
      `UPDATE ${table} SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ status: 'error', message: 'Registro no encontrado' });
    }
    return res.json({ status: 'success', data: result.rows[0] });
  }));

  router.delete('/:id', requireAdminKey, asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    const result = await db.query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ status: 'error', message: 'Registro no encontrado' });
    }
    return res.status(204).end();
  }));

  return router;
}

module.exports = createCrudRouter;
