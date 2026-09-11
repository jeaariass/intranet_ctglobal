-- backend/prisma/migrations/017_roles_multiples/migration.sql
-- Roles múltiples: un usuario conserva su rol principal (users.rol, usado
-- para lo que ya existía: badge, permisos de edición ADMIN/EDITOR) y puede
-- tener roles adicionales (ej. un CONTRATISTA con CONTABILIDAD extra para
-- poder ver Facturación, o SUPERVISION + CONTABILIDAD a la vez).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS roles_adicionales "UserRol"[] NOT NULL DEFAULT '{}';
