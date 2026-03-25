-- ============================================================
-- MIGRATION 005 — Módulo de Facturas
-- Base de datos: ctglobal_platform
-- Tabla: invoices
-- ============================================================

CREATE TYPE "InvoiceTipo" AS ENUM (
    'COMPRA',
    'SERVICIO_MENSUAL',
    'SERVICIO_ANUAL',
    'MANTENIMIENTO',
    'OTRO'
);

CREATE TYPE "InvoiceEstado" AS ENUM (
    'PENDIENTE',
    'PAGADO',
    'VENCIDO',
    'CANCELADO'
);

CREATE TABLE "invoices" (
    "id"                 SERIAL PRIMARY KEY,
    "concepto"           TEXT NOT NULL,
    "tipo"               "InvoiceTipo"   NOT NULL DEFAULT 'OTRO',
    "estado"             "InvoiceEstado" NOT NULL DEFAULT 'PENDIENTE',
    "proveedor"          TEXT NOT NULL DEFAULT '',
    "monto"              NUMERIC(14, 2) NOT NULL,
    "moneda"             TEXT NOT NULL DEFAULT 'COP',
    "fecha_emision"      DATE NOT NULL,
    "fecha_vencimiento"  DATE,
    "periodo_mes"        INTEGER,
    "periodo_anio"       INTEGER,
    "equipo_id"          INTEGER REFERENCES "equipment"("id") ON DELETE SET NULL,
    "archivo_pdf"        TEXT DEFAULT '',
    "notas"              TEXT DEFAULT '',
    "registrado_por_id"  INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "invoices_estado_idx"      ON "invoices"("estado");
CREATE INDEX "invoices_tipo_idx"        ON "invoices"("tipo");
CREATE INDEX "invoices_equipo_idx"      ON "invoices"("equipo_id");
CREATE INDEX "invoices_vencimiento_idx" ON "invoices"("fecha_vencimiento");
CREATE INDEX "invoices_periodo_idx"     ON "invoices"("periodo_anio", "periodo_mes");

CREATE VIEW "v_invoices_por_vencer" AS
    SELECT * FROM "invoices"
    WHERE estado = 'PENDIENTE'
      AND fecha_vencimiento IS NOT NULL
      AND fecha_vencimiento <= (CURRENT_DATE + INTERVAL '5 days')
      AND fecha_vencimiento >= CURRENT_DATE
    ORDER BY fecha_vencimiento ASC;
