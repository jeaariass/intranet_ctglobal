-- backend/prisma/migrations/013_event_reminders/migration.sql
-- Recordatorios de eventos del calendario: correo + WhatsApp a los usuarios
-- elegidos, con una o varias antelaciones (en minutos antes del evento).

CREATE TABLE IF NOT EXISTS event_reminders (
  id             SERIAL PRIMARY KEY,
  event_id       INT         NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  destinatarios  INTEGER[]   NOT NULL DEFAULT '{}',   -- ids de users
  canal_email    BOOLEAN     NOT NULL DEFAULT TRUE,
  canal_whatsapp BOOLEAN     NOT NULL DEFAULT TRUE,
  offsets_min    INTEGER[]   NOT NULL DEFAULT '{}',   -- minutos antes: 10080, 4320, 2880, 1440, 30, …
  enviados_min   INTEGER[]   NOT NULL DEFAULT '{}',   -- offsets ya disparados
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_reminders_event_idx ON event_reminders(event_id);
