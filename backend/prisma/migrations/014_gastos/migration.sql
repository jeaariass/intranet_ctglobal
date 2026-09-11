-- backend/prisma/migrations/014_gastos/migration.sql
-- Módulo de Gastos operativos: recibos públicos, administración, pagos a
-- contratistas, vuelos, viáticos y "otros". La depreciación NO se guarda aquí
-- (se calcula al vuelo), pero se añaden los parámetros de depreciación al equipo.

-- ── 1. Enums ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE gasto_categoria AS ENUM (
    'RECIBO_PUBLICO','ADMINISTRACION','CONTRATISTA',
    'VUELO','VIATICO','DEPRECIACION','OTRO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gasto_estado AS ENUM ('PENDIENTE','PAGADO','ANULADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Tabla gastos ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gastos (
  id                SERIAL PRIMARY KEY,
  categoria         gasto_categoria NOT NULL DEFAULT 'OTRO',
  subcategoria      TEXT  NOT NULL DEFAULT '',        -- "Energía","Agua","Internet"...
  concepto          TEXT  NOT NULL,
  proveedor         TEXT  NOT NULL DEFAULT '',
  monto             NUMERIC(14,2) NOT NULL,
  moneda            TEXT  NOT NULL DEFAULT 'COP',
  monto_secundario  NUMERIC(14,2),
  moneda_secundaria TEXT,
  fecha             DATE  NOT NULL,                   -- fecha del gasto/pago
  fecha_vencimiento DATE,
  periodo_mes       INT,                              -- mes contable 1-12
  periodo_anio      INT,
  estado            gasto_estado NOT NULL DEFAULT 'PENDIENTE',
  persona_id        INT REFERENCES users(id),
  equipo_id         INT REFERENCES equipment(id),
  proyecto_id       INT REFERENCES geo_projects(id),
  recurrente        BOOLEAN NOT NULL DEFAULT FALSE,
  archivo           TEXT  NOT NULL DEFAULT '',
  notas             TEXT  NOT NULL DEFAULT '',
  registrado_por_id INT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gastos_categoria_idx ON gastos(categoria);
CREATE INDEX IF NOT EXISTS gastos_periodo_idx   ON gastos(periodo_anio, periodo_mes);
CREATE INDEX IF NOT EXISTS gastos_persona_idx   ON gastos(persona_id);
CREATE INDEX IF NOT EXISTS gastos_proyecto_idx  ON gastos(proyecto_id);
CREATE INDEX IF NOT EXISTS gastos_estado_idx    ON gastos(estado);

-- ── 3. Parámetros de depreciación por equipo ───────────────
-- valor_compra se asume en COP (la columna no tiene moneda).
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS vida_util_meses INT,
  ADD COLUMN IF NOT EXISTS valor_residual  NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciable     BOOLEAN NOT NULL DEFAULT TRUE;
