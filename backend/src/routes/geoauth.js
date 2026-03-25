const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const prisma  = require("../lib/prisma");

const SECRET = process.env.JWT_SECRET || "secret_dev";

async function geoApiKeyMiddleware(req, res, next) {
  const apiKey  = req.headers["x-api-key"];
  if (!apiKey) return res.status(401).json({ error: "API key requerida" });
  const project = await prisma.geoProject.findFirst({ where: { api_key: apiKey, activo: true } });
  if (!project)  return res.status(403).json({ error: "API key inválida o proyecto pausado" });
  if (project.fecha_fin && project.fecha_fin < new Date())
    return res.status(403).json({ error: "El contrato de este proyecto ha vencido" });
  req.project = project;
  next();
}

// POST /api/geoauth/login
router.post("/login", geoApiKeyMiddleware, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email y contraseña requeridos" });

    const pu = await prisma.projectUser.findFirst({
      where: { email: email.toLowerCase(), proyecto_id: req.project.id, activo: true },
    });
    if (!pu || !(await bcrypt.compare(password, pu.password)))
      return res.status(401).json({ error: "Credenciales incorrectas" });
    if (pu.expires_at && pu.expires_at < new Date())
      return res.status(403).json({ error: "Tu acceso a este proyecto ha expirado" });

    const ip        = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
    const userAgent = req.headers["user-agent"] || "";

    const session = await prisma.geoSession.create({
      data: {
        project_user_id: pu.id,
        proyecto_id:     req.project.id,
        ip,
        user_agent:      userAgent,
      },
    });

    const token = jwt.sign(
      { sessionId: session.id, userId: pu.id, proyectoId: req.project.id,
        nombre: pu.nombre, email: pu.email, rol: pu.rol },
      SECRET, { expiresIn: "1d" }
    );

    res.json({
      token,
      sessionId: session.id,
      user:    { nombre: pu.nombre, email: pu.email, rol: pu.rol },
      project: { nombre: req.project.nombre, geoserver_url: req.project.geoserver_url,
                 geoserver_workspace: req.project.geoserver_workspace },
    });
  } catch (e) { next(e); }
});

// POST /api/geoauth/layer-view
router.post("/layer-view", async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) return res.json({ ok: false });
    const decoded = jwt.verify(token, SECRET);
    await prisma.layerView.create({
      data: {
        session_id:  decoded.sessionId,
        layer_name:  req.body.layerName  || "",
        layer_title: req.body.layerTitle || "",
      },
    });
    res.json({ ok: true });
  } catch { res.json({ ok: false }); }
});

// POST /api/geoauth/session-end
router.post("/session-end", async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) return res.json({ ok: false });
    const decoded = jwt.verify(token, SECRET);
    const session = await prisma.geoSession.findUnique({ where: { id: decoded.sessionId } });
    if (session && !session.ended_at) {
      const duracion = Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000);
      await prisma.geoSession.update({
        where: { id: session.id },
        data:  { ended_at: new Date(), duracion_seg: duracion },
      });
    }
    res.json({ ok: true });
  } catch { res.json({ ok: false }); }
});

// GET /api/geoauth/verify
router.get("/verify", async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) return res.status(401).json({ valid: false });
    const decoded = jwt.verify(token, SECRET);
    const project = await prisma.geoProject.findFirst({ where: { id: decoded.proyectoId, activo: true } });
    if (!project) return res.status(403).json({ valid: false, error: "Proyecto pausado" });
    const pu = await prisma.projectUser.findFirst({ where: { id: decoded.userId, activo: true } });
    if (!pu) return res.status(403).json({ valid: false, error: "Acceso revocado" });
    if (pu.expires_at && pu.expires_at < new Date())
      return res.status(403).json({ valid: false, error: "Acceso expirado" });
    res.json({ valid: true, user: { nombre: pu.nombre, rol: pu.rol } });
  } catch { res.status(401).json({ valid: false }); }
});

module.exports = router;
