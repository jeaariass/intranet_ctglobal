-- backend/prisma/migrations/006_invoices_dual_currency/migration.sql
-- Agrega soporte para cobros mixtos (USD + COP en la misma factura)

ALTER TABLE invoices
  ADD COLUMN monto_secundario  NUMERIC(14, 2) DEFAULT NULL,
  ADD COLUMN moneda_secundaria TEXT           DEFAULT NULL;

COMMENT ON COLUMN invoices.monto_secundario  IS 'Monto en segunda moneda (ej: IVA en COP cuando el servicio es en USD)';
COMMENT ON COLUMN invoices.moneda_secundaria IS 'Moneda del cobro secundario: COP, USD, EUR';