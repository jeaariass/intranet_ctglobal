// backend/src/routes/equipment.js
const router = require("express").Router();
const prisma = require("../lib/prisma");
const { Pool } = require("pg");
const { authMiddleware, editorMiddleware, adminMiddleware } = require("../middleware/auth");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

// GET /api/equipment
router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const { tipo, estado, q } = req.query;
    const where = {};
    if (tipo)   where.tipo   = tipo;
    if (estado) where.estado = estado;
    if (q)      where.nombre = { contains: q, mode: "insensitive" };

    const items = await prisma.equipment.findMany({
      where,
      include: {
        geo_projects:   { select: { nombre: true, codigo: true } },
        _count:         { select: { equipment_logs: true } },
      },
      orderBy: { nombre: "asc" },
    });
    res.json(items.map(({ geo_projects, _count, ...e }) => ({
      ...e,
      proyectoActual: geo_projects || null,
      _count: { logs: _count.equipment_logs },
    })));
  } catch (e) { next(e); }
});

// GET /api/equipment/alerts
router.get("/alerts", authMiddleware, async (req, res, next) => {
  try {
    const in30days = new Date();
    in30days.setDate(in30days.getDate() + 30);
    const items = await prisma.equipment.findMany({
      where: {
        proximo_mantenimiento: { lte: in30days },
        estado: { not: "DADO_DE_BAJA" },
      },
      orderBy: { proximo_mantenimiento: "asc" },
    });
    res.json(items);
  } catch (e) { next(e); }
});

// GET /api/equipment/:id
router.get("/:id", authMiddleware, async (req, res, next) => {
  try {
    const item = await prisma.equipment.findUnique({
      where: { id: +req.params.id },
      include: {
        geo_projects:   { select: { nombre: true, codigo: true } },
        equipment_logs: {
          orderBy: { fecha_inicio: "desc" },
          take: 20,
          include: {
            geo_projects: { select: { nombre: true, codigo: true } },
            users:        { select: { nombre: true, apellido: true } },
          },
        },
      },
    });
    if (!item) return res.status(404).json({ error: "No encontrado" });
    const { geo_projects, equipment_logs, ...rest } = item;
    res.json({
      ...rest,
      proyectoActual: geo_projects || null,
      logs: equipment_logs.map(({ geo_projects: gp, users: u, ...l }) => ({
        ...l,
        proyecto: gp || null,
        usuario:  u  ? { nombre: u.nombre, apellido: u.apellido } : null,
      })),
    });
  } catch (e) { next(e); }
});

// GET /api/equipment/:id/invoices — facturas vinculadas al equipo
router.get("/:id/invoices", authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT i.*, u.nombre || ' ' || u.apellido AS registrado_por_nombre
      FROM invoices i
      LEFT JOIN users u ON u.id = i.registrado_por_id
      WHERE i.equipo_id = $1
      ORDER BY i.fecha_emision DESC
    `, [+req.params.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/equipment
router.post("/", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const d = req.body;
    const item = await prisma.equipment.create({
      data: {
        nombre:                d.nombre,
        tipo:                  d.tipo,
        marca:                 d.marca                || "",
        modelo:                d.modelo               || "",
        serial:                d.serial               || "",
        estado:                d.estado               || "DISPONIBLE",
        descripcion:           d.descripcion          || "",
        ubicacion:             d.ubicacion            || "",
        fecha_compra:          d.fechaCompra          ? new Date(d.fechaCompra)          : null,
        valor_compra:          d.valorCompra          ? +d.valorCompra                   : null,
        proximo_mantenimiento: d.proximoMantenimiento ? new Date(d.proximoMantenimiento) : null,
      },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /api/equipment/:id
router.put("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const d = req.body;
    const item = await prisma.equipment.update({
      where: { id: +req.params.id },
      data: {
        nombre:                d.nombre,
        tipo:                  d.tipo,
        marca:                 d.marca,
        modelo:                d.modelo,
        serial:                d.serial,
        estado:                d.estado,
        descripcion:           d.descripcion,
        ubicacion:             d.ubicacion,
        fecha_compra:          d.fechaCompra          ? new Date(d.fechaCompra)          : null,
        valor_compra:          d.valorCompra          ? +d.valorCompra                   : null,
        proximo_mantenimiento: d.proximoMantenimiento ? new Date(d.proximoMantenimiento) : null,
        proyecto_actual_id:    d.proyectoActualId     ? +d.proyectoActualId              : null,
      },
    });
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/equipment/:id/log
router.post("/:id/log", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { accion, proyectoId, notas, nuevoEstado } = req.body;

    // Cerrar log anterior abierto
    await prisma.equipmentLog.updateMany({
      where: { equipo_id: +req.params.id, fecha_fin: null },
      data:  { fecha_fin: new Date() },
    });

    const log = await prisma.equipmentLog.create({
      data: {
        equipo_id:   +req.params.id,
        // proyecto_id es opcional — null si es transversal (licencias, etc.)
        proyecto_id: proyectoId ? +proyectoId : null,
        usuario_id:  req.user.id,
        accion,
        notas: notas || "",
      },
    });

    // Actualizar estado del equipo
    const updateData = {};
    if (nuevoEstado) updateData.estado = nuevoEstado;

    // Solo actualizar proyecto_actual si se especificó uno
    if (nuevoEstado === "DISPONIBLE" || nuevoEstado === "EN_MANTENIMIENTO") {
      updateData.proyecto_actual_id = null;
    } else if (proyectoId && nuevoEstado === "EN_CAMPO") {
      updateData.proyecto_actual_id = +proyectoId;
    }
    // EN_CAMPO sin proyecto: el equipo está en campo pero sin proyecto asignado

    if (Object.keys(updateData).length) {
      await prisma.equipment.update({
        where: { id: +req.params.id },
        data:  updateData,
      });
    }
    res.status(201).json(log);
  } catch (e) { next(e); }
});

// DELETE /api/equipment/:id
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    await prisma.equipment.update({
      where: { id: +req.params.id },
      data:  { estado: "DADO_DE_BAJA" },
    });
    res.json({ message: "Equipo dado de baja" });
  } catch (e) { next(e); }
});

module.exports = router;
