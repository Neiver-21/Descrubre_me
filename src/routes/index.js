const express = require('express');
const db = require('../config/db');
const requireUser = require('../middleware/requireUser')(db);
const authRoutes = require('./auth');
const createCrudRouter = require('./crud');
const createNearbyHandler = require('./nearby');
const createPreferencesRouter = require('./preferences');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/auth/preferences', requireUser, createPreferencesRouter(db));

router.post('/places/nearby', requireUser, createNearbyHandler(db));

router.use('/cities', createCrudRouter({
  table: 'cities',
  fields: {
    name: { type: 'string', maxLength: 150 },
    region: { type: 'string', maxLength: 150, nullable: true },
    country: { type: 'string', maxLength: 120 },
    description: { type: 'string', nullable: true }
  },
  requiredFields: ['name', 'country']
}));

router.use('/categories', createCrudRouter({
  table: 'categories',
  fields: {
    name: { type: 'string', maxLength: 100 },
    slug: { type: 'string', maxLength: 120 },
    description: { type: 'string', nullable: true }
  },
  requiredFields: ['name', 'slug']
}));

router.use('/places', createCrudRouter({
  table: 'places',
  fields: {
    city_id: { type: 'integer' },
    category_id: { type: 'integer', nullable: true },
    name: { type: 'string', maxLength: 180 },
    description: { type: 'string', nullable: true },
    address: { type: 'string', nullable: true },
    latitude: { type: 'number', min: -90, max: 90, nullable: true },
    longitude: { type: 'number', min: -180, max: 180, nullable: true },
    image_url: { type: 'string', nullable: true },
    website_url: { type: 'string', nullable: true },
    source_url: { type: 'string', nullable: true }
  },
  requiredFields: ['city_id', 'name'],
  filters: { city_id: 'integer', category_id: 'integer' }
}));

router.use('/events', createCrudRouter({
  table: 'events',
  fields: {
    city_id: { type: 'integer' },
    title: { type: 'string', maxLength: 180 },
    description: { type: 'string', nullable: true },
    location: { type: 'string', nullable: true },
    starts_at: { type: 'timestamp' },
    ends_at: { type: 'timestamp', nullable: true },
    image_url: { type: 'string', nullable: true },
    ticket_url: { type: 'string', nullable: true }
  },
  requiredFields: ['city_id', 'title', 'starts_at'],
  filters: { city_id: 'integer' }
}));

module.exports = router;
