const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta configurar DATABASE_URL en el archivo .env');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      const migrationsDirectory = path.join(__dirname, '..', '..', 'migrations');
      const migrations = fs.readdirSync(migrationsDirectory)
        .filter((filename) => /^\d+.*\.sql$/.test(filename))
        .sort();

      for (const filename of migrations) {
        const applied = await client.query(
          'SELECT version FROM schema_migrations WHERE version = $1',
          [filename]
        );
        if (applied.rowCount > 0) {
          continue;
        }

        const migration = fs.readFileSync(path.join(migrationsDirectory, filename), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(migration);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [filename]);
          await client.query('COMMIT');
          console.log(`Migración aplicada: ${filename}`);
        } catch (error) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            console.error('No se pudo revertir la migración:', rollbackError);
          }
          throw error;
        }
      }

      console.log('Migraciones al día.');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error('No se pudieron aplicar las migraciones:', error);
  process.exitCode = 1;
});
