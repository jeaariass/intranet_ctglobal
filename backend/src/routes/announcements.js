const router = require("express").Router();
const prisma = require("../lib/prisma");
const { authMiddleware, editorMiddleware } = require("../middleware/auth");

router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const items = await prisma.announcement.findMany({
      where: { activo: true },
      include: { users: { select: { nombre: true, apellido: true } } },
      orderBy: { created_at: "desc" },
      take: 50,
    });
    // Renombrar 'users' → 'autor' para el frontend
    res.json(items.map(({ users, ...a }) => ({ ...a, autor_nombre: users ? `${users.nombre} ${users.apellido}` : null })));
  } catch (e) { next(e); }
});

router.post("/", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { titulo, contenido, tipo, prioridad } = req.body;
    const item = await prisma.announcement.create({
      data: {
        titulo, contenido,
        tipo:      tipo      || "GENERAL",
        prioridad: prioridad || "NORMAL",
        autor_id:  req.user.id,
      },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

router.delete("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    await prisma.announcement.update({
      where: { id: +req.params.id },
      data: { activo: false },
    });
    res.json({ message: "Eliminado" });
  } catch (e) { next(e); }
});

module.exports = router;
