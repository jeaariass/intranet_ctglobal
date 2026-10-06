-- backend/prisma/migrations/019_contratos_contratista/migration.sql
-- Contratos de contratistas: valor mensual pactado y vigencia, para que el
-- dashboard de Finanzas pueda proyectar cuánto queda comprometido hasta fin
-- de año según los contratos activos (en vez de solo el promedio histórico
-- de pagos ya hechos).

DO $$ BEGIN
  CREATE TYPE contrato_estado AS ENUM ('ACTIVO', 'TERMINADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS contratos_contratista (
  id                SERIAL PRIMARY KEY,
  persona_id        INT NOT NULL REFERENCES users(id),
  valor_mensual     NUMERIC(14,2) NOT NULL,
  moneda            TEXT NOT NULL DEFAULT 'COP',
  fecha_inicio      DATE NOT NULL,
  fecha_fin         DATE,                      -- NULL = indefinido (vigente hasta que se marque TERMINADO)
  estado            contrato_estado NOT NULL DEFAULT 'ACTIVO',
  referencia        TEXT NOT NULL DEFAULT '',
  notas             TEXT NOT NULL DEFAULT '',
  creado_por_id     INT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contratos_contratista_persona_idx ON contratos_contratista(persona_id);
CREATE INDEX IF NOT EXISTS contratos_contratista_estado_idx  ON contratos_contratista(estado);
