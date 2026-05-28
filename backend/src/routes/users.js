const router = require("express").Router();
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

const VALID_ROLES = [
  "ADMIN", "EDITOR", "EMPLEADO",
  "CONTRATISTA", "CONTABILIDAD", "SUPERVISION", "TESORERIA",
];

// Lo que viaja al frontend. Incluye los campos administrados por Trámites
// (banco, numero_cuenta_banco, tipo_cuenta, contrato_referencia, proyecto_default,
// firma_archivo) en SOLO LECTURA: aquí no se editan, se exhiben.
const SAFE_SELECT = {
  id: true, nombre: true, apellido: true, email: true, cargo: true,
  area: true, telefono: true, avatar: true, rol: true, created_at: true,
  cedula: true, direccion: true, telefono_whatsapp: true,
  tarjeta_profesional: true, es_persona_juridica: true,
  banco: true, numero_cuenta_banco: true, tipo_cuenta: true,
  contrato_referencia: true, proyecto_default: true, firma_archivo: true,
};

const normalizeRol = (r) => String(r || "").toUpperCase();

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
    const {
      nombre, apellido, email, password, cargo, area, telefono, rol,
      cedula, direccion, telefono_whatsapp, tarjeta_profesional,
      es_persona_juridica,
    } = req.body;

    if (!email) return res.status(400).json({ error: "Email requerido" });

    const rolFinal = normalizeRol(rol) || "EMPLEADO";
    if (!VALID_ROLES.includes(rolFinal))
      return res.status(400).json({ error: "Rol inválido" });

    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) return res.status(400).json({ error: "Email ya registrado" });

    const user = await prisma.user.create({
      data: {
        nombre, apellido,
        email: email.toLowerCase(),
        password: await bcrypt.hash(password || "CTGlobal2024*", 10),
        cargo: cargo || "", area: area || "", telefono: telefono || "",
        rol: rolFinal,
        cedula: cedula || "",
        direccion: direccion || "",
        telefono_whatsapp: telefono_whatsapp || "",
        tarjeta_profesional: tarjeta_profesional || "",
        es_persona_juridica:
          typeof es_persona_juridica === "boolean" ? es_persona_juridica : null,
      },
      select: SAFE_SELECT,
    });
    res.status(201).json(user);
  } catch (e) { next(e); }
});

router.put("/:id", authMiddleware, async (req, res, next) => {
  try {
    const uid = +req.params.id;
    const isAdmin = req.user.rol === "ADMIN";
    const isSelf = req.user.id === uid;
    if (!isSelf && !isAdmin)
      return res.status(403).json({ error: "Sin permisos" });

    const data = {};

    // Cualquiera (sí mismo o admin) puede editar estos campos básicos.
    // telefono_whatsapp se incluye aquí porque cualquier usuario debe poder
    // configurar su propio número para recibir recordatorios.
    for (const f of ["nombre", "apellido", "cargo", "area", "telefono", "telefono_whatsapp"]) {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    }

    // Solo admin: rol y datos personales del contratista (cédula, dirección,
    // tarjeta profesional, persona jurídica). Banco, cuenta, tipo_cuenta,
    // contrato_referencia, proyecto_default, firma_archivo se administran
    // desde el panel de Trámites; aquí no se aceptan.
    if (isAdmin) {
      if (req.body.rol !== undefined) {
        const rolFinal = normalizeRol(req.body.rol);
        if (!VALID_ROLES.includes(rolFinal))
          return res.status(400).json({ error: "Rol inválido" });
        data.rol = rolFinal;
      }
      for (const f of ["cedula", "direccion", "tarjeta_profesional"]) {
        if (req.body[f] !== undefined) data[f] = req.body[f];
      }
      if (req.body.es_persona_juridica !== undefined) {
        const v = req.body.es_persona_juridica;
        data.es_persona_juridica = v === null ? null : Boolean(v);
      }
    }

    const user = await prisma.user.update({
      where: { id: uid },
      data,
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
