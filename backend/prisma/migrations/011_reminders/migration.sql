-- ============================================================
-- MIGRATION 011 — Módulo de Recordatorios programables
-- Base de datos: ctglobal_platform
-- Schema: public
-- Tablas: reminders, reminder_logs
-- Depende de: 001 (users), 010 (telefono_whatsapp)
--
-- Función:
--   Permite a usuarios ADMIN/EDITOR programar recordatorios que se
--   envían por WhatsApp en momentos definidos (única vez, diario,
--   semanal, mensual o cada N días) hasta una fecha de caducidad.
--
--   El envío real lo realiza un scheduler node-cron dentro del backend
--   de la intranet, que hace POST a tramites.ctglobal.com.co/api/notif/whatsapp
--   (la sesión Baileys de WhatsApp vive en T_INTRANET — esta intranet
--   solo orquesta).
-- ============================================================

-- ── TIPOS ENUM ───────────────────────────────────────────────

-- Categoría del recordatorio. Cosmético: define icono y filtro en UI.
CREATE TYPE "ReminderTipo" AS ENUM (
    'PAGO',         -- Recordar pagar factura/cuenta
    'ENTREGA',      -- Recordar entregar producto/informe
    'DOCUMENTO',    -- Recordar subir/firmar documento
    'REUNION',      -- Recordar reunión
    'GENERAL'       -- Cualquier otro
);

-- Cómo se repite el envío.
CREATE TYPE "ReminderFrec" AS ENUM (
    'UNICA',         -- 1 sola vez (en fecha_inicio + hora)
    'DIARIA',        -- Todos los días a la hora
    'SEMANAL',       -- Cada semana en dia_semana
    'MENSUAL',       -- Cada mes en dia_mes (ajusta a último día si el mes no lo tiene)
    'CADA_N_DIAS'    -- Intervalo libre en intervalo_dias
);


-- ── TABLA: reminders ─────────────────────────────────────────
-- Definición de un recordatorio. El scheduler la consulta cada minuto
-- y dispara envíos cuando proximo_envio <= NOW().

CREATE TABLE "reminders" (
    "id"                SERIAL PRIMARY KEY,
    "titulo"            TEXT NOT NULL,
    "mensaje"           TEXT NOT NULL,                  -- texto que se manda por WhatsApp
    "tipo"              "ReminderTipo" NOT NULL DEFAULT 'GENERAL',

    -- Destinatario: idealmente un usuario del sistema (toma su telefono_whatsapp).
    -- Si no es usuario interno, se puede poner número manual.
    -- Validación a nivel app: debe haber al menos uno de los dos.
    "destinatario_id"   INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
    "telefono_manual"   TEXT NOT NULL DEFAULT '',

    -- Programación
    "frecuencia"        "ReminderFrec" NOT NULL,
    "intervalo_dias"    INTEGER,                        -- solo CADA_N_DIAS
    "dia_semana"        INTEGER,                        -- 0=Dom .. 6=Sáb, solo SEMANAL
    "dia_mes"           INTEGER,                        -- 1..31, solo MENSUAL
    "hora"              TEXT NOT NULL DEFAULT '09:00',  -- HH:MM, TZ America/Bogota

    -- Vida del recordatorio
    "fecha_inicio"      DATE NOT NULL,                  -- primer envío >= esta fecha
    "fecha_caducidad"   DATE,                           -- NULL = sin caducidad
    "proximo_envio"     TIMESTAMPTZ NOT NULL,           -- calculado por el scheduler
    "ultimo_envio"      TIMESTAMPTZ,
    "veces_enviado"     INTEGER NOT NULL DEFAULT 0,

    -- Estado operacional
    "activo"            BOOLEAN NOT NULL DEFAULT TRUE,  -- soft delete
    "pausado"           BOOLEAN NOT NULL DEFAULT FALSE, -- el usuario lo paró temporalmente

    -- Auditoría
    "creado_por_id"     INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Validaciones de integridad (las puede romper la app si pasa datos malos,
    -- aquí enforced a nivel DB).
    CONSTRAINT "reminders_intervalo_check" CHECK (
        ("frecuencia" != 'CADA_N_DIAS') OR ("intervalo_dias" IS NOT NULL AND "intervalo_dias" >= 1)
    ),
    CONSTRAINT "reminders_dia_semana_check" CHECK (
        ("frecuencia" != 'SEMANAL') OR ("dia_semana" IS NOT NULL AND "dia_semana" BETWEEN 0 AND 6)
    ),
    CONSTRAINT "reminders_dia_mes_check" CHECK (
        ("frecuencia" != 'MENSUAL') OR ("dia_mes" IS NOT NULL AND "dia_mes" BETWEEN 1 AND 31)
    ),
    CONSTRAINT "reminders_destinatario_check" CHECK (
        "destinatario_id" IS NOT NULL OR LENGTH(TRIM("telefono_manual")) > 0
    )
);

-- Índice clave del scheduler: el cron pregunta por activos + no pausados
-- cuyo proximo_envio ya pasó. Este índice cubre el WHERE típico.
CREATE INDEX "reminders_scheduler_idx"
    ON "reminders"("proximo_envio")
    WHERE "activo" = TRUE AND "pausado" = FALSE;

CREATE INDEX "reminders_destinatario_idx"  ON "reminders"("destinatario_id");
CREATE INDEX "reminders_creado_por_idx"    ON "reminders"("creado_por_id");
CREATE INDEX "reminders_tipo_idx"          ON "reminders"("tipo");

-- Trigger para updated_at (reusa la función creada en migration 003 wiki)
CREATE TRIGGER "reminders_updated_at"
    BEFORE UPDATE ON "reminders"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  "reminders"                IS 'Recordatorios programables enviados por WhatsApp (vía endpoint de T_INTRANET).';
COMMENT ON COLUMN "reminders"."proximo_envio" IS 'Calculado por el backend según frecuencia. El scheduler dispara cuando proximo_envio <= NOW().';
COMMENT ON COLUMN "reminders"."hora"          IS 'Formato HH:MM, zona America/Bogota. Hora del día en que se ejecuta el envío.';
COMMENT ON COLUMN "reminders"."dia_semana"    IS '0=Domingo .. 6=Sábado. Solo aplica con frecuencia SEMANAL.';
COMMENT ON COLUMN "reminders"."dia_mes"       IS '1..31. Solo aplica con frecuencia MENSUAL. Si el mes no tiene ese día (ej. 31 en febrero), se ajusta al último día del mes.';
COMMENT ON COLUMN "reminders"."pausado"       IS 'El usuario lo paró sin borrar. Reactivable.';


-- ── TABLA: reminder_logs ─────────────────────────────────────
-- Bitácora de cada envío real. Permite ver "se envió X recordatorio Y veces
-- en las últimas N semanas, con qué resultado".

CREATE TABLE "reminder_logs" (
    "id"                    SERIAL PRIMARY KEY,
    "reminder_id"           INTEGER NOT NULL REFERENCES "reminders"("id") ON DELETE CASCADE,
    "enviado_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "canal"                 TEXT NOT NULL DEFAULT 'WHATSAPP',  -- futuro: EMAIL, SMS
    "destinatario_snapshot" TEXT NOT NULL DEFAULT '',          -- teléfono al que se envió (snapshot)
    "exito"                 BOOLEAN NOT NULL DEFAULT FALSE,
    "error"                 TEXT NOT NULL DEFAULT ''
);

CREATE INDEX "reminder_logs_reminder_idx"  ON "reminder_logs"("reminder_id");
CREATE INDEX "reminder_logs_enviado_idx"   ON "reminder_logs"("enviado_at" DESC);

COMMENT ON TABLE  "reminder_logs"                IS 'Cada disparo del scheduler crea una fila. Para reportes de salud y debugging.';
COMMENT ON COLUMN "reminder_logs"."destinatario_snapshot" IS 'Teléfono usado al momento del envío. Útil si el usuario cambia su telefono_whatsapp después.';
