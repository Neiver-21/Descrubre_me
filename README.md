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

- `/api/v1/auth/register`: crea una cuenta con `name`, `email` y `password` (mínimo 8 caracteres).
- `/api/v1/auth/login`: inicia sesión con `email` y `password`.
- `/api/v1/auth/me`: devuelve la cuenta de la sesión actual.
- `/api/v1/auth/logout`: revoca la sesión actual.
- `/api/v1/auth/preferences`: `GET` devuelve las categorías preferidas y `PUT` reemplaza la selección con `{ "category_ids": [1, 2] }`. Una lista vacía muestra todas las categorías.
- `POST /api/v1/places/nearby`: busca lugares cercanos; requiere `Authorization: Bearer <token>` y acepta `latitude`, `longitude` y `radius_km` (1–50, predeterminado 10) en JSON. Las coordenadas no aparecen en la URL.
- `/api/v1/cities`: `name`, `country`; opcionales `region`, `description`.
- `/api/v1/categories`: `name`, `slug`; opcional `description`.
- `/api/v1/places`: `city_id`, `name`; opcionales `category_id`, `description`, `address`, `latitude`, `longitude`, `image_url`, `website_url`, `source_url`. Se puede filtrar con `city_id` y `category_id`.
- `/api/v1/events`: `city_id`, `title`, `starts_at`; opcionales `description`, `location`, `ends_at`, `image_url`, `ticket_url`. Se puede filtrar con `city_id`.
- `/api/v1/health`: comprueba que la API puede consultar PostgreSQL.

Las listas aceptan `limit` (1–100, predeterminado 50) y `offset` (predeterminado 0). Los cuerpos de escritura son JSON. Las relaciones impiden borrar una ciudad con lugares o eventos asociados; las categorías borradas dejan los lugares sin categoría.

Las lecturas generales son públicas. El registro y el inicio de sesión crean sesiones de 30 días; el servidor guarda contraseñas con scrypt y solo almacena hashes de los tokens de sesión. El APK conserva el token en el almacenamiento seguro del dispositivo. La búsqueda de lugares cercanos requiere una sesión, aplica las categorías guardadas en la cuenta y solo utiliza las coordenadas enviadas para esa consulta; no las almacena.

`POST`, `PATCH` y `DELETE` de ciudades, categorías, lugares y eventos requieren el encabezado `x-admin-key` con el valor configurado en `ADMIN_API_KEY`. Si la clave no está configurada, las escrituras quedan bloqueadas. No incluyas esa clave en código JavaScript ni en una aplicación pública de navegador; solo debe usarla un servicio administrativo de confianza.

Para que un lugar aparezca en la búsqueda de cercanía, debe tener `latitude` y `longitude` configuradas. Se devuelven hasta 100 lugares dentro del radio elegido, ordenados por distancia.

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

La app Expo está en `mobile/`, consume la API de Railway y ofrece registro, inicio de sesión y búsqueda de lugares usando la ubicación en primer plano del dispositivo. La persona puede elegir un radio de 1, 5, 10, 25 o 50 km; el radio inicial es 10 km. Si niega el permiso de ubicación, puede seguir usando las listas de ciudades, lugares y categorías.

La migración `003_preferences_and_cali_places.sql` agrega cinco categorías y 43 sitios de interés de Cali con coordenadas. Los nombres y coordenadas se consultaron en Wikidata, cuyos datos están publicados bajo [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing); cada lugar conserva un enlace a su registro fuente y la app lo muestra en la ficha. Las preferencias se guardan por cuenta y filtran la búsqueda de lugares cercanos.

Para probarla, desde esa carpeta ejecuta:

```bash
npm install
npx expo start
```

Para generar un APK de prueba se necesita una cuenta de Expo/EAS. Desde `mobile/`, ejecuta:

```bash
npx eas-cli login
npm run build:apk
```

El perfil `preview` genera un APK de instalación directa. EAS muestra el enlace de descarga cuando finaliza la compilación. La app consulta recursos públicos y guarda las preferencias privadas mediante la sesión de la persona usuaria; no contiene `ADMIN_API_KEY`.

Cada cambio en `mobile/` en la rama `main` también inicia una compilación de APK en GitHub Actions. Cuando finalice, abre el resultado de **Build Android APK** en la pestaña **Actions** del repositorio y descarga el artefacto `descubremiciudad-apk`.
