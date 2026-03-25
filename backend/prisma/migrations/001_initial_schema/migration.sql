-- ============================================================
-- MIGRATION 001 — Schema base de la intranet CTGlobal
-- Base de datos: ctglobal_platform
-- Schema: public
-- Tablas: users, announcements, documents, events
-- Autor: CTGlobal
-- ============================================================

-- ── TIPOS ENUM ───────────────────────────────────────────────

-- Roles del equipo interno CTGlobal
CREATE TYPE "UserRol" AS ENUM (
    'ADMIN',      -- Acceso total: crear usuarios, geovisores, todo
    'EDITOR',     -- Puede crear/editar contenido pero no gestionar usuarios
    'EMPLEADO'    -- Solo lectura y perfil propio
);

-- Tipos de comunicado
CREATE TYPE "AnnouncementTipo" AS ENUM (
    'GENERAL',
    'COMUNICADO',
    'EVENTO',
    'URGENTE'
);

-- Prioridad de comunicados
CREATE TYPE "Prioridad" AS ENUM (
    'NORMAL',
    'ALTA'
);

-- Categorías del repositorio documental
-- Pensadas para el portafolio de CTGlobal (catastro, SIG, geomática)
CREATE TYPE "DocumentCategoria" AS ENUM (
    'GENERAL',
    'CONTRATO',       -- Contratos SECOP, privados
    'INFORME',        -- Informes técnicos de proyectos
    'CARTOGRAFIA',    -- Archivos .shp, .dwg, .geojson, .kml
    'NORMATIVA',      -- CONPES, decretos, resoluciones
    'PROPUESTA',      -- Propuestas comerciales
    'RRHH',           -- Recursos humanos
    'LEGAL',          -- Documentos jurídicos
    'CONTABILIDAD',
    'PROCEDIMIENTO',  -- SOPs, protocolos internos
    'FORMATO'         -- Plantillas reutilizables
);

-- Tipos de evento en el calendario corporativo
CREATE TYPE "EventTipo" AS ENUM (
    'REUNION',
    'CAPACITACION',
    'FESTIVO',
    'ENTREGA',        -- Entrega de un producto a un cliente
    'VENCIMIENTO',    -- Vencimiento de contrato o licencia
    'LICITACION',     -- Fecha límite de presentación en SECOP
    'OTRO'
);

-- ── TABLA: users ─────────────────────────────────────────────
-- Equipo interno de CTGlobal (no usuarios de geovisores)

CREATE TABLE "users" (
    "id"         SERIAL PRIMARY KEY,
    "nombre"     TEXT NOT NULL,
    "apellido"   TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "password"   TEXT NOT NULL,               -- bcrypt hash
    "cargo"      TEXT NOT NULL DEFAULT '',    -- Ej: "Especialista GIS"
    "area"       TEXT NOT NULL DEFAULT '',    -- Ej: "Geomática"
    "telefono"   TEXT NOT NULL DEFAULT '',
    "avatar"     TEXT NOT NULL DEFAULT '',    -- URL o path del avatar
    "rol"        "UserRol" NOT NULL DEFAULT 'EMPLEADO',
    "activo"     BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "users_email_key" UNIQUE ("email")
);

-- Índice para login rápido por email
CREATE INDEX "users_email_idx" ON "users"("email");
-- Índice para filtrar activos
CREATE INDEX "users_activo_idx" ON "users"("activo");

COMMENT ON TABLE "users" IS 'Equipo interno de CTGlobal. NO incluye usuarios externos de geovisores.';
COMMENT ON COLUMN "users"."rol" IS 'ADMIN = acceso total | EDITOR = gestión de contenido | EMPLEADO = solo lectura';


-- ── TABLA: announcements ─────────────────────────────────────
-- Comunicados internos visibles para todo el equipo

CREATE TABLE "announcements" (
    "id"         SERIAL PRIMARY KEY,
    "titulo"     TEXT NOT NULL,
    "contenido"  TEXT NOT NULL,
    "tipo"       "AnnouncementTipo" NOT NULL DEFAULT 'GENERAL',
    "prioridad"  "Prioridad" NOT NULL DEFAULT 'NORMAL',
    "activo"     BOOLEAN NOT NULL DEFAULT TRUE,   -- soft delete
    "autor_id"   INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "announcements_activo_idx"    ON "announcements"("activo");
CREATE INDEX "announcements_created_idx"   ON "announcements"("created_at" DESC);

COMMENT ON TABLE "announcements" IS 'Comunicados internos. Se hace soft-delete (activo=FALSE) en vez de borrar.';
COMMENT ON COLUMN "announcements"."autor_id" IS 'NULL si el autor fue eliminado del sistema.';


-- ── TABLA: documents ─────────────────────────────────────────
-- Repositorio central de documentos
-- Soporta: PDF, Word, Excel, PPT, imágenes, .shp, .dwg, .geojson, .kml, .zip

CREATE TABLE "documents" (
    "id"           SERIAL PRIMARY KEY,
    "nombre"       TEXT NOT NULL,               -- Nombre descriptivo del documento
    "descripcion"  TEXT NOT NULL DEFAULT '',
    "categoria"    "DocumentCategoria" NOT NULL DEFAULT 'GENERAL',
    "proyecto_id"  INTEGER,                     -- FK a geo_projects (se agrega en migration 002)
    "archivo"      TEXT NOT NULL,               -- Nombre del archivo en /uploads/documents/
    "tamano"       INTEGER NOT NULL DEFAULT 0,  -- Tamaño en bytes
    "subido_por_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "documents_categoria_idx"  ON "documents"("categoria");
CREATE INDEX "documents_proyecto_idx"   ON "documents"("proyecto_id");
CREATE INDEX "documents_created_idx"    ON "documents"("created_at" DESC);

-- Búsqueda de texto en nombre y descripción
CREATE INDEX "documents_nombre_idx" ON "documents" USING gin(to_tsvector('spanish', "nombre"));

COMMENT ON TABLE "documents" IS 'Repositorio documental. Los archivos físicos se guardan en /uploads/documents/';
COMMENT ON COLUMN "documents"."archivo" IS 'Nombre único del archivo generado al subir. Ej: 1715000000-abc123.pdf';
COMMENT ON COLUMN "documents"."proyecto_id" IS 'FK a geo_projects. NULL = documento general, no ligado a un proyecto.';


-- ── TABLA: events ─────────────────────────────────────────────
-- Calendario corporativo: reuniones, entregas, licitaciones, vencimientos

CREATE TABLE "events" (
    "id"           SERIAL PRIMARY KEY,
    "titulo"       TEXT NOT NULL,
    "descripcion"  TEXT NOT NULL DEFAULT '',
    "fecha_inicio" TIMESTAMPTZ NOT NULL,
    "fecha_fin"    TIMESTAMPTZ,                 -- NULL = evento sin hora de fin / todo el día
    "tipo"         "EventTipo" NOT NULL DEFAULT 'REUNION',
    "proyecto_id"  INTEGER,                     -- FK a geo_projects (se agrega en migration 002)
    "creado_por_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "events_fecha_idx"    ON "events"("fecha_inicio" ASC);
CREATE INDEX "events_proyecto_idx" ON "events"("proyecto_id");

COMMENT ON TABLE "events" IS 'Calendario corporativo. Incluye entregas, vencimientos de contratos SECOP y reuniones.';
COMMENT ON COLUMN "events"."tipo" IS 'LICITACION y VENCIMIENTO son críticos para alertas automáticas.';
