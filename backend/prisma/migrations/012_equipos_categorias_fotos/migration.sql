-- backend/prisma/migrations/012_equipos_categorias_fotos/migration.sql
-- Equipos: categorías/subtipos dinámicos, identificador interno de inventario,
-- 3 fotos + archivo de factura de compra pegados al equipo.

-- ── 1. Tablas de clasificación ───────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_categorias (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT        NOT NULL UNIQUE,
  prefijo    TEXT        NOT NULL DEFAULT 'EQ',
  icono      TEXT        NOT NULL DEFAULT '📦',
  orden      INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment_subtipos (
  id           SERIAL PRIMARY KEY,
  categoria_id INT         NOT NULL REFERENCES equipment_categorias(id) ON DELETE CASCADE,
  nombre       TEXT        NOT NULL,
  orden        INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (categoria_id, nombre)
);

CREATE INDEX IF NOT EXISTS equipment_subtipos_categoria_idx
  ON equipment_subtipos(categoria_id);

-- ── 2. Columnas nuevas en equipment ─────────────────────────
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS categoria_id    INT  REFERENCES equipment_categorias(id),
  ADD COLUMN IF NOT EXISTS subtipo_id      INT  REFERENCES equipment_subtipos(id),
  ADD COLUMN IF NOT EXISTS identificador   TEXT,
  ADD COLUMN IF NOT EXISTS factura_archivo TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS foto1           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS foto2           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS foto3           TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS equipment_identificador_key
  ON equipment(identificador)
  WHERE identificador IS NOT NULL AND identificador <> '';

CREATE INDEX IF NOT EXISTS equipment_categoria_idx ON equipment(categoria_id);
CREATE INDEX IF NOT EXISTS equipment_subtipo_idx   ON equipment(subtipo_id);

-- El enum tipo se conserva para datos legados pero deja de ser obligatorio.
ALTER TABLE equipment ALTER COLUMN tipo DROP NOT NULL;

-- ── 3. Categorías y subtipos iniciales ──────────────────────
INSERT INTO equipment_categorias (nombre, prefijo, icono, orden) VALUES
  ('Tecnología', 'TEC', '💻', 1),
  ('Vehículos',  'VEH', '🚙', 2),
  ('Mobiliario', 'MOB', '🪑', 3),
  ('Otros',      'OTR', '📦', 9)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO equipment_subtipos (categoria_id, nombre, orden)
SELECT c.id, s.nombre, s.orden
FROM (VALUES
  ('Tecnología', 'Drone',            1),
  ('Tecnología', 'GPS',              2),
  ('Tecnología', 'Laptop',           3),
  ('Tecnología', 'Cámara',           4),
  ('Tecnología', 'Servidor',         5),
  ('Tecnología', 'Licencia',         6),
  ('Tecnología', 'Pantalla',         7),
  ('Tecnología', 'PC de escritorio', 8),
  ('Vehículos',  'Vehículo',         1),
  ('Mobiliario', 'Mesa',             1),
  ('Mobiliario', 'Silla',            2),
  ('Mobiliario', 'Electrodoméstico', 3),
  ('Otros',      'Otro',             1)
) AS s(cat, nombre, orden)
JOIN equipment_categorias c ON c.nombre = s.cat
ON CONFLICT (categoria_id, nombre) DO NOTHING;

-- ── 4. Mapear equipos existentes (enum -> categoría/subtipo) ─
UPDATE equipment e SET
  categoria_id = st.categoria_id,
  subtipo_id   = st.id
FROM equipment_subtipos st
JOIN equipment_categorias c ON c.id = st.categoria_id
WHERE e.categoria_id IS NULL
  AND (
    (e.tipo = 'DRONE'    AND c.nombre = 'Tecnología' AND st.nombre = 'Drone')    OR
    (e.tipo = 'GPS'      AND c.nombre = 'Tecnología' AND st.nombre = 'GPS')      OR
    (e.tipo = 'LAPTOP'   AND c.nombre = 'Tecnología' AND st.nombre = 'Laptop')   OR
    (e.tipo = 'CAMARA'   AND c.nombre = 'Tecnología' AND st.nombre = 'Cámara')   OR
    (e.tipo = 'SERVIDOR' AND c.nombre = 'Tecnología' AND st.nombre = 'Servidor') OR
    (e.tipo = 'LICENCIA' AND c.nombre = 'Tecnología' AND st.nombre = 'Licencia') OR
    (e.tipo = 'VEHICULO' AND c.nombre = 'Vehículos'  AND st.nombre = 'Vehículo') OR
    (e.tipo = 'OTRO'     AND c.nombre = 'Otros'      AND st.nombre = 'Otro')
  );

-- Cualquier equipo sin mapear queda en Otros / Otro
UPDATE equipment e SET
  categoria_id = st.categoria_id,
  subtipo_id   = st.id
FROM equipment_subtipos st
JOIN equipment_categorias c ON c.id = st.categoria_id
WHERE e.categoria_id IS NULL
  AND c.nombre = 'Otros' AND st.nombre = 'Otro';

-- ── 5. Identificador de inventario para equipos existentes ──
-- PREFIJO-AAAAMMDD-NNN (fecha de compra o fecha de creación).
WITH numerados AS (
  SELECT
    e.id,
    c.prefijo
      || '-'
      || to_char(COALESCE(e.fecha_compra, e.created_at::date), 'YYYYMMDD')
      || '-'
      || lpad(
           ROW_NUMBER() OVER (
             PARTITION BY c.prefijo, COALESCE(e.fecha_compra, e.created_at::date)
             ORDER BY e.id
           )::text, 3, '0'
         ) AS ident
  FROM equipment e
  JOIN equipment_categorias c ON c.id = e.categoria_id
  WHERE e.identificador IS NULL OR e.identificador = ''
)
UPDATE equipment e SET identificador = n.ident
FROM numerados n
WHERE e.id = n.id;
