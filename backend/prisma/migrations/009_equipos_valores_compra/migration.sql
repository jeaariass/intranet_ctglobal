-- backend/prisma/migrations/009_equipos_valores_compra/migration.sql
-- Actualización de valores reales de compra de equipos
-- Fuentes: Factura FEGM1166, Proforma MR PC STORE 001, Amazon 113-8456365-9997801

-- ── 1. Estación de Trabajo i7 / RTX 4070 Ti ──────────────────
-- Factura FEGM1166 | Geomática Moncaleano Saenz S.A.S
-- Fecha: 04/03/2024 | Neto factura: $18.297.775,26 COP
UPDATE equipment SET
  valor_compra = 18297775.26,
  fecha_compra = '2024-03-04',
  marca        = 'Geomática Moncaleano / Ensamble',
  modelo       = 'i7-13700K + Z690 Maximus + RTX 4070 Ti SUPER 16GB + 2x32GB DDR5 5200MHz + 1TB NVMe Gen4'
WHERE nombre ILIKE '%Estación de Trabajo%' OR nombre ILIKE '%Procesamiento GIS%';

-- ── 2. Servidor NAS QNAP TS-464 ──────────────────────────────
-- Factura Proforma 001 | MR PC STORE S.A.S | NIT: 900.989.148-0
-- Fecha: 15/02/2025 | Total con IVA: $4.891.930 COP
-- Incluye: QNAP TS-464 + 1x WD Red Plus 8TB
UPDATE equipment SET
  valor_compra = 4891930,
  fecha_compra = '2025-02-15',
  marca        = 'QNAP',
  modelo       = 'TS-464-8G (Intel Celeron N5095, 8GB DDR4) + WD Red Plus 8TB',
  descripcion  = 'Servidor NAS 4 bahías. CPU Intel Celeron N5095 4 núcleos 2.9GHz, 8GB DDR4, puertos Gigabit/2.5GbE. Comprado con 1x WD Red Plus 8TB. Disco adicional WD Red Pro 20TB instalado en nov 2025.'
WHERE nombre ILIKE '%NAS%' OR nombre ILIKE '%QNAP%';

-- ── 3. Disco adicional WD Red Pro 20TB ───────────────────────
-- Amazon Orden 113-8456365-9997801 | 28/11/2025
-- Total pagado: USD $502.45 (producto $419.99 + cargos importación $82.46)
INSERT INTO equipment
  (nombre, tipo, marca, modelo, serial, estado,
   descripcion, ubicacion, fecha_compra, valor_compra)
VALUES (
  'Disco Duro NAS WD Red Pro 20TB',
  'OTRO',
  'Western Digital',
  'WD Red Pro NAS 20TB WD202KFGX',
  'WD202KFGX',
  'DISPONIBLE',
  'Disco duro NAS interno 20TB. 7200 RPM, SATA 6Gb/s, CMR, 512MB caché, 3.5". Instalado en NAS QNAP TS-464. Amazon Orden 113-8456365-9997801. Precio producto USD$419.99 + cargos importación USD$82.46.',
  'Oficina Bogotá — instalado en NAS QNAP',
  '2025-11-28',
  502.45
)
ON CONFLICT DO NOTHING;

-- ── 4. Actualizar moneda del disco (es USD) ───────────────────
-- El campo valor_compra es NUMERIC, el valor 502.45 queda en USD
-- Añadimos nota en descripción (no hay campo moneda en equipment)

-- ── 5. Facturas de compra de equipos ─────────────────────────

-- Factura estación de trabajo
INSERT INTO invoices
  (concepto, tipo, estado, proveedor, monto, moneda,
   fecha_emision, periodo_mes, periodo_anio,
   equipo_id, notas, archivo_pdf, registrado_por_id)
SELECT
  'Compra Estación de Trabajo GIS — Factura FEGM1166',
  'COMPRA', 'PAGADO', 'Geomática Moncaleano Saenz S.A.S',
  18297775.26, 'COP',
  '2024-03-04', 3, 2024,
  id,
  'Factura electrónica FEGM1166 | NIT 900999434-5 | i7-13700K + RTX 4070 Ti SUPER 16GB + 64GB DDR5 + 1TB NVMe | Total operación $18.431.910 | ReteICA $134.134,74 | Neto $18.297.775,26',
  'dian_FEGM1166.pdf',
  1
FROM equipment
WHERE nombre ILIKE '%Estación de Trabajo%' OR nombre ILIKE '%Procesamiento GIS%'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Factura NAS QNAP
INSERT INTO invoices
  (concepto, tipo, estado, proveedor, monto, moneda,
   fecha_emision, periodo_mes, periodo_anio,
   equipo_id, notas, archivo_pdf, registrado_por_id)
SELECT
  'Compra NAS QNAP TS-464 + WD Red Plus 8TB',
  'COMPRA', 'PAGADO', 'MR PC STORE S.A.S',
  4891930, 'COP',
  '2025-02-15', 2, 2025,
  id,
  'Proforma 001 | NIT 900.989.148-0 | QNAP TS-464-8G $3.277.310 + WD Red Plus 8TB $882.353 | Subtotal $4.159.663 | RETE.ICA $45.922 | Retefuente $103.992 | IVA 19% $790.335 | Total $4.891.930',
  'PROFORMA_CONEXIÓN_TERRITORIAL_GLOBAL_SAS.pdf',
  1
FROM equipment
WHERE nombre ILIKE '%NAS%' OR nombre ILIKE '%QNAP%'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Factura disco WD Red Pro 20TB Amazon
INSERT INTO invoices
  (concepto, tipo, estado, proveedor, monto, moneda,
   monto_secundario, moneda_secundaria,
   fecha_emision, periodo_mes, periodo_anio,
   equipo_id, notas, archivo_pdf, registrado_por_id)
SELECT
  'Compra Disco WD Red Pro NAS 20TB — Amazon',
  'COMPRA', 'PAGADO', 'Amazon / GizRenew',
  0, 'COP',
  502.45, 'USD',
  '2025-11-28', 11, 2025,
  id,
  'Amazon Orden 113-8456365-9997801 | WD202KFGX | Producto USD$419.99 + cargos importación USD$82.46 | Entregado 10 dic 2025 | Instalado en NAS QNAP TS-464',
  'Detalles_del_pedido.pdf',
  1
FROM equipment
WHERE nombre ILIKE '%WD Red Pro%' OR nombre ILIKE '%20TB%'
LIMIT 1
ON CONFLICT DO NOTHING;

-- ── Verificar equipos actualizados ────────────────────────────
SELECT nombre, marca, modelo, valor_compra, fecha_compra
FROM equipment
WHERE nombre ILIKE '%Estación%'
   OR nombre ILIKE '%NAS%'
   OR nombre ILIKE '%WD Red%'
ORDER BY fecha_compra;

-- ── Verificar facturas de compra ──────────────────────────────
SELECT concepto, monto, moneda, monto_secundario, moneda_secundaria, estado
FROM invoices
WHERE tipo = 'COMPRA'
ORDER BY fecha_emision;
