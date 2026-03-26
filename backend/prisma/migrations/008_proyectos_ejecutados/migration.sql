-- backend/prisma/migrations/008_proyectos_ejecutados/migration.sql
-- Proyectos ejecutados CTGlobal 2025-2026
-- Incluye: Carmen de Apicalá, Fusagasugá, Santa Rosa de Cabal,
--          Santander Gestor Catastral, y actualización de Dosquebradas

INSERT INTO geo_projects
  (nombre, slug, codigo, descripcion, cliente,
   geoserver_url, geoserver_workspace,
   api_key, activo, fecha_inicio, fecha_fin, url)
VALUES

  -- CP-PR-2025-112 | Carmen de Apicalá — EOT + LADM-COL-POT
  (
    'EOT Carmen de Apicalá — Geovisor + LADM-COL-POT',
    'carmen-de-apicala-eot',
    'GV-002',
    'Plataforma tecnológica web (geovisor en la nube) para disposición, presentación, consulta y análisis de cartografía y productos del proyecto EOT. Incluye diseño e implementación del Modelo Extendido de Datos LADM-COL-POT y construcción del repositorio de información para Ordenamiento Territorial (Resolución MinVivienda 0058/2025). Municipio de Carmen de Apicalá. Proyecto BPIN 2025731480001.',
    'ALDESARROLLO',
    'http://200.7.107.14:8080/geoserver',
    'carmen_apicala',
    'ctg_live_gv002_carmen_apicala',
    true,
    '2025-01-01',
    '2026-12-31',
    ''
  ),

  -- CONTRATO 007 DE 2026 | Fusagasugá — Espacio Público
  (
    'Plan Maestro Espacio Público Fusagasugá',
    'fusagasuga-espacio-publico',
    'GV-003',
    'Plataforma tecnológica web en la nube para disposición, presentación y visualización de productos cartográficos del diagnóstico del Plan Maestro de Espacio Público del municipio de Fusagasugá - Cundinamarca. Convenio interadministrativo 2025-0867 suscrito entre el municipio de Fusagasugá y OPTI. Incluye geodatabase estructurada, análisis físico-espacial, social e institucional, cálculo de déficit de espacio público y brechas de acceso.',
    'OPTI / Municipio de Fusagasugá',
    'http://200.7.107.14:8080/geoserver',
    'fusagasuga_ep',
    'ctg_live_gv003_fusagasuga_ep',
    true,
    '2026-01-01',
    '2026-12-31',
    ''
  ),

  -- CP-PR-2025-030 | Santa Rosa de Cabal — Riesgo río San Eugenio
  (
    'Geovisor Riesgo Río San Eugenio — Santa Rosa de Cabal',
    'santa-rosa-cabal-riesgo',
    'GV-004',
    'Geovisor web en la nube para productos cartográficos del estudio de análisis de amenaza, evaluación de vulnerabilidad y evaluación del riesgo para zonas aledañas al río San Eugenio a la altura del casco urbano del municipio de Santa Rosa de Cabal - Risaralda. Módulos: gestor de capas, tablas dinámicas, consulta, visor PDF, mediciones, conexión Google Maps, seguridad y gestor de archivos. Mantenimiento por 1 año.',
    'ALDESARROLLO',
    'http://200.7.107.14:8080/geoserver',
    'santa_rosa_riesgo',
    'ctg_live_gv004_santa_rosa',
    true,
    '2025-01-01',
    '2026-12-31',
    ''
  ),

  -- CPS-PJ-025-2025 | Santander — Gestor Catastral
  (
    'Factibilidad Gestor Catastral — Departamento de Santander',
    'santander-gestor-catastral',
    'CP-001',
    'Prestación de servicios de apoyo a la gestión en el marco del Convenio Interadministrativo No. CO1.PCCNTR.8544961 de 2025 (Departamento de Santander - REDU). Elaboración de diagnósticos, estudios técnicos, jurídicos y financieros para evaluar la factibilidad de habilitación como Gestor Catastral del Departamento de Santander. Entregables: diagnóstico preliminar, marco normativo, análisis financiero, análisis tributario, proyección de escenarios, lineamientos y estudios de cierre. Capas geoespaciales desplegadas en GeoServer.',
    'Departamento de Santander / REDU',
    'http://200.7.107.14:8080/geoserver',
    'santander_catastro',
    'ctg_int_cp001_santander_catastro',
    true,
    '2025-01-01',
    '2025-12-31',
    ''
  )

ON CONFLICT (slug) DO NOTHING;

-- ── Actualizar Dosquebradas (GV-001) con descripción completa ─────────────
UPDATE geo_projects SET
  nombre       = 'Estratificación Socioeconómica Dosquebradas',
  descripcion  = 'Plataforma tecnológica web especializada en la nube para disposición, presentación y visualización de los productos cartográficos de la estratificación socioeconómica del municipio de Dosquebradas - Risaralda. Módulos: gestor de capas, tablas dinámicas, consultas interactivas, visor PDF, mediciones en mapa, integración Google Maps, seguridad y gestor de archivos. Incluye capacitación y mantenimiento por 1 año.',
  cliente      = 'ALDESARROLLO',
  fecha_inicio = '2025-01-01',
  fecha_fin    = '2026-12-31'
WHERE codigo = 'GV-001';

-- ── Verificar resultado ───────────────────────────────────────────────────
SELECT codigo, nombre, cliente, activo, geoserver_workspace, fecha_fin
FROM geo_projects
ORDER BY codigo;