const router = require("express").Router();
const prisma = require("../lib/prisma");
const { authMiddleware, editorMiddleware } = require("../middleware/auth");

// ── Recordatorios ────────────────────────────────────────────
const OFFSETS_VALIDOS_MAX = 60 * 24 * 60; // 60 días en minutos

// Normaliza el payload { destinatarios, canalEmail, canalWhatsapp, offsets }
function normalizarRecordatorio(rec, creadorId) {
  if (rec === null) return null; // desactivar explícitamente
  const src = rec || {};
  const destinatarios = Array.isArray(src.destinatarios)
    ? [...new Set(src.destinatarios.map(Number).filter(Boolean))]
    : (rec === undefined ? [creadorId] : []);
  const offsets = Array.isArray(src.offsets)
    ? [...new Set(src.offsets.map(Number).filter(n => Number.isFinite(n) && n > 0 && n <= OFFSETS_VALIDOS_MAX))]
        .sort((a, b) => b - a)
    : (rec === undefined ? [1440] : []);
  return {
    destinatarios,
    canal_email:    rec === undefined ? true : Boolean(src.canalEmail),
    canal_whatsapp: rec === undefined ? true : Boolean(src.canalWhatsapp),
    offsets_min:    offsets,
  };
}

// Offsets cuya hora de disparo (fecha_inicio - offset) ya pasó → se marcan
// como enviados para que no se disparen retroactivamente al guardar.
function offsetsVencidos(fechaInicio, offsets) {
  const now = Date.now();
  const t = new Date(fechaInicio).getTime();
  return offsets.filter(o => t - o * 60000 <= now);
}

function serializarReminder(er) {
  if (!er) return null;
  return {
    destinatarios: er.destinatarios,
    canalEmail:    er.canal_email,
    canalWhatsapp: er.canal_whatsapp,
    offsets:       er.offsets_min,
  };
}

// ── GET /api/events ──────────────────────────────────────────
router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const { proyectoId } = req.query;
    const events = await prisma.event.findMany({
      where: proyectoId ? { proyecto_id: +proyectoId } : {},
      include: {
        users:           { select: { nombre: true, apellido: true } },
        geo_projects:    { select: { nombre: true, codigo: true } },
        event_reminders: true,
      },
      orderBy: { fecha_inicio: "asc" },
    });
    res.json(events.map(({ users, geo_projects, event_reminders, ...e }) => ({
      ...e,
      creado_por_nombre: users        ? `${users.nombre} ${users.apellido}` : null,
      proyecto_nombre:   geo_projects ? geo_projects.nombre : null,
      proyecto_codigo:   geo_projects ? geo_projects.codigo : null,
      recordatorio:      serializarReminder(event_reminders),
    })));
  } catch (e) { next(e); }
});

// ── GET /api/events/:id ─────────────────────────────────────
router.get("/:id", authMiddleware, async (req, res, next) => {
  try {
    const ev = await prisma.event.findUnique({
      where: { id: +req.params.id },
      include: { event_reminders: true },
    });
    if (!ev) return res.status(404).json({ error: "No encontrado" });
    const { event_reminders, ...rest } = ev;
    res.json({ ...rest, recordatorio: serializarReminder(event_reminders) });
  } catch (e) { next(e); }
});

// ── POST /api/events ────────────────────────────────────────
router.post("/", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { titulo, descripcion, fechaInicio, fechaFin, tipo, proyectoId, recordatorio } = req.body;
    if (!titulo || !fechaInicio) return res.status(400).json({ error: "Título y fecha de inicio requeridos" });

    const inicio = new Date(fechaInicio);
    const ev = await prisma.event.create({
      data: {
        titulo,
        descripcion:   descripcion || "",
        fecha_inicio:  inicio,
        fecha_fin:     fechaFin ? new Date(fechaFin) : null,
        tipo:          tipo || "REUNION",
        proyecto_id:   proyectoId ? +proyectoId : null,
        creado_por_id: req.user.id,
      },
    });

    const rec = normalizarRecordatorio(recordatorio, req.user.id);
    if (rec && (rec.destinatarios.length && rec.offsets_min.length && (rec.canal_email || rec.canal_whatsapp))) {
      await prisma.eventReminder.create({
        data: {
          event_id:     ev.id,
          ...rec,
          enviados_min: offsetsVencidos(inicio, rec.offsets_min),
        },
      });
    }

    const full = await prisma.event.findUnique({
      where: { id: ev.id }, include: { event_reminders: true },
    });
    res.status(201).json({ ...full, recordatorio: serializarReminder(full.event_reminders) });
  } catch (e) { next(e); }
});

// ── PUT /api/events/:id ─────────────────────────────────────
router.put("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const id = +req.params.id;
    const { titulo, descripcion, fechaInicio, fechaFin, tipo, proyectoId, recordatorio } = req.body;

    const actual = await prisma.event.findUnique({
      where: { id }, include: { event_reminders: true },
    });
    if (!actual) return res.status(404).json({ error: "No encontrado" });

    const data = {};
    if (titulo      !== undefined) data.titulo       = titulo;
    if (descripcion !== undefined) data.descripcion  = descripcion || "";
    if (fechaInicio !== undefined) data.fecha_inicio = new Date(fechaInicio);
    if (fechaFin    !== undefined) data.fecha_fin    = fechaFin ? new Date(fechaFin) : null;
    if (tipo        !== undefined) data.tipo         = tipo;
    if (proyectoId  !== undefined) data.proyecto_id  = proyectoId ? +proyectoId : null;

    const ev = await prisma.event.update({ where: { id }, data });

    // Recordatorio: si viene en el payload, se actualiza; si no, se deja igual.
    if (recordatorio !== undefined) {
      const rec = normalizarRecordatorio(recordatorio, actual.creado_por_id || req.user.id);
      const activo = rec && rec.destinatarios.length && rec.offsets_min.length && (rec.canal_email || rec.canal_whatsapp);

      if (!activo) {
        if (actual.event_reminders) await prisma.eventReminder.delete({ where: { event_id: id } });
      } else {
        const yaEnviados = actual.event_reminders?.enviados_min || [];
        // Conserva los ya enviados que sigan configurados + marca los nuevos ya vencidos
        const enviados = [...new Set([
          ...yaEnviados.filter(o => rec.offsets_min.includes(o)),
          ...offsetsVencidos(ev.fecha_inicio, rec.offsets_min),
        ])];
        await prisma.eventReminder.upsert({
          where:  { event_id: id },
          create: { event_id: id, ...rec, enviados_min: enviados },
          update: { ...rec, enviados_min: { set: enviados }, updated_at: new Date() },
        });
      }
    }

    const full = await prisma.event.findUnique({
      where: { id }, include: { event_reminders: true },
    });
    res.json({ ...full, recordatorio: serializarReminder(full.event_reminders) });
  } catch (e) { next(e); }
});

// ── DELETE /api/events/:id ──────────────────────────────────
router.delete("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    await prisma.event.delete({ where: { id: +req.params.id } }); // cascade borra event_reminders
    res.json({ message: "Eliminado" });
  } catch (e) { next(e); }
});

module.exports = router;
