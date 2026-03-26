// backend/src/routes/invoices.js
// Usa pg directo porque los enums nuevos (InvoiceTipo, InvoiceEstado)
// no quedan bien en el cliente Prisma generado por db pull.

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

    if (tipo)     { conds.push(`i.tipo = $${i++}`);         vals.push(tipo); }
    if (estado)   { conds.push(`i.estado = $${i++}`);       vals.push(estado); }
    if (equipoId) { conds.push(`i.equipo_id = $${i++}`);    vals.push(+equipoId); }
    if (anio)     { conds.push(`i.periodo_anio = $${i++}`); vals.push(+anio); }
    if (mes)      { conds.push(`i.periodo_mes = $${i++}`);  vals.push(+mes); }

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

// GET /api/invoices/alerts
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

    // Suma COP = monto donde moneda=COP + monto_secundario donde moneda_secundaria=COP
    // Suma USD = monto donde moneda=USD + monto_secundario donde moneda_secundaria=USD
    const [estadosMes, totalesCop, totalesUsd, vencidos] = await Promise.all([
      // Conteo y total bruto por estado (para tarjetas de resumen)
      q(`SELECT estado,
           COUNT(*)                                            AS count,
           COALESCE(SUM(
             CASE WHEN moneda='COP' THEN monto ELSE 0 END +
             CASE WHEN moneda_secundaria='COP' THEN COALESCE(monto_secundario,0) ELSE 0 END
           ),0)                                               AS total_cop,
           COALESCE(SUM(
             CASE WHEN moneda='USD' THEN monto ELSE 0 END +
             CASE WHEN moneda_secundaria='USD' THEN COALESCE(monto_secundario,0) ELSE 0 END
           ),0)                                               AS total_usd
         FROM invoices
         WHERE periodo_mes=$1 AND periodo_anio=$2
         GROUP BY estado`,
        [mes, anio]),

      // Total COP histórico por mes (para gráfico tendencia)
      q(`SELECT periodo_mes, periodo_anio,
           COALESCE(SUM(
             CASE WHEN moneda='COP' THEN monto ELSE 0 END +
             CASE WHEN moneda_secundaria='COP' THEN COALESCE(monto_secundario,0) ELSE 0 END
           ),0) AS total_cop
         FROM invoices
         WHERE estado='PAGADO'
           AND periodo_anio IN ($1, $2)
         GROUP BY periodo_anio, periodo_mes
         ORDER BY periodo_anio, periodo_mes`,
        [anio - 1, anio]),

      // Total USD histórico por mes
      q(`SELECT periodo_mes, periodo_anio,
           COALESCE(SUM(
             CASE WHEN moneda='USD' THEN monto ELSE 0 END +
             CASE WHEN moneda_secundaria='USD' THEN COALESCE(monto_secundario,0) ELSE 0 END
           ),0) AS total_usd
         FROM invoices
         WHERE estado='PAGADO'
           AND periodo_anio IN ($1, $2)
         GROUP BY periodo_anio, periodo_mes
         ORDER BY periodo_anio, periodo_mes`,
        [anio - 1, anio]),

      // Facturas vencidas sin pagar
      q(`SELECT COUNT(*) AS count FROM invoices WHERE estado='VENCIDO'`),
    ]);

    // Construir mapa por estado del mes actual
    const byEstado = {};
    for (const r of estadosMes) {
      byEstado[r.estado] = {
        count:     +r.count,
        total_cop: +r.total_cop,
        total_usd: +r.total_usd,
      };
    }

    const get = (estado) => byEstado[estado] || { count:0, total_cop:0, total_usd:0 };

    res.json({
      mes, anio,
      pagados:    get("PAGADO"),
      pendientes: get("PENDIENTE"),
      vencidos:   { count: +vencidos[0].count, total_cop: 0, total_usd: 0 },
      historico: {
        cop: totalesCop,
        usd: totalesUsd,
      },
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
           monto_secundario, moneda_secundaria,
           fecha_emision, fecha_vencimiento, periodo_mes, periodo_anio,
           equipo_id, archivo_pdf, notas, registrado_por_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING *
      `, [
        d.concepto,
        d.tipo              || "OTRO",
        d.estado            || "PENDIENTE",
        d.proveedor         || "",
        parseFloat(d.monto),
        d.moneda            || "COP",
        d.monto_secundario  ? parseFloat(d.monto_secundario)  : null,
        d.moneda_secundaria || null,
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
          concepto=$1, tipo=$2, estado=$3, proveedor=$4,
          monto=$5, moneda=$6,
          monto_secundario=$7, moneda_secundaria=$8,
          fecha_emision=$9, fecha_vencimiento=$10,
          periodo_mes=$11, periodo_anio=$12,
          equipo_id=$13, notas=$14
          ${pdf ? ", archivo_pdf=$16" : ""}
        WHERE id=$15
        RETURNING *
      `, [
        d.concepto, d.tipo, d.estado, d.proveedor || "",
        parseFloat(d.monto), d.moneda || "COP",
        d.monto_secundario  ? parseFloat(d.monto_secundario)  : null,
        d.moneda_secundaria || null,
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