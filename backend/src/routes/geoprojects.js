const router = require("express").Router();
const prisma = require("../lib/prisma");
const { authMiddleware, adminMiddleware, editorMiddleware } = require("../middleware/auth");

function generateApiKey(slug) {
  return `ctg_live_${slug.replace(/-/g,"_")}_${Math.random().toString(36).slice(2,10)}`;
}

async function generateCodigo() {
  const last = await prisma.geoProject.findFirst({ orderBy: { id: "desc" } });
  return `GV-${String((last?.id || 0) + 1).padStart(3, "0")}`;
}

// GET /api/geoprojects
router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const projects = await prisma.geoProject.findMany({
      include: {
        _count: { select: { project_users: true, geo_sessions: true } },
      },
      orderBy: { created_at: "desc" },
    });
    res.json(projects.map(({ _count, ...p }) => ({
      ...p,
      _count: { projectUsers: _count.project_users, sessions: _count.geo_sessions },
    })));
  } catch (e) { next(e); }
});

// GET /api/geoprojects/:id
router.get("/:id", authMiddleware, async (req, res, next) => {
  try {
    const p = await prisma.geoProject.findUnique({
      where: { id: +req.params.id },
      include: {
        project_users: { orderBy: { created_at: "desc" } },
        documents: {
          include: { users: { select: { nombre: true } } },
          orderBy: { created_at: "desc" },
          take: 10,
        },
        events:    { orderBy: { fecha_inicio: "asc" }, take: 5 },
        equipment: { select: { id:true, nombre:true, tipo:true, estado:true } },
        _count:    { select: { geo_sessions: true, project_users: true } },
      },
    });
    if (!p) return res.status(404).json({ error: "Proyecto no encontrado" });

    const { _count, project_users, ...rest } = p;
    res.json({
      ...rest,
      projectUsers: project_users,
      _count: { sessions: _count.geo_sessions, projectUsers: _count.project_users },
    });
  } catch (e) { next(e); }
});

// POST /api/geoprojects
router.post("/", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { nombre, descripcion, cliente, url, geoserverUrl, geoserverWorkspace, fechaInicio, fechaFin } = req.body;
    const slug = nombre.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"").substring(0,50);
    const project = await prisma.geoProject.create({
      data: {
        nombre, slug,
        codigo:               await generateCodigo(),
        api_key:              generateApiKey(slug),
        descripcion:          descripcion         || "",
        cliente:              cliente             || "",
        url:                  url                 || "",
        geoserver_url:        geoserverUrl        || "",
        geoserver_workspace:  geoserverWorkspace  || "",
        fecha_inicio:         fechaInicio ? new Date(fechaInicio) : null,
        fecha_fin:            fechaFin    ? new Date(fechaFin)    : null,
      },
    });
    res.status(201).json(project);
  } catch (e) { next(e); }
});

// PUT /api/geoprojects/:id
router.put("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { nombre, descripcion, cliente, url, geoserverUrl, geoserverWorkspace, activo, fechaInicio, fechaFin } = req.body;
    const project = await prisma.geoProject.update({
      where: { id: +req.params.id },
      data: {
        nombre, descripcion, cliente, url,
        geoserver_url:       geoserverUrl       || undefined,
        geoserver_workspace: geoserverWorkspace || undefined,
        activo:              activo !== undefined ? activo : undefined,
        fecha_inicio:        fechaInicio ? new Date(fechaInicio) : undefined,
        fecha_fin:           fechaFin    ? new Date(fechaFin)    : undefined,
      },
    });
    res.json(project);
  } catch (e) { next(e); }
});

// PATCH /api/geoprojects/:id/toggle
router.patch("/:id/toggle", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const current = await prisma.geoProject.findUnique({ where: { id: +req.params.id } });
    const project = await prisma.geoProject.update({
      where: { id: +req.params.id },
      data:  { activo: !current.activo },
    });
    res.json({ activo: project.activo, message: project.activo ? "Activado" : "Pausado" });
  } catch (e) { next(e); }
});

// POST /api/geoprojects/:id/regenerate-key
router.post("/:id/regenerate-key", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const p      = await prisma.geoProject.findUnique({ where: { id: +req.params.id } });
    const newKey = generateApiKey(p.slug);
    await prisma.geoProject.update({ where: { id: +req.params.id }, data: { api_key: newKey } });
    res.json({ apiKey: newKey });
  } catch (e) { next(e); }
});

// GET /api/geoprojects/:id/users
router.get("/:id/users", authMiddleware, async (req, res, next) => {
  try {
    const users = await prisma.projectUser.findMany({
      where: { proyecto_id: +req.params.id },
      orderBy: { created_at: "desc" },
    });
    res.json(users.map(({ password, ...u }) => u));
  } catch (e) { next(e); }
});

// POST /api/geoprojects/:id/users
router.post("/:id/users", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const bcrypt = require("bcryptjs");
    const { email, nombre, password, rol, expiresAt } = req.body;
    const exists = await prisma.projectUser.findFirst({
      where: { email: email.toLowerCase(), proyecto_id: +req.params.id },
    });
    if (exists) return res.status(400).json({ error: "Usuario ya tiene acceso a este proyecto" });
    const pu = await prisma.projectUser.create({
      data: {
        email:       email.toLowerCase(),
        nombre,
        password:    await bcrypt.hash(password || "Acceso2024*", 10),
        proyecto_id: +req.params.id,
        rol:         rol || "VIEWER",
        expires_at:  expiresAt ? new Date(expiresAt) : null,
      },
    });
    const { password: _, ...safe } = pu;
    res.status(201).json(safe);
  } catch (e) { next(e); }
});

// PATCH /api/geoprojects/:id/users/:uid/toggle
router.patch("/:id/users/:uid/toggle", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const pu = await prisma.projectUser.findUnique({ where: { id: +req.params.uid } });
    const updated = await prisma.projectUser.update({
      where: { id: +req.params.uid },
      data:  { activo: !pu.activo },
    });
    res.json({ activo: updated.activo });
  } catch (e) { next(e); }
});

// DELETE /api/geoprojects/:id/users/:uid
router.delete("/:id/users/:uid", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    await prisma.projectUser.delete({ where: { id: +req.params.uid } });
    res.json({ message: "Usuario eliminado del proyecto" });
  } catch (e) { next(e); }
});

module.exports = router;