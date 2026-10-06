-- backend/prisma/migrations/020_gasto_categoria_equipo/migration.sql
-- Fusión de Facturación dentro de Gastos: las facturas de equipos (compra,
-- mantenimiento, licencias/servicios) pasan a ser gastos con categoría
-- "Equipo" (subcategoria = tipo original). Solo el cambio de esquema va
-- aquí — el traspaso de datos y archivos lo hace
-- backend/scripts/merge-facturacion.js (necesita copiar archivos en disco,
-- algo que SQL no puede hacer), corrido automáticamente por deploy.sh
-- justo después de que esta migración quede confirmada.

ALTER TYPE gasto_categoria ADD VALUE IF NOT EXISTS 'EQUIPO';
