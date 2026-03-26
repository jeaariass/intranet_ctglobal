-- backend/prisma/migrations/007_usuarios_equipo/migration.sql
-- Usuarios del equipo CTGlobal
-- Contraseñas hasheadas con bcrypt (rounds=10)
-- Pedir cambio de contraseña en primer ingreso

INSERT INTO users
  (nombre, apellido, email, password, cargo, area, rol, activo)
VALUES
  ('Jesús', 'Arias', 'jesus.arias@ctglobal.com.co', '$2a$10$mDLQ9pRi0ZYr5fz9KaumreOuhVnwZOE/UO/t4EoZezxBYTnwgGgAa', 'Especialista GIS', 'Geomática', 'ADMIN', true),
  ('Dirección', 'CTGlobal', 'direccion@ctglobal.com.co', '$2a$10$x51Y90J2A/cC0T6kMst7XeYrCpGQ9ydUWxOMKDOZNycf0vZFXXxhy', 'Director General', 'Dirección', 'ADMIN', true),
  ('Camila', 'Rodríguez', 'camila.rodriguez@ctglobal.com.co', '$2a$10$UOut9iW1../Ul8mo8YUEu.GUhnupf1wRq7agkLDXJpTCwdEocZ1tq', 'Profesional GIS', 'Geomática', 'EDITOR', true),
  ('Administrativa', 'CTGlobal', 'administrativa@ctglobal.com.co', '$2a$10$afIXzWmnCL9OSTil/lxkk.VLVoywWqXQqSE1m8en0z6sJBE6mQIXS', 'Coordinadora Administrativa', 'Administrativa', 'EDITOR', true),
  ('Contabilidad', 'CTGlobal', 'contabilidad@ctglobal.com.co', '$2a$10$ElsTy9h3hg0MCKM0nuXJpumFBK7UrvpT9DBQtAO32QlR4PAU.EQtW', 'Contadora', 'Contabilidad', 'EDITOR', true),
  ('Comunicaciones', 'CTGlobal', 'comunicaciones@ctglobal.com.co', '$2a$10$s8.DutNCgCV9xmO4OgUK0eaomUYRcXFIIysxs6i1ytTsVDBB5aSnu', 'Comunicadora', 'Comunicaciones', 'EDITOR', true)
ON CONFLICT (email) DO NOTHING;

-- Verificar
SELECT id, nombre, apellido, email, rol FROM users ORDER BY id;

-- ─────────────────────────────────────────────────────────────────
-- CREDENCIALES INICIALES — compartir por canal seguro:
-- jesus.arias@ctglobal.com.co                 JesusGIS2024*
-- direccion@ctglobal.com.co                   DireccionCTG24*
-- camila.rodriguez@ctglobal.com.co            CamilaGIS2024*
-- administrativa@ctglobal.com.co              AdminCTG2024*
-- contabilidad@ctglobal.com.co                ContabCTG2024*
-- comunicaciones@ctglobal.com.co              ComsCTG2024*
-- ─────────────────────────────────────────────────────────────────