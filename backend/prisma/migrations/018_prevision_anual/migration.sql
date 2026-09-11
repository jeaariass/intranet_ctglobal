-- backend/prisma/migrations/018_prevision_anual/migration.sql
-- Previsión anual de Finanzas: cuánto se debería pagar el resto del año por
-- categoría (ej. luz, agua, contratistas) según el promedio mensual real, y
-- un presupuesto total objetivo hasta fin de año para comparar contra lo
-- proyectado.

CREATE TABLE IF NOT EXISTS gastos_previsiones (
  id                  SERIAL PRIMARY KEY,
  anio                INT NOT NULL,
  categoria           gasto_categoria NOT NULL,
  subcategoria        TEXT NOT NULL DEFAULT '',
  promedio_mensual    NUMERIC(14,2),            -- NULL = usar promedio automático (últimos 6 meses)
  notas               TEXT NOT NULL DEFAULT '',
  actualizado_por_id  INT REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (anio, categoria, subcategoria)
);

CREATE TABLE IF NOT EXISTS prevision_presupuesto (
  anio                INT PRIMARY KEY,
  presupuesto_anual   NUMERIC(14,2) NOT NULL DEFAULT 0,
  notas               TEXT NOT NULL DEFAULT '',
  actualizado_por_id  INT REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
