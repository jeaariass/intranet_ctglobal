const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { authMiddleware } = require("../middleware/auth");

const SECRET  = process.env.JWT_SECRET    || "secret_dev";
const EXPIRES = process.env.JWT_EXPIRES_IN || "8h";

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email y contraseña requeridos" });

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), activo: true },
    });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: "Credenciales incorrectas" });

    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
      SECRET, { expiresIn: EXPIRES }
    );
    const { password: _, ...safe } = user;
    res.json({ token, user: safe });
  } catch (e) { next(e); }
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, nombre: true, apellido: true, email: true,
        cargo: true, area: true, telefono: true, avatar: true,
        rol: true, created_at: true,
      },
    });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(user);
  } catch (e) { next(e); }
});

// POST /api/auth/change-password
router.post("/change-password", authMiddleware, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(currentPassword, user.password)))
      return res.status(400).json({ error: "Contraseña actual incorrecta" });
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: await bcrypt.hash(newPassword, 10) },
    });
    res.json({ message: "Contraseña actualizada" });
  } catch (e) { next(e); }
});

module.exports = router;
