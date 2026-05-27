-- Migration 010: Extender public.UserRol y public.users para soportar Trámites CTGlobal.
-- Solicitada por el equipo de tramites.ctglobal.com.co. Cambios aditivos y compatibles
-- hacia atrás: no elimina ni renombra nada existente. Las nuevas columnas se llenan
-- únicamente para usuarios con rol CONTRATISTA; el resto las deja en sus defaults.

-- 1) UserRol: 4 valores nuevos (CONTRATISTA, CONTABILIDAD, SUPERVISION, TESORERIA).
--    Cada ADD VALUE va en su propio sub-bloque para que la migración sea idempotente
--    aun si alguno ya existe.
DO $$
BEGIN
    BEGIN ALTER TYPE "UserRol" ADD VALUE 'CONTRATISTA';   EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "UserRol" ADD VALUE 'CONTABILIDAD';  EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "UserRol" ADD VALUE 'SUPERVISION';   EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "UserRol" ADD VALUE 'TESORERIA';     EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 2) users: 11 columnas nuevas para datos del contratista (cuenta de cobro, firma, etc.).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cedula"               TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banco"                TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "numero_cuenta_banco"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tipo_cuenta"          TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telefono_whatsapp"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "contrato_referencia"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "direccion"            TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "es_persona_juridica"  BOOLEAN;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tarjeta_profesional"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "proyecto_default"     TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "firma_archivo"        TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN "users"."cedula"              IS 'Cédula del contratista. Usado en la cuenta de cobro.';
COMMENT ON COLUMN "users"."telefono_whatsapp"   IS 'Número con código de país (ej: +573001234567) para notificaciones WhatsApp.';
COMMENT ON COLUMN "users"."es_persona_juridica" IS 'true=jurídica, false=natural, NULL=sin definir.';
COMMENT ON COLUMN "users"."tarjeta_profesional" IS 'Número de tarjeta profesional del contratista (si aplica).';
COMMENT ON COLUMN "users"."proyecto_default"    IS 'Proyecto/programa por defecto del contratista (texto libre).';
COMMENT ON COLUMN "users"."firma_archivo"       IS 'Nombre del PNG con la firma del usuario, en backend/uploads/firmas/.';
