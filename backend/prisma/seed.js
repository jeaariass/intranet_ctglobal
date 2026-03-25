require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed de la base de datos...\n");

  // ── Usuarios ──────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: "admin@ctglobal.com.co" },
    update: {},
    create: {
      nombre:   "Administrador",
      apellido: "CTGlobal",
      email:    "admin@ctglobal.com.co",
      password: await bcrypt.hash("Admin2024*", 10),
      cargo:    "Director de Tecnología",
      area:     "TI",
      rol:      "ADMIN",
    },
  });
  console.log("✅ Usuario admin:", admin.email);

  const editor = await prisma.user.upsert({
    where: { email: "jesus@ctglobal.com.co" },
    update: {},
    create: {
      nombre:   "Jesús",
      apellido: "Arias",
      email:    "jesus@ctglobal.com.co",
      password: await bcrypt.hash("CTGlobal2024*", 10),
      cargo:    "Especialista GIS",
      area:     "Geomática",
      rol:      "EDITOR",
    },
  });
  console.log("✅ Usuario editor:", editor.email);

  // ── Comunicado de bienvenida ──────────────────────────────
  const existeAnuncio = await prisma.announcement.findFirst({
    where: { titulo: "Bienvenidos a la Intranet CTGlobal v2.0" },
  });
  if (!existeAnuncio) {
    await prisma.announcement.create({
      data: {
        titulo:    "Bienvenidos a la Intranet CTGlobal v2.0",
        contenido: "Lanzamos nuestra plataforma interna unificada. Aquí encontrarán comunicados, repositorio documental, wiki de buenas prácticas, inventario de equipos y el gestor de geovisores.",
        tipo:      "COMUNICADO",
        prioridad: "ALTA",
        autor_id:  admin.id,
      },
    });
    console.log("✅ Comunicado inicial creado");
  } else {
    console.log("⏭️  Comunicado ya existe");
  }

  // ── Categorías del Wiki ───────────────────────────────────
  const cats = await Promise.all([
    prisma.wikiCategory.upsert({
      where:  { slug: "protocolos-campo" },
      update: {},
      create: { nombre: "Protocolos de Campo", slug: "protocolos-campo", icono: "🚁", orden: 1 },
    }),
    prisma.wikiCategory.upsert({
      where:  { slug: "procesamiento" },
      update: {},
      create: { nombre: "Procesamiento",       slug: "procesamiento",    icono: "⚙️", orden: 2 },
    }),
    prisma.wikiCategory.upsert({
      where:  { slug: "tecnologia" },
      update: {},
      create: { nombre: "Tecnología",           slug: "tecnologia",       icono: "💻", orden: 3 },
    }),
    prisma.wikiCategory.upsert({
      where:  { slug: "administrativa" },
      update: {},
      create: { nombre: "Administrativa",       slug: "administrativa",   icono: "📋", orden: 4 },
    }),
  ]);
  console.log("✅ Categorías wiki:", cats.length);

  // ── Página wiki de ejemplo ────────────────────────────────
  const existePage = await prisma.wikiPage.findUnique({
    where: { slug: "configuracion-geoserver" },
  });
  if (!existePage) {
    await prisma.wikiPage.create({
      data: {
        titulo:      "Configuración de GeoServer",
        slug:        "configuracion-geoserver",
        contenido:   `# Configuración de GeoServer para CTGlobal\n\n## Requisitos previos\n- Java 11 o superior\n- GeoServer 2.24+\n\n## Pasos\n\n### 1. Crear workspace\nMenú: Data → Workspaces → Add new workspace\n\n### 2. Configurar datastore\nConectar al schema de PostgreSQL del proyecto.\n\n### 3. Publicar capas\nPublicar cada tabla espacial como capa WMS.`,
        categoria_id: cats[2].id,
        autor_id:    admin.id,
      },
    });
    console.log("✅ Página wiki creada");
  } else {
    console.log("⏭️  Página wiki ya existe");
  }

  // ── Inventario de equipos CTGlobal ────────────────────────
  // Fuente: Ficha Técnica de Equipos (09-08-2025) + servicios en la nube
  const equipos = [
    {
      nombre:      "Cámara 360° Insta360 X4",
      tipo:        "CAMARA",
      marca:       "Insta360",
      modelo:      "X4",
      serial:      "",
      descripcion: "Cámara de captura inmersiva 360°. Video 8K a 30fps, foto 72MP. Resistente al agua IP68 hasta 10m. Estabilización FlowState. Usada para documentación visual de proyectos, recorridos virtuales y registro de obras.",
      ubicacion:   "Oficina Bogotá",
    },
    {
      nombre:      "Estación de Trabajo - Procesamiento GIS",
      tipo:        "LAPTOP",
      marca:       "Ensamble personalizado",
      modelo:      "Intel i7-14700K / RTX 4070 Ti SUPER",
      serial:      "",
      descripcion: "Estación de trabajo de alto rendimiento para SIG, fotogrametría y modelado 3D. CPU Intel Core i7-14700K, placa Z790 GAMING X AX, 64 GB DDR5 5200 MHz, GPU NVIDIA RTX 4070 Ti SUPER 16 GB, SSD NVMe PCIe 4.0 1 TB. Fuente 850W 80+ Gold.",
      ubicacion:   "Oficina Bogotá",
    },
    {
      nombre:      "Servidor NAS QNAP TS-464",
      tipo:        "SERVIDOR",
      marca:       "QNAP",
      modelo:      "TS-464 (4 bahías)",
      serial:      "",
      descripcion: "Servidor de almacenamiento en red. CPU Intel Celeron N5095 4 núcleos 2.9GHz, 8 GB DDR4, 4 bahías RAID, puertos Gigabit/2.5GbE. Centraliza proyectos fotogramétricos, respaldo de datos críticos y trabajo colaborativo.",
      ubicacion:   "Oficina Bogotá",
    },
    {
      nombre:      "GPS RTK Emlid Reach RS2",
      tipo:        "GPS",
      marca:       "Emlid",
      modelo:      "Reach RS2",
      serial:      "",
      descripcion: "Receptor GNSS multiconstelación (GPS, GLONASS, Galileo, BeiDou) con precisión centimétrica RTK y PPK. Conectividad 4G/Wi-Fi/Bluetooth, autonomía 22h, resistencia IP67. Usado para puntos de control fotogramétrico y georreferenciación.",
      ubicacion:   "Oficina Bogotá",
    },
    {
      nombre:      "VPS Hosdite - Servidor cloud",
      tipo:        "SERVIDOR",
      marca:       "Hosdite",
      modelo:      "Cloud VPS",
      serial:      "VPS-HOSDITE-01",
      descripcion: "Servidor virtual privado en la nube. SO: Ubuntu, RAM: 2 GB, CPU: 2 vCores, Almacenamiento: 50 GB SSD, Ancho de banda: 10 Mbps. Sin panel de control. Usado para despliegue de aplicaciones y geovisores.",
      ubicacion:   "Cloud (remoto)",
      valor_compra: 36000, // COP/mes
    },
    {
      nombre:      "Suscripción Claude AI (Anthropic)",
      tipo:        "LICENCIA",
      marca:       "Anthropic",
      modelo:      "Claude Pro / Max",
      serial:      "",
      descripcion: "Suscripción de IA generativa. Incluye: Claude Code web y terminal, ejecución de código, proyectos ilimitados, Research, integración Google Workspace, conectores MCP, pensamiento extendido y acceso a múltiples modelos (Claude, ChatGPT Plus, Hostinger).",
      ubicacion:   "Digital / Cloud",
    },
  ];

  let creados = 0;
  for (const eq of equipos) {
    // Buscar por nombre exacto para evitar duplicados
    const existe = await prisma.equipment.findFirst({
      where: { nombre: eq.nombre },
    });
    if (!existe) {
      await prisma.equipment.create({ data: eq });
      creados++;
    }
  }
  console.log(`✅ Equipos: ${creados} creados, ${equipos.length - creados} ya existían`);

  // ── Geovisor de ejemplo ───────────────────────────────────
  const geo = await prisma.geoProject.upsert({
    where: { slug: "dos-quebradas" },
    update: {},
    create: {
      nombre:              "Dosquebradas - Estratificación 360°",
      slug:                "dos-quebradas",
      codigo:              "GV-001",
      descripcion:         "Geovisor de estratificación socioeconómica para Dosquebradas, Risaralda.",
      cliente:             "Alcaldía de Dosquebradas",
      url:                 "https://ctglobal.com.co/DOS_QUEBRADAS_ESTRATIFICACION_360/",
      geoserver_url:       "http://200.7.107.14:8080/geoserver",
      geoserver_workspace: "dos_quebradas",
      api_key:             "ctg_live_gv001_dosquebradas",
      activo:              true,
      fecha_inicio:        new Date("2024-06-01"),
      fecha_fin:           new Date("2025-12-31"),
    },
  });
  console.log("✅ Geovisor:", geo.codigo);

  // ── Usuario cliente del geovisor ──────────────────────────
  const existeCliente = await prisma.projectUser.findFirst({
    where: { email: "tecnico@dosquebradas.gov.co", proyecto_id: geo.id },
  });
  if (!existeCliente) {
    await prisma.projectUser.create({
      data: {
        email:       "tecnico@dosquebradas.gov.co",
        nombre:      "Técnico Alcaldía",
        password:    await bcrypt.hash("Cliente2024*", 10),
        proyecto_id: geo.id,
        rol:         "VIEWER",
        expires_at:  new Date("2025-12-31"),
      },
    });
    console.log("✅ Usuario cliente creado");
  } else {
    console.log("⏭️  Usuario cliente ya existe");
  }

  // ── Evento de ejemplo ─────────────────────────────────────
  const existeEvento = await prisma.event.findFirst({
    where: { titulo: "Entrega geovisor Dosquebradas" },
  });
  if (!existeEvento) {
    await prisma.event.create({
      data: {
        titulo:        "Entrega geovisor Dosquebradas",
        descripcion:   "Entrega oficial del geovisor de estratificación a la Alcaldía",
        fecha_inicio:  new Date("2025-07-15"),
        tipo:          "ENTREGA",
        proyecto_id:   geo.id,
        creado_por_id: admin.id,
      },
    });
    console.log("✅ Evento creado");
  } else {
    console.log("⏭️  Evento ya existe");
  }

  console.log("\n✅ Seed completado exitosamente");
  console.log("─────────────────────────────────────────");
  console.log("👤 Admin:  admin@ctglobal.com.co  /  Admin2024*");
  console.log("👤 Editor: jesus@ctglobal.com.co  /  CTGlobal2024*");
  console.log("🖥️  Equipos cargados: 6 (ficha técnica + servicios cloud)");
  console.log("🗺️  GV-001: ctg_live_gv001_dosquebradas");
  console.log("─────────────────────────────────────────");
}

main()
  .catch((e) => { console.error("❌ Error en seed:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());

  // ── Facturas iniciales de servicios ──────────────────────
  // Usar pg directo porque invoice no está en el schema de Prisma todavía
  const { Pool } = require("pg");
  const pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

  const ahora = new Date();
  const mes   = ahora.getMonth() + 1;
  const anio  = ahora.getFullYear();

  // Obtener equipos para vincular facturas
  const { rows: eqs } = await pgPool.query(
    "SELECT id, nombre FROM equipment WHERE nombre LIKE $1 OR nombre LIKE $2",
    ["%VPS%", "%Claude%"]
  );

  const servicios = [
    {
      concepto:    `VPS Hosdite - ${['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes]} ${anio}`,
      tipo:        "SERVICIO_MENSUAL",
      estado:      "PENDIENTE",
      proveedor:   "Hosdite",
      monto:       36000,
      moneda:      "COP",
      fecha_emision: new Date(anio, mes-1, 1).toISOString().split("T")[0],
      fecha_vencimiento: new Date(anio, mes-1, 28).toISOString().split("T")[0],
      periodo_mes: mes,
      periodo_anio: anio,
      equipo_id:   null,
      notas:       "Cloud VPS Ubuntu 2GB RAM / 2CPU / 50GB SSD",
    },
    {
      concepto:    `Suscripción Claude AI - ${['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes]} ${anio}`,
      tipo:        "SERVICIO_MENSUAL",
      estado:      "PENDIENTE",
      proveedor:   "Anthropic",
      monto:       0,
      moneda:      "USD",
      fecha_emision: new Date(anio, mes-1, 1).toISOString().split("T")[0],
      fecha_vencimiento: new Date(anio, mes-1, 28).toISOString().split("T")[0],
      periodo_mes: mes,
      periodo_anio: anio,
      equipo_id:   null,
      notas:       "Actualizar monto según recibo del mes",
    },
  ];

  for (const s of servicios) {
    const { rows: exists } = await pgPool.query(
      "SELECT id FROM invoices WHERE concepto=$1 AND periodo_mes=$2 AND periodo_anio=$3",
      [s.concepto, s.periodo_mes, s.periodo_anio]
    );
    if (!exists.length) {
      await pgPool.query(`
        INSERT INTO invoices
          (concepto,tipo,estado,proveedor,monto,moneda,
           fecha_emision,fecha_vencimiento,periodo_mes,periodo_anio,
           equipo_id,notas,registrado_por_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `, [
        s.concepto, s.tipo, s.estado, s.proveedor, s.monto, s.moneda,
        s.fecha_emision, s.fecha_vencimiento, s.periodo_mes, s.periodo_anio,
        s.equipo_id, s.notas, admin.id,
      ]);
    }
  }
  await pgPool.end();
  console.log("✅ Facturas iniciales de servicios creadas");