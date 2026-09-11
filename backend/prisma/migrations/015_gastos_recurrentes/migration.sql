-- backend/prisma/migrations/015_gastos_recurrentes/migration.sql
-- Gastos recurrentes: FIJO (monto y fecha constantes, ej. administración) vs
-- VARIABLE (misma fecha, monto distinto cada mes, ej. facturas de servicios).
-- serie_id agrupa todas las ocurrencias mensuales de un mismo gasto recurrente
-- (autoreferencia: la primera fila de la serie tiene serie_id = su propio id).

ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS recurrente_tipo TEXT,
  ADD COLUMN IF NOT EXISTS serie_id        INT REFERENCES gastos(id),
  ADD COLUMN IF NOT EXISTS por_completar   BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
  ALTER TABLE gastos ADD CONSTRAINT gastos_recurrente_tipo_check
    CHECK (recurrente_tipo IS NULL OR recurrente_tipo IN ('FIJO','VARIABLE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS gastos_serie_idx ON gastos(serie_id);
