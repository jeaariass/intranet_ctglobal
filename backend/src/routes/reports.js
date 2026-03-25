const router = require("express").Router();
const prisma = require("../lib/prisma");
const { authMiddleware } = require("../middleware/auth");

// GET /api/reports/dashboard
router.get("/dashboard", authMiddleware, async (req, res, next) => {
  try {
    const [totalUsers, totalProjects, activeProjects, totalDocs,
           totalEquipment, availableEquipment, activeSessionsCount,
           recentSessions] = await Promise.all([
      prisma.user.count({ where: { activo: true } }),
      prisma.geoProject.count(),
      prisma.geoProject.count({ where: { activo: true } }),
      prisma.document.count(),
      prisma.equipment.count({ where: { estado: { not: "DADO_DE_BAJA" } } }),
      prisma.equipment.count({ where: { estado: "DISPONIBLE" } }),
      prisma.geoSession.count({ where: { ended_at: null } }),
      prisma.geoSession.findMany({
        where: { ended_at: null },
        include: {
          project_users: { select: { nombre: true } },
          geo_projects:  { select: { nombre: true, codigo: true } },
        },
        orderBy: { started_at: "desc" },
        take: 5,
      }),
    ]);

    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);

    const [upcomingEvents, expiringProjects, equipmentAlerts] = await Promise.all([
      prisma.event.findMany({
        where: { fecha_inicio: { gte: new Date(), lte: in30 } },
        include: { geo_projects: { select: { nombre: true, codigo: true } } },
        orderBy: { fecha_inicio: "asc" },
        take: 5,
      }),
      prisma.geoProject.findMany({
        where: { fecha_fin: { gte: new Date(), lte: in30 }, activo: true },
        orderBy: { fecha_fin: "asc" },
      }),
      prisma.equipment.findMany({
        where: { proximo_mantenimiento: { lte: in30 }, estado: { not: "DADO_DE_BAJA" } },
        orderBy: { proximo_mantenimiento: "asc" },
        take: 5,
      }),
    ]);

    res.json({
      stats: { totalUsers, totalProjects, activeProjects, totalDocs,
               totalEquipment, availableEquipment, activeSessionsCount },
      recentSessions: recentSessions.map(({ project_users, geo_projects, ...s }) => ({
        ...s,
        projectUser: project_users || null,
        proyecto:    geo_projects  || null,
      })),
      upcomingEvents: upcomingEvents.map(({ geo_projects, ...e }) => ({
        ...e, proyecto: geo_projects || null,
      })),
      expiringProjects,
      equipmentAlerts,
    });
  } catch (e) { next(e); }
});

// GET /api/reports/geovisor/:id
router.get("/geovisor/:id", authMiddleware, async (req, res, next) => {
  try {
    const pid = +req.params.id;
    const { desde, hasta } = req.query;
    const dateFilter = {};
    if (desde) dateFilter.gte = new Date(desde);
    if (hasta) dateFilter.lte = new Date(hasta);
    const where = { proyecto_id: pid };
    if (Object.keys(dateFilter).length) where.started_at = dateFilter;

    const [sessions, project] = await Promise.all([
      prisma.geoSession.findMany({
        where,
        include: {
          project_users: { select: { nombre: true, email: true } },
          layer_views:   true,
        },
      }),
      prisma.geoProject.findUnique({ where: { id: pid } }),
    ]);
    if (!project) return res.status(404).json({ error: "Proyecto no encontrado" });

    const totalSessions   = sessions.length;
    const completed       = sessions.filter(s => s.duracion_seg);
    const avgDuration     = completed.length
      ? Math.round(completed.reduce((a, s) => a + s.duracion_seg, 0) / completed.length)
      : 0;

    const layerCounts = {};
    sessions.forEach(s => s.layer_views.forEach(lv => {
      layerCounts[lv.layer_name] = layerCounts[lv.layer_name] || { count: 0, title: lv.layer_title };
      layerCounts[lv.layer_name].count++;
    }));

    const topLayers = Object.entries(layerCounts)
      .map(([name, v]) => ({ name, title: v.title, count: v.count }))
      .sort((a, b) => b.count - a.count).slice(0, 10);

    const sessionsByDay = {};
    sessions.forEach(s => {
      const day = new Date(s.started_at).toISOString().split("T")[0];
      sessionsByDay[day] = (sessionsByDay[day] || 0) + 1;
    });

    res.json({
      project,
      metrics: {
        totalSessions,
        uniqueUsers:      [...new Set(sessions.map(s => s.project_user_id))].length,
        uniqueIps:        [...new Set(sessions.map(s => s.ip).filter(Boolean))].length,
        avgDurationSeg:   avgDuration,
        avgDurationMin:   Math.round(avgDuration / 60),
        totalLayerViews:  sessions.reduce((a, s) => a + s.layer_views.length, 0),
      },
      topLayers,
      sessionsByDay,
    });
  } catch (e) { next(e); }
});

// GET /api/reports/equipment
router.get("/equipment", authMiddleware, async (req, res, next) => {
  try {
    const [byEstado, byTipo, recentLogs] = await Promise.all([
      prisma.equipment.groupBy({ by: ["estado"], _count: { id: true } }),
      prisma.equipment.groupBy({ by: ["tipo"],   _count: { id: true } }),
      prisma.equipmentLog.findMany({
        orderBy: { fecha_inicio: "desc" },
        take: 10,
        include: {
          equipment:    { select: { nombre: true, tipo: true } },
          geo_projects: { select: { nombre: true, codigo: true } },
          users:        { select: { nombre: true } },
        },
      }),
    ]);
    res.json({
      byEstado,
      byTipo,
      recentLogs: recentLogs.map(({ equipment: eq, geo_projects, users: u, ...l }) => ({
        ...l,
        equipo:   eq || null,
        proyecto: geo_projects || null,
        usuario:  u  || null,
      })),
    });
  } catch (e) { next(e); }
});

// GET /api/reports/overview
router.get("/overview", authMiddleware, async (req, res, next) => {
  try {
    const projects = await prisma.geoProject.findMany({
      include: { _count: { select: { geo_sessions: true, project_users: true } } },
      orderBy: { created_at: "desc" },
    });

    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);

    const sessionStats = await prisma.geoSession.groupBy({
      by: ["proyecto_id"],
      where: { started_at: { gte: hace30 } },
      _count: { id: true },
      _avg:   { duracion_seg: true },
    });

    const statsMap = {};
    sessionStats.forEach(s => {
      statsMap[s.proyecto_id] = {
        sesiones30d: s._count.id,
        avgDurMin:   Math.round((s._avg.duracion_seg || 0) / 60),
      };
    });

    res.json(projects.map(({ _count, ...p }) => ({
      ...p,
      _count:    { projectUsers: _count.project_users, sessions: _count.geo_sessions },
      stats30d:  statsMap[p.id] || { sesiones30d: 0, avgDurMin: 0 },
    })));
  } catch (e) { next(e); }
});

module.exports = router;
