-- ============================================================
-- MIGRATION 004 — Módulo Inventario de Equipos
-- Base de datos: ctglobal_platform
-- Schema: public
-- Tablas: equipment, equipment_logs
-- Depende de: 001 (users), 002 (geo_projects)
-- ============================================================

-- ── TIPOS ENUM ───────────────────────────────────────────────

-- Tipos de activo que maneja CTGlobal
CREATE TYPE "EquipmentTipo" AS ENUM (
    'DRONE',       -- DJI Phantom, Mavic, etc.
    'GPS',         -- Trimble, Leica, etc.
    'LAPTOP',      -- Equipos de procesamiento
    'CAMARA',      -- Cámaras métricas, DSLR
    'SERVIDOR',    -- Hardware de servidores
    'LICENCIA',    -- Software (ArcGIS, Pix4D, Agisoft...)
    'VEHICULO',    -- Vehículos para trabajo de campo
    'OTRO'
);

-- Estado actual del equipo
CREATE TYPE "EquipmentEstado" AS ENUM (
    'DISPONIBLE',         -- En bodega, listo para asignarse
    'EN_CAMPO',           -- Asignado y en uso en un proyecto
    'EN_MANTENIMIENTO',   -- Enviado a reparación o mantenimiento preventivo
    'DANADO',             -- Con daño reportado, pendiente de diagnóstico
    'DADO_DE_BAJA'        -- Retirado definitivamente del inventario
);

-- ── TABLA: equipment ──────────────────────────────────────────
-- Inventario de todos los activos físicos y digitales de CTGlobal.
-- Incluye tanto equipos de campo (drones, GPS) como herramientas
-- de software (licencias ArcGIS, Pix4D, Agisoft Metashape).

CREATE TABLE "equipment" (
    "id"                    SERIAL PRIMARY KEY,
    "nombre"                TEXT NOT NULL,          -- Ej: "DJI Phantom 4 Pro #1"
    "tipo"                  "EquipmentTipo" NOT NULL,
    "marca"                 TEXT NOT NULL DEFAULT '',  -- Ej: "DJI", "Trimble", "ESRI"
    "modelo"                TEXT NOT NULL DEFAULT '',  -- Ej: "Phantom 4 Pro V2"
    "serial"                TEXT NOT NULL DEFAULT '',  -- Número de serie del fabricante
    "estado"                "EquipmentEstado" NOT NULL DEFAULT 'DISPONIBLE',
    "descripcion"           TEXT NOT NULL DEFAULT '',
    -- Ubicación física actual (bodega, proyecto, ciudad)
    "ubicacion"             TEXT NOT NULL DEFAULT '',
    -- Datos financieros
    "fecha_compra"          DATE,
    "valor_compra"          NUMERIC(14, 2),           -- En pesos colombianos (COP)
    -- Próximo mantenimiento preventivo
    -- Se usa para disparar alertas cuando está a ≤30 días
    "proximo_mantenimiento" DATE,
    -- Proyecto al que está asignado actualmente (NULL = disponible en bodega)
    "proyecto_actual_id"    INTEGER REFERENCES "geo_projects"("id") ON DELETE SET NULL,
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "equipment_tipo_idx"    ON "equipment"("tipo");
CREATE INDEX "equipment_estado_idx"  ON "equipment"("estado");
CREATE INDEX "equipment_proyecto_idx" ON "equipment"("proyecto_actual_id");
-- Índice para consulta de alertas de mantenimiento
CREATE INDEX "equipment_mantenimiento_idx" ON "equipment"("proximo_mantenimiento")
    WHERE "estado" != 'DADO_DE_BAJA';

COMMENT ON TABLE "equipment" IS 'Inventario de activos de CTGlobal: drones, GPS, laptops, licencias de software.';
COMMENT ON COLUMN "equipment"."serial" IS 'Número de serie del fabricante. Para licencias, usar el número de licencia.';
COMMENT ON COLUMN "equipment"."valor_compra" IS 'Valor en pesos colombianos (COP). Útil para costeo de proyectos.';
COMMENT ON COLUMN "equipment"."proximo_mantenimiento" IS 'Genera alerta en la intranet cuando está a 30 días o menos.';
COMMENT ON COLUMN "equipment"."proyecto_actual_id" IS 'NULL = disponible en bodega. Se actualiza via equipment_logs.';


-- ── TABLA: equipment_logs ─────────────────────────────────────
-- Historial completo de movimientos de cada equipo.
-- Cada cambio de estado genera un log:
--   - Asignación a proyecto
--   - Devolución a bodega
--   - Envío a mantenimiento
--   - Reporte de daño
-- Permite saber cuántos días usó cada proyecto cada equipo (para costeo).

CREATE TABLE "equipment_logs" (
    "id"           SERIAL PRIMARY KEY,
    "equipo_id"    INTEGER NOT NULL REFERENCES "equipment"("id") ON DELETE CASCADE,
    -- Proyecto relacionado con este movimiento (NULL = movimiento sin proyecto)
    "proyecto_id"  INTEGER REFERENCES "geo_projects"("id") ON DELETE SET NULL,
    -- Quién registró el movimiento
    "usuario_id"   INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
    -- Descripción corta de la acción
    -- Ej: "Asignado a proyecto", "Devuelto a bodega", "Enviado a mantenimiento"
    "accion"       TEXT NOT NULL,
    "notas"        TEXT NOT NULL DEFAULT '',
    "fecha_inicio" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- NULL mientras el equipo sigue en ese estado
    -- Se cierra cuando se registra el siguiente movimiento
    "fecha_fin"    TIMESTAMPTZ
);

CREATE INDEX "equipment_logs_equipo_idx"   ON "equipment_logs"("equipo_id");
CREATE INDEX "equipment_logs_proyecto_idx" ON "equipment_logs"("proyecto_id");
CREATE INDEX "equipment_logs_fecha_idx"    ON "equipment_logs"("fecha_inicio" DESC);
-- Índice parcial para logs abiertos (el estado actual del equipo)
CREATE INDEX "equipment_logs_abiertos_idx" ON "equipment_logs"("equipo_id")
    WHERE "fecha_fin" IS NULL;

COMMENT ON TABLE "equipment_logs" IS 'Bitácora de movimientos de equipos. Permite calcular días de uso por proyecto para costeo.';
COMMENT ON COLUMN "equipment_logs"."fecha_fin" IS 'NULL = el equipo sigue en este estado. Se cierra al registrar el próximo movimiento.';
COMMENT ON COLUMN "equipment_logs"."accion" IS 'Texto libre. Ej: "Asignado a proyecto", "Retornó de mantenimiento", "Reportado con daño".';


-- ── VISTA: v_equipment_uso_por_proyecto ───────────────────────
-- Cuántos días ha usado cada proyecto cada equipo.
-- Útil para costeo de proyectos y reportes gerenciales.

CREATE VIEW "v_equipment_uso_por_proyecto" AS
    SELECT
        gp.codigo                    AS proyecto_codigo,
        gp.nombre                    AS proyecto_nombre,
        eq.nombre                    AS equipo,
        eq.tipo                      AS equipo_tipo,
        COUNT(el.id)                 AS total_movimientos,
        SUM(
            EXTRACT(EPOCH FROM (
                COALESCE(el.fecha_fin, NOW()) - el.fecha_inicio
            )) / 86400.0
        )::NUMERIC(10,1)             AS dias_uso_total,
        eq.valor_compra              AS valor_equipo_cop
    FROM "equipment_logs" el
    JOIN "equipment"    eq ON el.equipo_id   = eq.id
    JOIN "geo_projects" gp ON el.proyecto_id = gp.id
    WHERE el.proyecto_id IS NOT NULL
    GROUP BY gp.codigo, gp.nombre, eq.nombre, eq.tipo, eq.valor_compra
    ORDER BY dias_uso_total DESC;

COMMENT ON VIEW "v_equipment_uso_por_proyecto" IS 'Días de uso de cada equipo por proyecto. Para costeo y análisis de rentabilidad.';
