const router = require("express").Router();
const prisma = require("../lib/prisma");
const { authMiddleware } = require("../middleware/auth");

// GET /api/sessions/active
router.get("/active", authMiddleware, async (req, res, next) => {
  try {
    const active = await prisma.geoSession.findMany({
      where: { ended_at: null },
      include: {
        project_users: { select: { nombre: true, email: true } },
        geo_projects:  { select: { nombre: true, codigo: true } },
        _count:        { select: { layer_views: true } },
      },
      orderBy: { started_at: "desc" },
    });
    res.json(active.map(({ project_users, geo_projects, _count, ...s }) => ({
      ...s,
      projectUser: project_users || null,
      proyecto:    geo_projects  || null,
      _count:      { layerViews: _count.layer_views },
    })));
  } catch (e) { next(e); }
});

// GET /api/sessions
router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const { proyectoId, limit = 50 } = req.query;
    const sessions = await prisma.geoSession.findMany({
      where: proyectoId ? { proyecto_id: +proyectoId } : {},
      include: {
        project_users: { select: { nombre: true, email: true } },
        geo_projects:  { select: { nombre: true, codigo: true } },
        _count:        { select: { layer_views: true } },
      },
      orderBy: { started_at: "desc" },
      take: +limit,
    });
    res.json(sessions.map(({ project_users, geo_projects, _count, ...s }) => ({
      ...s,
      projectUser: project_users || null,
      proyecto:    geo_projects  || null,
      _count:      { layerViews: _count.layer_views },
    })));
  } catch (e) { next(e); }
});

// GET /api/sessions/:id
router.get("/:id", authMiddleware, async (req, res, next) => {
  try {
    const session = await prisma.geoSession.findUnique({
      where: { id: +req.params.id },
      include: {
        project_users: { select: { nombre: true, email: true } },
        geo_projects:  { select: { nombre: true, codigo: true } },
        layer_views:   { orderBy: { viewed_at: "asc" } },
      },
    });
    if (!session) return res.status(404).json({ error: "Sesión no encontrada" });
    const { project_users, geo_projects, layer_views, ...rest } = session;
    res.json({
      ...rest,
      projectUser: project_users || null,
      proyecto:    geo_projects  || null,
      layerViews:  layer_views,
    });
  } catch (e) { next(e); }
});

module.exports = router;
