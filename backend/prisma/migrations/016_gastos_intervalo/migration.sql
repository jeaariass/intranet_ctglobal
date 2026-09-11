-- backend/prisma/migrations/016_gastos_intervalo/migration.sql
-- Periodicidad de gastos recurrentes: no todos son mensuales (ej. agua
-- se cobra cada 2 meses). intervalo_meses = cada cuántos meses se genera
-- la siguiente ocurrencia de la serie.

ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS intervalo_meses INT NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE gastos ADD CONSTRAINT gastos_intervalo_meses_check
    CHECK (intervalo_meses >= 1 AND intervalo_meses <= 12);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
