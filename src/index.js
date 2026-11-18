const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./config/db');
const apiRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/v1/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({
      status: 'success',
      message: 'API de DescubreMiCiudad funcionando correctamente',
      database_time: result.rows[0].now
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: 'Error de conexión con la base de datos' });
  }
});

app.use('/api/v1', apiRoutes);

app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Ruta no encontrada' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      status: 'error',
      message: error.message
    });
  }

  if (error.status === 400 || error.status === 413) {
    return res.status(error.status).json({
      status: 'error',
      message: error.status === 413 ? 'La solicitud es demasiado grande' : 'JSON inválido'
    });
  }

  if (error.code === '23505') {
    return res.status(409).json({
      status: 'error',
      message: 'Ya existe un registro con esos datos'
    });
  }

  if (error.code === '23503') {
    return res.status(409).json({
      status: 'error',
      message: 'El registro está relacionado con otros datos'
    });
  }

  if (error.code === '23514') {
    return res.status(400).json({
      status: 'error',
      message: 'Los datos no cumplen las reglas de la base de datos'
    });
  }

  console.error(error);
  return res.status(500).json({
    status: 'error',
    message: 'Error interno del servidor'
  });
});

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error('Falta configurar DATABASE_URL en el archivo .env');
    process.exitCode = 1;
    return;
  }

  try {
    await db.query('SELECT 1');
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
  } catch (error) {
    console.error('No se pudo conectar con PostgreSQL:', error);
    process.exitCode = 1;
  }
}

start();
