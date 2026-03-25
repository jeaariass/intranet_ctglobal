const router = require("express").Router();
const prisma = require("../lib/prisma");
const { authMiddleware, editorMiddleware } = require("../middleware/auth");

router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const { proyectoId } = req.query;
    const events = await prisma.event.findMany({
      where: proyectoId ? { proyecto_id: +proyectoId } : {},
      include: {
        users:        { select: { nombre: true, apellido: true } },
        geo_projects: { select: { nombre: true, codigo: true } },
      },
      orderBy: { fecha_inicio: "asc" },
    });
    res.json(events.map(({ users, geo_projects, ...e }) => ({
      ...e,
      creado_por_nombre: users        ? `${users.nombre} ${users.apellido}` : null,
      proyecto_nombre:   geo_projects ? geo_projects.nombre : null,
      proyecto_codigo:   geo_projects ? geo_projects.codigo : null,
    })));
  } catch (e) { next(e); }
});

router.post("/", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { titulo, descripcion, fechaInicio, fechaFin, tipo, proyectoId } = req.body;
    const ev = await prisma.event.create({
      data: {
        titulo,
        descripcion:   descripcion || "",
        fecha_inicio:  new Date(fechaInicio),
        fecha_fin:     fechaFin ? new Date(fechaFin) : null,
        tipo:          tipo || "REUNION",
        proyecto_id:   proyectoId ? +proyectoId : null,
        creado_por_id: req.user.id,
      },
    });
    res.status(201).json(ev);
  } catch (e) { next(e); }
});

router.delete("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    await prisma.event.delete({ where: { id: +req.params.id } });
    res.json({ message: "Eliminado" });
  } catch (e) { next(e); }
});

module.exports = router;
