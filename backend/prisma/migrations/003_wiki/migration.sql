-- ============================================================
-- MIGRATION 003 — Módulo Wiki / Buenas Prácticas
-- Base de datos: ctglobal_platform
-- Schema: public
-- Tablas: wiki_categories, wiki_pages, wiki_revisions
-- Depende de: 001_initial_schema (tabla users)
-- ============================================================

-- ── TABLA: wiki_categories ────────────────────────────────────
-- Agrupa las páginas del wiki por área temática.
-- CTGlobal tiene categorías específicas: Protocolos de campo,
-- Procesamiento fotogramétrico, Configuración GeoServer, etc.

CREATE TABLE "wiki_categories" (
    "id"         SERIAL PRIMARY KEY,
    "nombre"     TEXT NOT NULL,
    -- slug: versión URL-friendly del nombre. Ej: "protocolos-campo"
    -- Se usa en la URL: /wiki/protocolos-campo/plan-de-vuelo
    "slug"       TEXT NOT NULL,
    -- icono: emoji que representa la categoría visualmente en el sidebar
    "icono"      TEXT NOT NULL DEFAULT '📄',
    -- orden: posición en el sidebar (menor = más arriba)
    "orden"      INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "wiki_categories_slug_key" UNIQUE ("slug")
);

-- Categorías iniciales recomendadas para CTGlobal
-- (se insertan en seed.js, no aquí, para mantener migrations idempotentes)
COMMENT ON TABLE "wiki_categories" IS 'Categorías del wiki interno. Ej: Protocolos de campo, GeoServer, Administrativa.';
COMMENT ON COLUMN "wiki_categories"."slug" IS 'Usado en URLs. Generado automáticamente desde el nombre. No cambiar después de crear.';
COMMENT ON COLUMN "wiki_categories"."orden" IS 'Orden de aparición en el sidebar. 0 = primero.';


-- ── TABLA: wiki_pages ─────────────────────────────────────────
-- Cada fila es un artículo del wiki.
-- El contenido se guarda en Markdown → se renderiza en el frontend.
-- Cada edición crea una revisión en wiki_revisions (historial).

CREATE TABLE "wiki_pages" (
    "id"           SERIAL PRIMARY KEY,
    "titulo"       TEXT NOT NULL,
    -- slug: URL-friendly. Ej: "configuracion-geoserver"
    -- URL resultante: /wiki/configuracion-geoserver
    "slug"         TEXT NOT NULL,
    -- contenido en formato Markdown
    -- Ventaja sobre HTML: más fácil de escribir, versionable, portable
    "contenido"    TEXT NOT NULL DEFAULT '',
    "categoria_id" INTEGER REFERENCES "wiki_categories"("id") ON DELETE SET NULL,
    "autor_id"     INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
    -- publicado=FALSE archiva la página sin borrarla (soft delete)
    "publicado"    BOOLEAN NOT NULL DEFAULT TRUE,
    -- revision: número incremental. Empieza en 1, +1 con cada edición.
    -- El historial completo está en wiki_revisions.
    "revision"     INTEGER NOT NULL DEFAULT 1,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- updated_at se actualiza automáticamente con trigger
    "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "wiki_pages_slug_key" UNIQUE ("slug")
);

CREATE INDEX "wiki_pages_categoria_idx"  ON "wiki_pages"("categoria_id");
CREATE INDEX "wiki_pages_publicado_idx"  ON "wiki_pages"("publicado");
CREATE INDEX "wiki_pages_updated_idx"    ON "wiki_pages"("updated_at" DESC);
-- Búsqueda full-text en título y contenido
CREATE INDEX "wiki_pages_fts_idx" ON "wiki_pages"
    USING gin(to_tsvector('spanish', "titulo" || ' ' || "contenido"));

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "wiki_pages_updated_at"
    BEFORE UPDATE ON "wiki_pages"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE "wiki_pages" IS 'Artículos del wiki en Markdown. Cada edición genera una revisión en wiki_revisions.';
COMMENT ON COLUMN "wiki_pages"."slug" IS 'Generado desde el título. No cambiar después de crear (rompe URLs).';
COMMENT ON COLUMN "wiki_pages"."revision" IS 'Número de versión actual. El historial de versiones está en wiki_revisions.';
COMMENT ON COLUMN "wiki_pages"."publicado" IS 'FALSE = archivado (soft delete). No aparece en la lista pero se conserva el historial.';


-- ── TABLA: wiki_revisions ─────────────────────────────────────
-- Historial de cambios de cada página.
-- Cada vez que se edita una página:
--   1. Se guarda la versión anterior aquí (con su contenido completo)
--   2. Se actualiza wiki_pages con el nuevo contenido
--   3. Se incrementa wiki_pages.revision
-- Esto permite ver el diff entre versiones y restaurar si es necesario.

CREATE TABLE "wiki_revisions" (
    "id"         SERIAL PRIMARY KEY,
    "page_id"    INTEGER NOT NULL REFERENCES "wiki_pages"("id") ON DELETE CASCADE,
    -- contenido completo de esa versión (no solo el diff)
    -- Más simple de implementar y suficiente para el volumen de CTGlobal
    "contenido"  TEXT NOT NULL,
    -- número de revisión que tenía la página en ese momento
    "revision"   INTEGER NOT NULL,
    "autor_id"   INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "wiki_revisions_page_idx"    ON "wiki_revisions"("page_id");
CREATE INDEX "wiki_revisions_revision_idx" ON "wiki_revisions"("page_id", "revision" DESC);

COMMENT ON TABLE "wiki_revisions" IS 'Historial completo de ediciones. Se guarda el contenido completo de cada versión anterior.';
COMMENT ON COLUMN "wiki_revisions"."contenido" IS 'Snapshot completo del contenido en ese momento. No es un diff sino la versión completa.';
