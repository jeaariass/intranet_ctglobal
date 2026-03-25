const router = require("express").Router();
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

const SAFE_SELECT = {
  id:true, nombre:true, apellido:true, email:true, cargo:true,
  area:true, telefono:true, avatar:true, rol:true, created_at:true,
};

router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { activo: true },
      select: SAFE_SELECT,
      orderBy: { nombre: "asc" },
    });
    res.json(users);
  } catch (e) { next(e); }
});

router.get("/:id", authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: +req.params.id, activo: true },
      select: SAFE_SELECT,
    });
    if (!user) return res.status(404).json({ error: "No encontrado" });
    res.json(user);
  } catch (e) { next(e); }
});

router.post("/", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const { nombre, apellido, email, password, cargo, area, telefono, rol } = req.body;
    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) return res.status(400).json({ error: "Email ya registrado" });
    const user = await prisma.user.create({
      data: {
        nombre, apellido,
        email: email.toLowerCase(),
        password: await bcrypt.hash(password || "CTGlobal2024*", 10),
        cargo: cargo || "", area: area || "", telefono: telefono || "",
        rol: rol || "EMPLEADO",
      },
      select: SAFE_SELECT,
    });
    res.status(201).json(user);
  } catch (e) { next(e); }
});

router.put("/:id", authMiddleware, async (req, res, next) => {
  try {
    const uid = +req.params.id;
    if (req.user.id !== uid && req.user.rol !== "ADMIN")
      return res.status(403).json({ error: "Sin permisos" });
    const { nombre, apellido, cargo, area, telefono } = req.body;
    const user = await prisma.user.update({
      where: { id: uid },
      data: { nombre, apellido, cargo, area, telefono },
      select: SAFE_SELECT,
    });
    res.json(user);
  } catch (e) { next(e); }
});

router.delete("/:id", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: +req.params.id }, data: { activo: false } });
    res.json({ message: "Usuario desactivado" });
  } catch (e) { next(e); }
});

module.exports = router;
