const db = require('../config/db');

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseNearbyNumber(value, name, min, max) {
  const validString = typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value);
  if (!validString && typeof value !== 'number') {
    throw badRequest(`${name} debe ser un número válido`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw badRequest(`${name} está fuera del rango permitido`);
  }
  return number;
}

function createNearbyHandler(database = db) {
  return async (req, res, next) => {
    try {
      const allowedParams = new Set(['latitude', 'longitude', 'radius_km']);
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        throw badRequest('El cuerpo debe ser un objeto JSON');
      }
      const unknownParam = Object.keys(req.body).find((key) => !allowedParams.has(key));
      if (unknownParam) {
        throw badRequest(`Parámetro de búsqueda no permitido: ${unknownParam}`);
      }

      const latitude = parseNearbyNumber(req.body.latitude, 'latitude', -90, 90);
      const longitude = parseNearbyNumber(req.body.longitude, 'longitude', -180, 180);
      const radiusKm = req.body.radius_km === undefined
        ? 10
        : parseNearbyNumber(req.body.radius_km, 'radius_km', 1, 50);

      const result = await database.query(
        `WITH distances AS (
           SELECT p.*, c.name AS city_name, cat.name AS category_name,
             6371.0088 * 2 * ASIN(SQRT(LEAST(1, GREATEST(0,
               POWER(SIN(RADIANS(p.latitude::double precision - $1) / 2), 2) +
               COS(RADIANS($1)) * COS(RADIANS(p.latitude::double precision)) *
               POWER(SIN(RADIANS(p.longitude::double precision - $2) / 2), 2)
             )))) AS raw_distance_km
           FROM places p
           JOIN cities c ON c.id = p.city_id
           LEFT JOIN categories cat ON cat.id = p.category_id
           WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
             AND (
               NOT EXISTS (
                 SELECT 1 FROM user_category_preferences
                 WHERE user_id = $4
               )
               OR p.category_id IN (
                 SELECT category_id FROM user_category_preferences
                 WHERE user_id = $4
               )
             )
         )
         SELECT *, ROUND(raw_distance_km::numeric, 1)::double precision AS distance_km
         FROM distances
         WHERE raw_distance_km <= $3
         ORDER BY raw_distance_km ASC, id ASC
         LIMIT 100`,
        [latitude, longitude, radiusKm, req.user.id]
      );

      return res.json({
        status: 'success',
        data: result.rows,
        radius_km: radiusKm
      });
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = createNearbyHandler;
module.exports.parseNearbyNumber = parseNearbyNumber;
