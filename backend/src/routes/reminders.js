// backend/src/routes/reminders.js
// CRUD de recordatorios. Crear/editar/borrar/pausar/reanudar/testear envío.
//
// Permisos:
//   - GET (listar, ver, logs)      → cualquier usuario autenticado
//   - POST/PUT/PATCH/DELETE        → ADMIN o EDITOR
//   - POST /:id/test               → ADMIN o EDITOR (fuerza un envío inmediato)

const router = require("express").Router();
const prisma = require("../lib/prisma");
const { authMiddleware, editorMiddleware } = require("../middleware/auth");
const { calcularProximoInicial, _procesar } = require("../lib/reminderScheduler");
const { estadoWhatsApp } = require("../lib/whatsappClient");

const TIPOS_VALIDOS = ["PAGO", "ENTREGA", "DOCUMENTO", "REUNION", "GENERAL"];
const FRECS_VALIDAS = ["UNICA", "DIARIA", "SEMANAL", "MENSUAL", "CADA_N_DIAS"];

// ── Helpers ──────────────────────────────────────────────────

function validarPayload(d, esCreate = true) {
  const errores = [];
  if (esCreate || d.titulo !== undefined) {
    if (!d.titulo || !d.titulo.trim()) errores.push("titulo requerido");
  }
  if (esCreate || d.mensaje !== undefined) {
    if (!d.mensaje || !d.mensaje.trim()) errores.push("mensaje requerido");
    else if (d.mensaje.length > 4000)   errores.push("mensaje excede 4000 caracteres");
  }
  if (d.tipo !== undefined && !TIPOS_VALIDOS.includes(d.tipo)) {
    errores.push(`tipo inválido (válidos: ${TIPOS_VALIDOS.join(",")})`);
  }
  if (esCreate || d.frecuencia !== undefined) {
    if (!FRECS_VALIDAS.includes(d.frecuencia)) {
      errores.push(`frecuencia inválida (válidas: ${FRECS_VALIDAS.join(",")})`);
    }
  }
  if (d.frecuencia === "CADA_N_DIAS") {
    if (!d.intervalo_dias || d.intervalo_dias < 1) errores.push("intervalo_dias requerido (>=1) para CADA_N_DIAS");
  }
  if (d.frecuencia === "SEMANAL") {
    if (d.dia_semana == null || d.dia_semana < 0 || d.dia_semana > 6) errores.push("dia_semana 0-6 requerido para SEMANAL");
  }
  if (d.frecuencia === "MENSUAL") {
    if (!d.dia_mes || d.dia_mes < 1 || d.dia_mes > 31) errores.push("dia_mes 1-31 requerido para MENSUAL");
  }
  if (d.hora !== undefined && !/^\d{2}:\d{2}$/.test(d.hora)) {
    errores.push("hora debe tener formato HH:MM");
  }
  if (esCreate) {
    if (!d.fecha_inicio) errores.push("fecha_inicio requerida");
    if (!d.destinatario_id && !d.telefono_manual?.trim()) {
      errores.push("destinatario_id o telefono_manual requerido");
    }
  }
  return errores;
}

function serializar(r) {
  return {
    ...r,
    destinatario: r.destinatario
      ? {
          id: r.destinatario.id,
          nombre: r.destinatario.nombre,
          apellido: r.destinatario.apellido,
          email: r.destinatario.email,
          telefono_whatsapp: r.destinatario.telefono_whatsapp,
        }
      : null,
    creado_por: r.creado_por
      ? { id: r.creado_por.id, nombre: r.creado_por.nombre, apellido: r.creado_por.apellido }
      : null,
  };
}

// ── GET /api/reminders/whatsapp-status ───────────────────────
// Estado de la conexión de WhatsApp en T_INTRANET, para mostrar un aviso
// en el módulo de Recordatorios si está caída.
router.get("/whatsapp-status", authMiddleware, async (req, res, next) => {
  try {
    res.json(await estadoWhatsApp());
  } catch (e) { next(e); }
});

// ── GET /api/reminders ───────────────────────────────────────
// Filtros: ?tipo=PAGO&activo=true&destinatarioId=5
router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const { tipo, activo, destinatarioId, q } = req.query;
    const where = {};
    if (tipo)           where.tipo = tipo;
    if (activo === "true")  where.activo = true;
    if (activo === "false") where.activo = false;
    if (destinatarioId) where.destinatario_id = +destinatarioId;
    if (q)              where.titulo = { contains: q, mode: "insensitive" };

    const items = await prisma.reminder.findMany({
      where,
      include: {
        destinatario: { select: { id: true, nombre: true, apellido: true, email: true, telefono_whatsapp: true } },
        creado_por:   { select: { id: true, nombre: true, apellido: true } },
        _count:       { select: { logs: true } },
      },
      orderBy: { created_at: "desc" },
    });
    res.json(items.map(serializar));
  } catch (e) { next(e); }
});

// ── GET /api/reminders/:id ───────────────────────────────────
router.get("/:id", authMiddleware, async (req, res, next) => {
  try {
    const r = await prisma.reminder.findUnique({
      where: { id: +req.params.id },
      include: {
        destinatario: { select: { id: true, nombre: true, apellido: true, email: true, telefono_whatsapp: true } },
        creado_por:   { select: { id: true, nombre: true, apellido: true } },
      },
    });
    if (!r) return res.status(404).json({ error: "Recordatorio no encontrado" });
    res.json(serializar(r));
  } catch (e) { next(e); }
});

// ── GET /api/reminders/:id/logs ──────────────────────────────
router.get("/:id/logs", authMiddleware, async (req, res, next) => {
  try {
    const logs = await prisma.reminderLog.findMany({
      where: { reminder_id: +req.params.id },
      orderBy: { enviado_at: "desc" },
      take: 100,
    });
    res.json(logs);
  } catch (e) { next(e); }
});

// ── POST /api/reminders ──────────────────────────────────────
router.post("/", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const d = req.body || {};
    const errores = validarPayload(d, true);
    if (errores.length) return res.status(400).json({ error: errores.join(" | ") });

    // Datos limpios
    const reminderData = {
      titulo:          d.titulo.trim(),
      mensaje:         d.mensaje.trim(),
      tipo:            d.tipo || "GENERAL",
      destinatario_id: d.destinatario_id ? +d.destinatario_id : null,
      telefono_manual: (d.telefono_manual || "").trim(),
      frecuencia:      d.frecuencia,
      intervalo_dias:  d.frecuencia === "CADA_N_DIAS" ? +d.intervalo_dias : null,
      dia_semana:      d.frecuencia === "SEMANAL"     ? +d.dia_semana    : null,
      dia_mes:         d.frecuencia === "MENSUAL"     ? +d.dia_mes       : null,
      hora:            d.hora || "09:00",
      fecha_inicio:    new Date(d.fecha_inicio),
      fecha_caducidad: d.fecha_caducidad ? new Date(d.fecha_caducidad) : null,
      activo:          true,
      pausado:         false,
      creado_por_id:   req.user.id,
      proximo_envio:   new Date(), // placeholder, reemplazado abajo
    };

    reminderData.proximo_envio = calcularProximoInicial({ ...reminderData });

    const created = await prisma.reminder.create({
      data: reminderData,
      include: {
        destinatario: { select: { id: true, nombre: true, apellido: true, email: true, telefono_whatsapp: true } },
        creado_por:   { select: { id: true, nombre: true, apellido: true } },
      },
    });
    res.status(201).json(serializar(created));
  } catch (e) { next(e); }
});

// ── PUT /api/reminders/:id ───────────────────────────────────
router.put("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const d = req.body || {};
    const existing = await prisma.reminder.findUnique({ where: { id: +req.params.id } });
    if (!existing) return res.status(404).json({ error: "No encontrado" });

    // Validar contra el merge (frecuencia podría no venir en payload)
    const merged = { ...existing, ...d };
    const errores = validarPayload(merged, false);
    if (errores.length) return res.status(400).json({ error: errores.join(" | ") });

    const data = {};
    if (d.titulo !== undefined)          data.titulo          = d.titulo.trim();
    if (d.mensaje !== undefined)         data.mensaje         = d.mensaje.trim();
    if (d.tipo !== undefined)            data.tipo            = d.tipo;
    if (d.destinatario_id !== undefined) data.destinatario_id = d.destinatario_id ? +d.destinatario_id : null;
    if (d.telefono_manual !== undefined) data.telefono_manual = (d.telefono_manual || "").trim();
    if (d.frecuencia !== undefined) {
      data.frecuencia     = d.frecuencia;
      data.intervalo_dias = d.frecuencia === "CADA_N_DIAS" ? (d.intervalo_dias ?? existing.intervalo_dias) : null;
      data.dia_semana     = d.frecuencia === "SEMANAL"     ? (d.dia_semana ?? existing.dia_semana)         : null;
      data.dia_mes        = d.frecuencia === "MENSUAL"     ? (d.dia_mes ?? existing.dia_mes)               : null;
    }
    if (d.hora !== undefined)            data.hora            = d.hora;
    if (d.fecha_inicio !== undefined)    data.fecha_inicio    = new Date(d.fecha_inicio);
    if (d.fecha_caducidad !== undefined) data.fecha_caducidad = d.fecha_caducidad ? new Date(d.fecha_caducidad) : null;

    // Recalcular proximo_envio si cambió algo que lo afecta
    const afecta = ["frecuencia", "fecha_inicio", "hora", "intervalo_dias", "dia_semana", "dia_mes"].some(k => d[k] !== undefined);
    if (afecta) {
      data.proximo_envio = calcularProximoInicial({ ...existing, ...data });
    }

    const updated = await prisma.reminder.update({
      where: { id: +req.params.id },
      data,
      include: {
        destinatario: { select: { id: true, nombre: true, apellido: true, email: true, telefono_whatsapp: true } },
        creado_por:   { select: { id: true, nombre: true, apellido: true } },
      },
    });
    res.json(serializar(updated));
  } catch (e) { next(e); }
});

// ── PATCH /api/reminders/:id/toggle-pause ────────────────────
router.patch("/:id/toggle-pause", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const r = await prisma.reminder.findUnique({ where: { id: +req.params.id } });
    if (!r) return res.status(404).json({ error: "No encontrado" });
    const updated = await prisma.reminder.update({
      where: { id: +req.params.id },
      data:  { pausado: !r.pausado },
    });
    res.json({ pausado: updated.pausado });
  } catch (e) { next(e); }
});

// ── DELETE /api/reminders/:id ────────────────────────────────
// Soft delete: marca activo=false. Conserva logs.
router.delete("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    await prisma.reminder.update({
      where: { id: +req.params.id },
      data:  { activo: false },
    });
    res.json({ message: "Recordatorio desactivado" });
  } catch (e) { next(e); }
});

// ── POST /api/reminders/:id/test ─────────────────────────────
// Dispara un envío inmediato del recordatorio (para probar texto/destinatario).
// NO afecta proximo_envio ni veces_enviado: usa _procesar pero el log queda
// marcado y luego restauramos los campos.
router.post("/:id/test", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const r = await prisma.reminder.findUnique({
      where: { id: +req.params.id },
      include: { destinatario: { select: { id: true, telefono_whatsapp: true } } },
    });
    if (!r) return res.status(404).json({ error: "No encontrado" });

    // Snapshot pre-test
    const snapshot = {
      proximo_envio: r.proximo_envio,
      ultimo_envio:  r.ultimo_envio,
      veces_enviado: r.veces_enviado,
      activo:        r.activo,
    };

    await _procesar(r);

    // Restaurar para no afectar el ciclo normal del scheduler
    await prisma.reminder.update({
      where: { id: r.id },
      data:  snapshot,
    });

    // Devolver último log (el que se acaba de crear)
    const ultimoLog = await prisma.reminderLog.findFirst({
      where: { reminder_id: r.id },
      orderBy: { enviado_at: "desc" },
    });
    res.json({ message: "Test ejecutado", log: ultimoLog });
  } catch (e) { next(e); }
});

module.exports = router;
