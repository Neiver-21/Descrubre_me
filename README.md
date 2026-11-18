# DescubreMiCiudad - Backend

API REST de DescubreMiCiudad con Node.js, Express y PostgreSQL. Incluye administración de ciudades, categorías, lugares y eventos.

## Requisitos

- Node.js 18 o posterior
- PostgreSQL 12 o posterior

## Configuración

1. Instala las dependencias:
   ```bash
   npm install
   ```

2. Crea una base de datos PostgreSQL vacía (por ejemplo, `descubremiciudad_db`) y copia `.env.example` a `.env`. Ajusta `DATABASE_URL` con la conexión local:
   ```bash
   DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/descubremiciudad_db
   ```

3. Aplica las migraciones para crear las tablas e índices:
   ```bash
   npm run db:migrate
   ```

4. Inicia el servidor:
   ```bash
   npm run dev
   ```

La API escucha en `http://localhost:4000` por defecto. El servidor no inicia si falta `DATABASE_URL` o PostgreSQL no está disponible.

## Despliegue público en Railway

1. Sube el proyecto a un repositorio GitHub y crea un proyecto Railway desplegando ese repositorio.
2. Agrega un servicio PostgreSQL al proyecto Railway. No habilites acceso público TCP a PostgreSQL.
3. En las variables del servicio API configura:
   - `NODE_ENV=production`
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` (reemplaza `Postgres` si el servicio de base tiene otro nombre).
   - `ADMIN_API_KEY` con un valor aleatorio fuerte. Puedes generarlo localmente con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` y guardarlo como variable secreta en Railway.
4. En la configuración del servicio API, establece `npm run db:migrate` como **Pre-deploy Command**. El comando de inicio es `npm start`; Railway proporciona `PORT`.
5. Configura `/api/v1/health` como health check y genera un dominio público para el servicio API.

La base PostgreSQL local no se copia automáticamente a Railway. Las migraciones crean las tablas, pero para transferir datos existentes hace falta exportarlos e importarlos aparte.

## Endpoints

Todos los recursos admiten `GET /`, `GET /:id`, `POST /`, `PATCH /:id` y `DELETE /:id`:

- `/api/v1/cities`: `name`, `country`; opcionales `region`, `description`.
- `/api/v1/categories`: `name`, `slug`; opcional `description`.
- `/api/v1/places`: `city_id`, `name`; opcionales `category_id`, `description`, `address`, `latitude`, `longitude`, `image_url`, `website_url`. Se puede filtrar con `city_id` y `category_id`.
- `/api/v1/events`: `city_id`, `title`, `starts_at`; opcionales `description`, `location`, `ends_at`, `image_url`, `ticket_url`. Se puede filtrar con `city_id`.
- `/api/v1/health`: comprueba que la API puede consultar PostgreSQL.

Las listas aceptan `limit` (1–100, predeterminado 50) y `offset` (predeterminado 0). Los cuerpos de escritura son JSON. Las relaciones impiden borrar una ciudad con lugares o eventos asociados; las categorías borradas dejan los lugares sin categoría.

Las lecturas son públicas. `POST`, `PATCH` y `DELETE` requieren el encabezado `x-admin-key` con el valor configurado en `ADMIN_API_KEY`. Si la clave no está configurada, las escrituras quedan bloqueadas. No incluyas esa clave en código JavaScript ni en una aplicación pública de navegador; solo debe usarla un servicio administrativo de confianza.

Ejemplo para crear una ciudad:

```json
{
  "name": "Medellín",
  "region": "Antioquia",
  "country": "Colombia",
  "description": "Ciudad de la eterna primavera"
}
```

## App Android

La app Expo de solo lectura está en `mobile/` y consume la API pública de Railway. Para probarla, desde esa carpeta ejecuta:

```bash
npm install
npx expo start
```

Para generar un APK de prueba se necesita una cuenta de Expo/EAS. Desde `mobile/`, ejecuta:

```bash
npx eas-cli login
npm run build:apk
```

El perfil `preview` genera un APK de instalación directa. EAS muestra el enlace de descarga cuando finaliza la compilación. La app solo hace lecturas públicas; no contiene `ADMIN_API_KEY`.
