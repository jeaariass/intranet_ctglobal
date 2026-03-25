// backend/src/routes/invoices.js
// Usa pg directo porque los enums nuevos (InvoiceTipo, InvoiceEstado)
// a veces no quedan bien en el cliente Prisma generado por db pull.

const router  = require("express").Router();
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { Pool } = require("pg");
const { authMiddleware, editorMiddleware } = require("../middleware/auth");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

// ── Uploads ───────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, "../../uploads/invoices");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `inv-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    [".pdf",".jpg",".jpeg",".png"].includes(
      path.extname(file.originalname).toLowerCase()
    ) ? cb(null, true) : cb(new Error("Solo PDF o imágenes"));
  },
});

// ── Helper query ──────────────────────────────────────────────
async function q(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

// GET /api/invoices
router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const { tipo, estado, equipoId, anio, mes } = req.query;
    const conds = ["1=1"];
    const vals  = [];
    let   i     = 1;

    if (tipo)     { conds.push(`i.tipo = $${i++}`);          vals.push(tipo); }
    if (estado)   { conds.push(`i.estado = $${i++}`);        vals.push(estado); }
    if (equipoId) { conds.push(`i.equipo_id = $${i++}`);     vals.push(+equipoId); }
    if (anio)     { conds.push(`i.periodo_anio = $${i++}`);  vals.push(+anio); }
    if (mes)      { conds.push(`i.periodo_mes = $${i++}`);   vals.push(+mes); }

    const rows = await q(`
      SELECT i.*,
        e.nombre   AS equipo_nombre,
        e.tipo     AS equipo_tipo,
        u.nombre || ' ' || u.apellido AS registrado_por_nombre
      FROM invoices i
      LEFT JOIN equipment e ON e.id = i.equipo_id
      LEFT JOIN users     u ON u.id = i.registrado_por_id
      WHERE ${conds.join(" AND ")}
      ORDER BY i.fecha_emision DESC, i.id DESC
    `, vals);

    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/invoices/alerts — por vencer en 5 días
router.get("/alerts", authMiddleware, async (req, res, next) => {
  try {
    const rows = await q(`
      SELECT i.*, e.nombre AS equipo_nombre
      FROM invoices i
      LEFT JOIN equipment e ON e.id = i.equipo_id
      WHERE i.estado = 'PENDIENTE'
        AND i.fecha_vencimiento IS NOT NULL
        AND i.fecha_vencimiento <= CURRENT_DATE + INTERVAL '5 days'
        AND i.fecha_vencimiento >= CURRENT_DATE
      ORDER BY i.fecha_vencimiento ASC
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/invoices/summary
router.get("/summary", authMiddleware, async (req, res, next) => {
  try {
    const now  = new Date();
    const mes  = now.getMonth() + 1;
    const anio = now.getFullYear();

    const [pagados, pendientes, vencidos] = await Promise.all([
      q(`SELECT COALESCE(SUM(monto),0) AS total, COUNT(*) AS count
         FROM invoices WHERE estado='PAGADO' AND periodo_mes=$1 AND periodo_anio=$2`,
        [mes, anio]),
      q(`SELECT COALESCE(SUM(monto),0) AS total, COUNT(*) AS count
         FROM invoices WHERE estado='PENDIENTE' AND periodo_mes=$1 AND periodo_anio=$2`,
        [mes, anio]),
      q(`SELECT COALESCE(SUM(monto),0) AS total, COUNT(*) AS count
         FROM invoices WHERE estado='VENCIDO'`),
    ]);

    res.json({
      mes, anio,
      pagados:    { total: +pagados[0].total,    count: +pagados[0].count },
      pendientes: { total: +pendientes[0].total, count: +pendientes[0].count },
      vencidos:   { total: +vencidos[0].total,   count: +vencidos[0].count },
    });
  } catch (e) { next(e); }
});

// GET /api/invoices/:id
router.get("/:id", authMiddleware, async (req, res, next) => {
  try {
    const rows = await q(`
      SELECT i.*, e.nombre AS equipo_nombre, e.tipo AS equipo_tipo,
        u.nombre || ' ' || u.apellido AS registrado_por_nombre
      FROM invoices i
      LEFT JOIN equipment e ON e.id = i.equipo_id
      LEFT JOIN users     u ON u.id = i.registrado_por_id
      WHERE i.id = $1
    `, [+req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Factura no encontrada" });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// POST /api/invoices
router.post("/", authMiddleware, editorMiddleware,
  upload.single("archivo_pdf"), async (req, res, next) => {
    try {
      const d = req.body;
      const rows = await q(`
        INSERT INTO invoices
          (concepto, tipo, estado, proveedor, monto, moneda,
           fecha_emision, fecha_vencimiento, periodo_mes, periodo_anio,
           equipo_id, archivo_pdf, notas, registrado_por_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *
      `, [
        d.concepto,
        d.tipo              || "OTRO",
        d.estado            || "PENDIENTE",
        d.proveedor         || "",
        parseFloat(d.monto),
        d.moneda            || "COP",
        d.fecha_emision,
        d.fecha_vencimiento || null,
        d.periodo_mes       ? +d.periodo_mes  : null,
        d.periodo_anio      ? +d.periodo_anio : null,
        d.equipo_id         ? +d.equipo_id    : null,
        req.file ? req.file.filename : "",
        d.notas             || "",
        req.user.id,
      ]);
      res.status(201).json(rows[0]);
    } catch (e) { next(e); }
  }
);

// PATCH /api/invoices/:id/estado
router.patch("/:id/estado", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const rows = await q(
      `UPDATE invoices SET estado=$1 WHERE id=$2 RETURNING *`,
      [req.body.estado, +req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// PUT /api/invoices/:id
router.put("/:id", authMiddleware, editorMiddleware,
  upload.single("archivo_pdf"), async (req, res, next) => {
    try {
      const d   = req.body;
      const pdf = req.file ? req.file.filename : null;

      const rows = await q(`
        UPDATE invoices SET
          concepto=$1, tipo=$2, estado=$3, proveedor=$4, monto=$5, moneda=$6,
          fecha_emision=$7, fecha_vencimiento=$8, periodo_mes=$9, periodo_anio=$10,
          equipo_id=$11, notas=$12
          ${pdf ? ", archivo_pdf=$14" : ""}
        WHERE id=$13
        RETURNING *
      `, [
        d.concepto, d.tipo, d.estado, d.proveedor || "",
        parseFloat(d.monto), d.moneda || "COP",
        d.fecha_emision,
        d.fecha_vencimiento || null,
        d.periodo_mes  ? +d.periodo_mes  : null,
        d.periodo_anio ? +d.periodo_anio : null,
        d.equipo_id    ? +d.equipo_id    : null,
        d.notas        || "",
        +req.params.id,
        ...(pdf ? [pdf] : []),
      ]);
      res.json(rows[0]);
    } catch (e) { next(e); }
  }
);

// DELETE /api/invoices/:id
router.delete("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const rows = await q("SELECT archivo_pdf FROM invoices WHERE id=$1", [+req.params.id]);
    if (rows[0]?.archivo_pdf) {
      const fp = path.join(uploadsDir, rows[0].archivo_pdf);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await q("DELETE FROM invoices WHERE id=$1", [+req.params.id]);
    res.json({ message: "Factura eliminada" });
  } catch (e) { next(e); }
});

module.exports = router;
