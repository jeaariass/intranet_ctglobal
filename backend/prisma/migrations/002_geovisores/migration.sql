-- ============================================================
-- MIGRATION 002 — Módulo de Geovisores
-- Base de datos: ctglobal_platform
-- Schema: public
-- Tablas: geo_projects, project_users, geo_sessions, layer_views
-- Depende de: 001_initial_schema (tabla users)
-- ============================================================

-- ── TIPOS ENUM ───────────────────────────────────────────────

-- Rol del usuario EXTERNO (cliente) en un geovisor
-- Distinto a UserRol que es para el equipo interno
CREATE TYPE "ProjectRol" AS ENUM (
    'VIEWER',   -- Solo puede ver capas, sin editar nada
    'FUNCIONARIO'    -- Puede interactuar con herramientas sin cambiar usuarios y subir documentos
    'EDITOR'    -- Puede interactuar con herramientas de edición
);

-- ── TABLA: geo_projects ───────────────────────────────────────
-- Cada fila es un geovisor que CTGlobal tiene desplegado
-- Ej: DOS_QUEBRADAS_ESTRATIFICACION, CARMEN_DE_APICALA

CREATE TABLE "geo_projects" (
    "id"                   SERIAL PRIMARY KEY,
    "nombre"               TEXT NOT NULL,
    -- slug: identificador URL-friendly. Ej: "dos-quebradas"
    -- Se usa internamente para referenciar el schema de PostgreSQL del proyecto
    "slug"                 TEXT NOT NULL,
    -- codigo: visible al usuario. Ej: "GV-001", "GV-002"
    "codigo"               TEXT NOT NULL,
    "descripcion"          TEXT NOT NULL DEFAULT '',
    "cliente"              TEXT NOT NULL DEFAULT '',     -- Ej: "Alcaldía de Dosquebradas"
    -- URL donde está desplegado el geovisor
    "url"                  TEXT NOT NULL DEFAULT '',     -- Ej: "https://ctglobal.com.co/DOS_QUEBRADAS/"
    -- Configuración de GeoServer
    "geoserver_url"        TEXT NOT NULL DEFAULT '',     -- Ej: "http://200.7.107.14:8080/geoserver"
    "geoserver_workspace"  TEXT NOT NULL DEFAULT '',     -- Ej: "dos_quebradas"
    -- API Key que el geovisor usa en el header x-api-key para autenticar
    -- contra la intranet. Generada automáticamente, nunca se expone al cliente.
    "api_key"              TEXT NOT NULL,
    "activo"               BOOLEAN NOT NULL DEFAULT TRUE,
    -- Fechas del contrato. Cuando fechaFin < NOW() el acceso expira automáticamente.
    "fecha_inicio"         DATE,
    "fecha_fin"            DATE,
    "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "geo_projects_slug_key"    UNIQUE ("slug"),
    CONSTRAINT "geo_projects_codigo_key"  UNIQUE ("codigo"),
    CONSTRAINT "geo_projects_api_key_key" UNIQUE ("api_key")
);

CREATE INDEX "geo_projects_activo_idx"   ON "geo_projects"("activo");
CREATE INDEX "geo_projects_api_key_idx"  ON "geo_projects"("api_key");  -- login del geovisor es frecuente
CREATE INDEX "geo_projects_fecha_fin_idx" ON "geo_projects"("fecha_fin");

COMMENT ON TABLE "geo_projects" IS 'Cada fila representa un geovisor desplegado por CTGlobal para un cliente.';
COMMENT ON COLUMN "geo_projects"."slug" IS 'Corresponde al nombre del schema PostgreSQL de ese proyecto. Ej: slug=dos_quebradas → schema dos_quebradas';
COMMENT ON COLUMN "geo_projects"."api_key" IS 'Clave secreta que el geovisor envía en x-api-key. Nunca compartir con el cliente final.';
COMMENT ON COLUMN "geo_projects"."fecha_fin" IS 'Vencimiento del contrato. La API rechaza logins después de esta fecha.';


-- ── FK diferidas: documentos y eventos ────────────────────────
-- En migration 001 las tablas documents y events tienen proyecto_id
-- pero geo_projects no existía aún. Agregamos las FK ahora.

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "geo_projects"("id")
    ON DELETE SET NULL;

ALTER TABLE "events"
    ADD CONSTRAINT "events_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "geo_projects"("id")
    ON DELETE SET NULL;

COMMENT ON COLUMN "documents"."proyecto_id" IS 'FK a geo_projects. Documenta del expediente de ese proyecto.';


-- ── TABLA: project_users ──────────────────────────────────────
-- Usuarios EXTERNOS (clientes) que acceden a un geovisor específico.
-- Un mismo email puede tener acceso a múltiples proyectos (filas separadas).
-- Ej: tecnico@alcaldia.gov.co puede tener acceso a GV-001 y GV-003.

CREATE TABLE "project_users" (
    "id"          SERIAL PRIMARY KEY,
    -- Referencia opcional: si el usuario también es del equipo CTGlobal
    "user_id"     INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
    -- Datos propios del usuario externo
    "email"       TEXT NOT NULL,
    "nombre"      TEXT NOT NULL,
    "password"    TEXT NOT NULL,           -- bcrypt hash, credencial para este proyecto
    "proyecto_id" INTEGER NOT NULL REFERENCES "geo_projects"("id") ON DELETE CASCADE,
    "rol"         "ProjectRol" NOT NULL DEFAULT 'VIEWER',
    "activo"      BOOLEAN NOT NULL DEFAULT TRUE,
    -- Fecha en que pierde acceso. NULL = sin límite.
    -- Independiente de geo_projects.fecha_fin (control por usuario individual)
    "expires_at"  TIMESTAMPTZ,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Un email solo puede aparecer una vez por proyecto
    CONSTRAINT "project_users_email_proyecto_key" UNIQUE ("email", "proyecto_id")
);

CREATE INDEX "project_users_proyecto_idx" ON "project_users"("proyecto_id");
CREATE INDEX "project_users_email_idx"    ON "project_users"("email");
CREATE INDEX "project_users_activo_idx"   ON "project_users"("activo");

COMMENT ON TABLE "project_users" IS 'Usuarios externos (clientes) con acceso a un geovisor. Un usuario puede estar en varios proyectos.';
COMMENT ON COLUMN "project_users"."expires_at" IS 'Control individual de expiración. NULL = sin límite de tiempo.';
COMMENT ON COLUMN "project_users"."user_id" IS 'Si el cliente también tiene cuenta en la intranet CTGlobal se puede vincular aquí.';


-- ── TABLA: geo_sessions ───────────────────────────────────────
-- Registro de cada vez que un usuario abre el geovisor y se autentica.
-- Una sesión comienza con el login y termina cuando:
--   a) El usuario hace logout explícito
--   b) El geovisor detecta que cerró la pestaña (beforeunload)
--   c) El token JWT expira (1 día)

CREATE TABLE "geo_sessions" (
    "id"               SERIAL PRIMARY KEY,
    "project_user_id"  INTEGER NOT NULL REFERENCES "project_users"("id") ON DELETE CASCADE,
    "proyecto_id"      INTEGER NOT NULL REFERENCES "geo_projects"("id") ON DELETE CASCADE,
    -- Datos del cliente para analytics
    "ip"               TEXT NOT NULL DEFAULT '',        -- IP del usuario (para geolocalización futura)
    "user_agent"       TEXT NOT NULL DEFAULT '',        -- Navegador y SO
    "started_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ended_at"         TIMESTAMPTZ,                     -- NULL = sesión todavía activa
    -- Calculado al cerrar sesión: ended_at - started_at en segundos
    "duracion_seg"     INTEGER
);

CREATE INDEX "geo_sessions_proyecto_idx"      ON "geo_sessions"("proyecto_id");
CREATE INDEX "geo_sessions_user_idx"          ON "geo_sessions"("project_user_id");
CREATE INDEX "geo_sessions_started_idx"       ON "geo_sessions"("started_at" DESC);
-- Índice parcial para sesiones activas (las más consultadas)
CREATE INDEX "geo_sessions_activas_idx"       ON "geo_sessions"("started_at") WHERE "ended_at" IS NULL;

COMMENT ON TABLE "geo_sessions" IS 'Cada login de un usuario externo en un geovisor crea una sesión. Fuente principal de analytics.';
COMMENT ON COLUMN "geo_sessions"."ended_at" IS 'NULL = sesión activa ahora mismo. Consultar para ver usuarios conectados en tiempo real.';
COMMENT ON COLUMN "geo_sessions"."duracion_seg" IS 'Segundos totales de la sesión. Se calcula y guarda al cerrar para no tener que recalcularlo en cada query de reportes.';


-- ── TABLA: layer_views ────────────────────────────────────────
-- Cada vez que un usuario activa/enciende una capa en el geovisor.
-- El SDK reporta este evento vía POST /api/geoauth/layer-view
-- Es la tabla más granular y crece más rápido → indexar bien.

CREATE TABLE "layer_views" (
    "id"           SERIAL PRIMARY KEY,
    "session_id"   INTEGER NOT NULL REFERENCES "geo_sessions"("id") ON DELETE CASCADE,
    "layer_name"   TEXT NOT NULL,   -- Nombre técnico de la capa. Ej: "dos_quebradas:predios"
    "layer_title"  TEXT NOT NULL DEFAULT '', -- Nombre visible. Ej: "Predios catastrales"
    "viewed_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "layer_views_session_idx"    ON "layer_views"("session_id");
CREATE INDEX "layer_views_layer_idx"      ON "layer_views"("layer_name");
CREATE INDEX "layer_views_viewed_idx"     ON "layer_views"("viewed_at" DESC);

-- Vista materializada para top-capas por proyecto (se refresca con cron)
-- Dejamos la vista simple por ahora, la materializada se puede agregar después
CREATE VIEW "v_top_layers" AS
    SELECT
        gp.id            AS proyecto_id,
        gp.codigo        AS proyecto_codigo,
        gp.nombre        AS proyecto_nombre,
        lv.layer_name,
        lv.layer_title,
        COUNT(*)         AS total_views,
        COUNT(DISTINCT gs.project_user_id) AS usuarios_unicos
    FROM "layer_views" lv
    JOIN "geo_sessions" gs ON lv.session_id = gs.id
    JOIN "geo_projects" gp ON gs.proyecto_id = gp.id
    GROUP BY gp.id, gp.codigo, gp.nombre, lv.layer_name, lv.layer_title
    ORDER BY total_views DESC;

COMMENT ON TABLE "layer_views" IS 'Log de activación de capas. Permite saber qué capas se usan más/menos en cada geovisor.';
COMMENT ON VIEW "v_top_layers" IS 'Vista agregada para reportes de capas más consultadas por proyecto.';
