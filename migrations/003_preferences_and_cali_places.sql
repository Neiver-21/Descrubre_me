-- Names and coordinates are from Wikidata (CC0); each source item is linked per place.
CREATE TABLE user_category_preferences (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, category_id)
);

CREATE INDEX user_category_preferences_category_id_idx
  ON user_category_preferences(category_id);

ALTER TABLE places ADD COLUMN IF NOT EXISTS source_url TEXT;

INSERT INTO cities (name, region, country, description)
SELECT 'Cali', 'Valle del Cauca', 'Colombia',
       'Capital del Valle del Cauca, conocida por su patrimonio cultural y natural.'
WHERE NOT EXISTS (
  SELECT 1 FROM cities
  WHERE LOWER(name) IN ('cali', 'santiago de cali') AND country = 'Colombia'
);

INSERT INTO categories (name, slug, description) VALUES
  ('Museos y exposiciones', 'museos', 'Museos y espacios de exposicion de Cali.'),
  ('Parques y naturaleza', 'naturaleza', 'Parques, cerros y espacios naturales.'),
  ('Historia y arquitectura', 'historia', 'Lugares historicos y arquitectura destacada.'),
  ('Arte y monumentos', 'monumentos', 'Monumentos, esculturas y obras publicas.'),
  ('Cultura y espectaculos', 'cultura', 'Teatros, bibliotecas y centros culturales.')
ON CONFLICT (name) DO UPDATE
SET slug = EXCLUDED.slug, description = EXCLUDED.description;

WITH city AS (
  SELECT id FROM cities
  WHERE LOWER(name) IN ('cali', 'santiago de cali') AND country = 'Colombia'
  ORDER BY id
  LIMIT 1
),
seed_places (name, category_slug, latitude, longitude, wikidata_id) AS (
  VALUES
    ('Museo de Ciencias Naturales Federico Carlos Lehman', 'museos', 3.436188888, -76.538963888, 'Q20640790'),
    ('Monumento a la Resistencia', 'monumentos', 3.409492, -76.518644, 'Q107237930'),
    ('Biblioteca La María', 'cultura', 3.448, -76.53968, 'Q58209482'),
    ('Museo del Oro Calima', 'museos', 3.450047222, -76.535725, 'Q20017473'),
    ('Parque Artesanal Loma de la Cruz', 'naturaleza', 3.44301, -76.5374, 'Q6062006'),
    ('Museo Arqueológico Julio César Cubillos', 'museos', 3.376855555, -76.534533333, 'Q20490157'),
    ('Museo Arqueológico La Merced', 'museos', 3.450586111, -76.536702777, 'Q20107426'),
    ('Bulevar de la Avenida Colombia', 'historia', 3.4531, -76.533975, 'Q20742879'),
    ('Las Naves del Almirante', 'monumentos', 3.466718, -76.616678, 'Q40795081'),
    ('Jardín Botánico de Cali', 'naturaleza', 3.450309, -76.571906, 'Q137186729'),
    ('Puente Ortiz', 'historia', 3.45354, -76.5335, 'Q6091244'),
    ('Teatro Municipal Enrique Buenaventura', 'cultura', 3.449275, -76.53586111, 'Q16638128'),
    ('Monumento a Ignacio de Herrera y Vergara', 'monumentos', 3.454327777, -76.525769444, 'Q40802760'),
    ('Monumento a Joaquín de Cayzedo y Cuero', 'monumentos', 3.451772, -76.532539, 'Q21177106'),
    ('Parque de las Banderas', 'naturaleza', 3.431931252, -76.542445062, 'Q28501155'),
    ('Monumento a Cristo Rey', 'monumentos', 3.440833333, -76.554166666, 'Q805445'),
    ('Teatro Jorge Isaacs', 'cultura', 3.45334, -76.5323, 'Q13636673'),
    ('Teatro Experimental de Cali', 'cultura', 3.447537, -76.535136, 'Q3516754'),
    ('Barrio San Antonio', 'historia', 3.44703, -76.5403, 'Q3471345'),
    ('Cerro de las Tres Cruces', 'naturaleza', 3.48453, -76.5621, 'Q2890224'),
    ('Museo La Tertulia', 'museos', 3.45008, -76.545331, 'Q18624380'),
    ('Monumento a Sebastián de Belalcázar', 'monumentos', 3.449194036, -76.545197189, 'Q21167187'),
    ('Hacienda Cañasgordas', 'historia', 3.354673, -76.525762, 'Q5891050'),
    ('Museo Jairo Varela', 'museos', 3.455068, -76.535296, 'Q141805970'),
    ('El Gato del Río', 'monumentos', 3.45129167, -76.54475833, 'Q5822005'),
    ('Árbol de la vida', 'monumentos', 3.390141, -76.54524, 'Q40791737'),
    ('Monumento a Fray Damián González', 'monumentos', 3.449675, -76.533519444, 'Q48785018'),
    ('Monumento a Simón Bolívar', 'monumentos', 3.455348196, -76.53360657, 'Q47037488'),
    ('Teatro Calima', 'cultura', 3.45623, -76.533618, 'Q37055026'),
    ('Monumento a las Ciudades Confederadas', 'monumentos', 3.45534167, -76.53160556, 'Q20862146'),
    ('Plaza de Cayzedo', 'historia', 3.451838888, -76.532475, 'Q16620185'),
    ('Iglesia La Ermita', 'historia', 3.453998, -76.531985, 'Q11682932'),
    ('Guerrero en reposo', 'monumentos', 3.440211111, -76.539719444, 'Q40990941'),
    ('Catedral Metropolitana de Cali', 'historia', 3.4508, -76.5324, 'Q5758387'),
    ('Biblioteca del Centenario', 'cultura', 3.4505558, -76.5436456, 'Q40826092'),
    ('Monumento a la Maceta', 'monumentos', 3.44691111, -76.54045278, 'Q20963494'),
    ('Caliwood', 'museos', 3.450636111, -76.547427777, 'Q17623505'),
    ('Monumento a Jorge Isaacs', 'monumentos', 3.45381667, -76.53370278, 'Q27171576'),
    ('Zoológico de Cali', 'naturaleza', 3.44861111, -76.55861111, 'Q5019807'),
    ('Teatro Los Cristales', 'cultura', 3.444757, -76.546524, 'Q42426324'),
    ('Biblioteca Departamental Jorge Garcés Borrero', 'cultura', 3.43625278, -76.53937778, 'Q5727746'),
    ('Capilla de San Antonio', 'historia', 3.44759, -76.542, 'Q5748340'),
    ('Centro Cultural Colombo Americano de Cali', 'cultura', 3.457711, -76.535029, 'Q137186768')
)
INSERT INTO places (
  city_id, category_id, name, latitude, longitude, source_url
)
SELECT city.id, categories.id, seed_places.name, seed_places.latitude, seed_places.longitude,
       'https://www.wikidata.org/wiki/' || seed_places.wikidata_id
FROM seed_places
CROSS JOIN city
JOIN categories ON categories.slug = seed_places.category_slug
WHERE NOT EXISTS (
  SELECT 1 FROM places AS existing
  WHERE existing.city_id = city.id AND LOWER(existing.name) = LOWER(seed_places.name)
);
