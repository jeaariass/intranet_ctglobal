// backend/src/routes/gastos.js
// Gastos operativos. Usa pg directo (igual que invoices.js) por los enums nuevos.

const router   = require("express").Router();
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const { Pool } = require("pg");
const { authMiddleware, editorMiddleware } = require("../middleware/auth");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

// ── Uploads ───────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, "../../uploads/gastos");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9_\-]/g, "_")
      .substring(0, 80);
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    [".pdf", ".jpg", ".jpeg", ".png"].includes(
      path.extname(file.originalname).toLowerCase()
    ) ? cb(null, true) : cb(new Error("Solo PDF o imágenes"));
  },
});

async function q(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

function rmFile(name) {
  if (!name) return;
  const fp = path.join(uploadsDir, name);
  if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch { /* noop */ } }
}

// ── Depreciación lineal ──────────────────────────────────────
// Depreciación mensual del equipo `e` para el mes contable (mes, anio).
// base = valor_compra - valor_residual ; vida = vida_util_meses || 36.
// Solo dentro de [mes de fecha_compra, +vida). Todo en COP.
function depMensualEquipo(e, mes, anio) {
  const valor = Number(e.valor_compra);
  if (!e.depreciable || !valor || !e.fecha_compra) return 0;
  const residual = Number(e.valor_residual || 0);
  const base = valor - residual;
  const vida = Number(e.vida_util_meses) || 36;
  if (base <= 0 || vida <= 0) return 0;

  const inicio = new Date(e.fecha_compra);
  const startIdx = inicio.getFullYear() * 12 + inicio.getMonth();
  const targetIdx = anio * 12 + (mes - 1);
  const transcurridos = targetIdx - startIdx;
  if (transcurridos < 0 || transcurridos >= vida) return 0;
  return base / vida;
}

// meses transcurridos de vida útil hasta (mes, anio) inclusive, tope = vida
function mesesDepreciados(e, mes, anio) {
  const inicio = new Date(e.fecha_compra);
  const startIdx = inicio.getFullYear() * 12 + inicio.getMonth();
  const targetIdx = anio * 12 + (mes - 1);
  const vida = Number(e.vida_util_meses) || 36;
  return Math.max(0, Math.min(vida, targetIdx - startIdx + 1));
}

const MONEDAS = ["COP", "USD", "EUR"];
const num = (v) => (v === "" || v == null ? null : parseFloat(v));
const int = (v) => (v === "" || v == null ? null : parseInt(v, 10));

// ════════════════════════════════════════════════════════════
//  LISTA
// ════════════════════════════════════════════════════════════
router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const { categoria, estado, mes, anio, personaId, proyectoId, equipoId, q: search } = req.query;
    const conds = ["1=1"];
    const vals  = [];
    let   i     = 1;

    if (categoria)  { conds.push(`g.categoria = $${i++}`);    vals.push(categoria); }
    if (estado)     { conds.push(`g.estado = $${i++}`);       vals.push(estado); }
    if (mes)        { conds.push(`g.periodo_mes = $${i++}`);  vals.push(+mes); }
    if (anio)       { conds.push(`g.periodo_anio = $${i++}`); vals.push(+anio); }
    if (personaId)  { conds.push(`g.persona_id = $${i++}`);   vals.push(+personaId); }
    if (proyectoId) { conds.push(`g.proyecto_id = $${i++}`);  vals.push(+proyectoId); }
    if (equipoId)   { conds.push(`g.equipo_id = $${i++}`);    vals.push(+equipoId); }
    if (search) {
      conds.push(`(g.concepto ILIKE $${i} OR g.proveedor ILIKE $${i} OR g.notas ILIKE $${i})`);
      vals.push(`%${search}%`); i++;
    }

    const rows = await q(`
      SELECT g.*,
        p.nombre || ' ' || p.apellido       AS persona_nombre,
        p.rol                               AS persona_rol,
        pr.codigo                           AS proyecto_codigo,
        pr.nombre                           AS proyecto_nombre,
        e.nombre                            AS equipo_nombre,
        r.nombre || ' ' || r.apellido       AS registrado_por_nombre
      FROM gastos g
      LEFT JOIN users       p  ON p.id  = g.persona_id
      LEFT JOIN geo_projects pr ON pr.id = g.proyecto_id
      LEFT JOIN equipment   e  ON e.id  = g.equipo_id
      LEFT JOIN users       r  ON r.id  = g.registrado_por_id
      WHERE ${conds.join(" AND ")}
      ORDER BY g.fecha DESC, g.id DESC
    `, vals);
    res.json(rows);
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  ALERTAS (por vencer)
// ════════════════════════════════════════════════════════════
router.get("/alerts", authMiddleware, async (req, res, next) => {
  try {
    const rows = await q(`
      SELECT g.id, g.concepto, g.categoria, g.monto, g.moneda, g.fecha_vencimiento
      FROM gastos g
      WHERE g.estado = 'PENDIENTE'
        AND g.fecha_vencimiento IS NOT NULL
        AND g.fecha_vencimiento >= CURRENT_DATE
        AND g.fecha_vencimiento <= CURRENT_DATE + INTERVAL '5 days'
      ORDER BY g.fecha_vencimiento ASC
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  RECURRENTES — gastos mensuales (FIJO/VARIABLE), última ocurrencia por serie
// ════════════════════════════════════════════════════════════
router.get("/recurrentes", authMiddleware, async (req, res, next) => {
  try {
    const rows = await q(`
      SELECT DISTINCT ON (g.serie_id) g.*,
        p.nombre || ' ' || p.apellido       AS persona_nombre,
        pr.codigo                           AS proyecto_codigo,
        e.nombre                            AS equipo_nombre
      FROM gastos g
      LEFT JOIN users       p  ON p.id  = g.persona_id
      LEFT JOIN geo_projects pr ON pr.id = g.proyecto_id
      LEFT JOIN equipment   e  ON e.id  = g.equipo_id
      WHERE g.recurrente = TRUE AND g.serie_id IS NOT NULL
      ORDER BY g.serie_id, (g.periodo_anio * 12 + g.periodo_mes) DESC, g.id DESC
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  CONTRATISTAS — total pagado por persona en el período + datos bancarios
// ════════════════════════════════════════════════════════════
router.get("/contratistas", authMiddleware, async (req, res, next) => {
  try {
    const now  = new Date();
    const mes  = req.query.mes  ? +req.query.mes  : now.getMonth() + 1;
    const anio = req.query.anio ? +req.query.anio : now.getFullYear();

    const rows = await q(`
      SELECT
        u.id, u.nombre, u.apellido, u.cedula, u.es_persona_juridica,
        u.banco, u.numero_cuenta_banco, u.tipo_cuenta, u.contrato_referencia,
        COALESCE(SUM(CASE WHEN g.moneda='COP' THEN g.monto ELSE 0 END), 0) AS total_cop,
        COALESCE(SUM(CASE WHEN g.moneda='USD' THEN g.monto ELSE 0 END), 0) AS total_usd,
        COUNT(g.id) FILTER (WHERE g.id IS NOT NULL)                        AS count,
        COUNT(g.id) FILTER (WHERE g.estado = 'PENDIENTE')                  AS pendientes,
        json_agg(
          json_build_object(
            'id', g.id, 'concepto', g.concepto, 'monto', g.monto, 'moneda', g.moneda,
            'estado', g.estado, 'fecha', g.fecha, 'proyecto_id', g.proyecto_id
          ) ORDER BY g.fecha DESC
        ) FILTER (WHERE g.id IS NOT NULL) AS gastos
      FROM users u
      JOIN gastos g ON g.persona_id = u.id
        AND g.categoria = 'CONTRATISTA'
        AND g.periodo_mes = $1 AND g.periodo_anio = $2
        AND g.estado <> 'ANULADO'
      WHERE u.rol = 'CONTRATISTA'
      GROUP BY u.id
      ORDER BY total_cop DESC
    `, [mes, anio]);
    res.json({ mes, anio, contratistas: rows });
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  RESUMEN MENSUAL
// ════════════════════════════════════════════════════════════
router.get("/resumen", authMiddleware, async (req, res, next) => {
  try {
    const now  = new Date();
    const mes  = req.query.mes  ? +req.query.mes  : now.getMonth() + 1;
    const anio = req.query.anio ? +req.query.anio : now.getFullYear();

    const [porCategoria, equipos, historicoRaw] = await Promise.all([
      // Totales del mes por categoría (excluye ANULADO)
      q(`SELECT categoria,
           COUNT(*) AS count,
           COALESCE(SUM(
             CASE WHEN moneda='COP' THEN monto ELSE 0 END +
             CASE WHEN moneda_secundaria='COP' THEN COALESCE(monto_secundario,0) ELSE 0 END
           ),0) AS total_cop,
           COALESCE(SUM(
             CASE WHEN moneda='USD' THEN monto ELSE 0 END +
             CASE WHEN moneda_secundaria='USD' THEN COALESCE(monto_secundario,0) ELSE 0 END
           ),0) AS total_usd
         FROM gastos
         WHERE periodo_mes=$1 AND periodo_anio=$2 AND estado <> 'ANULADO'
         GROUP BY categoria`,
        [mes, anio]),

      // Equipos para depreciación
      q(`SELECT id, nombre, valor_compra, valor_residual, vida_util_meses,
                depreciable, fecha_compra
         FROM equipment
         WHERE estado <> 'DADO_DE_BAJA'`),

      // Histórico últimos 13 meses (COP) — total gastos + se suma depreciación abajo
      q(`SELECT periodo_anio, periodo_mes,
           COALESCE(SUM(
             CASE WHEN moneda='COP' THEN monto ELSE 0 END +
             CASE WHEN moneda_secundaria='COP' THEN COALESCE(monto_secundario,0) ELSE 0 END
           ),0) AS total_cop
         FROM gastos
         WHERE estado <> 'ANULADO'
           AND (periodo_anio * 12 + periodo_mes) >= ($1 * 12 + $2 - 12)
           AND (periodo_anio * 12 + periodo_mes) <= ($1 * 12 + $2)
         GROUP BY periodo_anio, periodo_mes
         ORDER BY periodo_anio, periodo_mes`,
        [anio, mes]),
    ]);

    // Depreciación del mes solicitado
    const depMes = equipos.reduce((a, e) => a + depMensualEquipo(e, mes, anio), 0);

    const categorias = {};
    for (const r of porCategoria) {
      categorias[r.categoria] = {
        count: +r.count, total_cop: +r.total_cop, total_usd: +r.total_usd,
      };
    }
    categorias.DEPRECIACION = {
      count: equipos.filter(e => depMensualEquipo(e, mes, anio) > 0).length,
      total_cop: depMes,
      total_usd: 0,
    };

    const totalCop = Object.values(categorias).reduce((a, c) => a + c.total_cop, 0);
    const totalUsd = Object.values(categorias).reduce((a, c) => a + c.total_usd, 0);

    // Histórico + depreciación por mes
    const historico = [];
    for (let k = 12; k >= 0; k--) {
      const idx = anio * 12 + (mes - 1) - k;
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      const fila = historicoRaw.find(r => +r.periodo_anio === y && +r.periodo_mes === m);
      const dep = equipos.reduce((a, e) => a + depMensualEquipo(e, m, y), 0);
      historico.push({
        anio: y, mes: m,
        total_cop: (fila ? +fila.total_cop : 0) + dep,
      });
    }

    res.json({
      mes, anio,
      categorias,
      depreciacion_cop: depMes,
      total_mes_cop: totalCop,
      total_mes_usd: totalUsd,
      historico,
    });
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  DEPRECIACIÓN — cronograma por equipo
// ════════════════════════════════════════════════════════════
router.get("/depreciacion", authMiddleware, async (req, res, next) => {
  try {
    const now  = new Date();
    const mes  = req.query.mes  ? +req.query.mes  : now.getMonth() + 1;
    const anio = req.query.anio ? +req.query.anio : now.getFullYear();

    const equipos = await q(`
      SELECT e.id, e.nombre, e.identificador, e.valor_compra, e.valor_residual,
             e.vida_util_meses, e.depreciable, e.fecha_compra,
             c.nombre AS categoria_nombre
      FROM equipment e
      LEFT JOIN equipment_categorias c ON c.id = e.categoria_id
      WHERE e.estado <> 'DADO_DE_BAJA' AND e.valor_compra IS NOT NULL AND e.valor_compra > 0
      ORDER BY e.nombre ASC
    `);

    const items = equipos.map(e => {
      const valor    = Number(e.valor_compra);
      const residual = Number(e.valor_residual || 0);
      const vida     = Number(e.vida_util_meses) || 36;
      const depMensual = depMensualEquipo(e, mes, anio);
      const meses = e.fecha_compra ? mesesDepreciados(e, mes, anio) : 0;
      const acumulada = e.depreciable && e.fecha_compra
        ? Math.min(valor - residual, (valor - residual) / vida * meses)
        : 0;
      return {
        id: e.id, nombre: e.nombre, identificador: e.identificador,
        categoria: e.categoria_nombre,
        valor_compra: valor,
        valor_residual: residual,
        vida_util_meses: vida,
        depreciable: e.depreciable,
        fecha_compra: e.fecha_compra,
        dep_mensual: depMensual,
        meses_transcurridos: meses,
        depreciacion_acumulada: acumulada,
        valor_en_libros: valor - acumulada,
      };
    });

    res.json({
      mes, anio,
      items,
      total_dep_mensual: items.reduce((a, x) => a + x.dep_mensual, 0),
    });
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  DETALLE
// ════════════════════════════════════════════════════════════
router.get("/:id", authMiddleware, async (req, res, next) => {
  try {
    const rows = await q(`
      SELECT g.*,
        p.nombre || ' ' || p.apellido AS persona_nombre,
        pr.codigo AS proyecto_codigo, pr.nombre AS proyecto_nombre,
        e.nombre AS equipo_nombre,
        r.nombre || ' ' || r.apellido AS registrado_por_nombre
      FROM gastos g
      LEFT JOIN users       p  ON p.id  = g.persona_id
      LEFT JOIN geo_projects pr ON pr.id = g.proyecto_id
      LEFT JOIN equipment   e  ON e.id  = g.equipo_id
      LEFT JOIN users       r  ON r.id  = g.registrado_por_id
      WHERE g.id = $1
    `, [+req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Gasto no encontrado" });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  CREAR
// ════════════════════════════════════════════════════════════
router.post("/", authMiddleware, editorMiddleware,
  upload.single("archivo"), async (req, res, next) => {
    try {
      const d = req.body;
      if (!d.concepto?.trim()) return res.status(400).json({ error: "Concepto requerido" });
      if (num(d.monto) == null) return res.status(400).json({ error: "Monto requerido" });
      if (!d.fecha)             return res.status(400).json({ error: "Fecha requerida" });

      const moneda = MONEDAS.includes(d.moneda) ? d.moneda : "COP";
      const monedaSec = MONEDAS.includes(d.moneda_secundaria) ? d.moneda_secundaria : null;

      const esRecurrente = d.recurrente === "true" || d.recurrente === true;
      const tipoRec = ["FIJO","VARIABLE"].includes(d.recurrente_tipo) ? d.recurrente_tipo : null;
      const intervalo = Math.min(12, Math.max(1, int(d.intervalo_meses) || 1));

      const rows = await q(`
        INSERT INTO gastos
          (categoria, subcategoria, concepto, proveedor, monto, moneda,
           monto_secundario, moneda_secundaria, fecha, fecha_vencimiento,
           periodo_mes, periodo_anio, estado, persona_id, equipo_id, proyecto_id,
           recurrente, recurrente_tipo, intervalo_meses, archivo, notas, registrado_por_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        RETURNING *
      `, [
        d.categoria        || "OTRO",
        d.subcategoria      || "",
        d.concepto.trim(),
        d.proveedor         || "",
        num(d.monto),
        moneda,
        num(d.monto_secundario),
        monedaSec,
        d.fecha,
        d.fecha_vencimiento || null,
        int(d.periodo_mes),
        int(d.periodo_anio),
        d.estado           || "PENDIENTE",
        int(d.persona_id),
        int(d.equipo_id),
        int(d.proyecto_id),
        esRecurrente,
        esRecurrente ? tipoRec : null,
        esRecurrente ? intervalo : 1,
        req.file ? req.file.filename : "",
        d.notas             || "",
        req.user.id,
      ]);

      let gasto = rows[0];
      // Nueva serie recurrente: se autoreferencia como cabeza de la cadena.
      if (esRecurrente && tipoRec) {
        const upd = await q(
          "UPDATE gastos SET serie_id = $1 WHERE id = $1 RETURNING *",
          [gasto.id]
        );
        gasto = upd[0];
      }
      res.status(201).json(gasto);
    } catch (e) {
      if (req.file) rmFile(req.file.filename);
      next(e);
    }
  }
);

// ════════════════════════════════════════════════════════════
//  ACTUALIZAR
// ════════════════════════════════════════════════════════════
router.put("/:id", authMiddleware, editorMiddleware,
  upload.single("archivo"), async (req, res, next) => {
    try {
      const d = req.body;
      const prev = await q("SELECT archivo, por_completar FROM gastos WHERE id=$1", [+req.params.id]);
      if (!prev[0]) {
        if (req.file) rmFile(req.file.filename);
        return res.status(404).json({ error: "Gasto no encontrado" });
      }

      const moneda = MONEDAS.includes(d.moneda) ? d.moneda : "COP";
      const monedaSec = MONEDAS.includes(d.moneda_secundaria) ? d.moneda_secundaria : null;
      const nuevoArchivo = req.file ? req.file.filename : null;
      const esRecurrente = d.recurrente === "true" || d.recurrente === true;
      const tipoRec = ["FIJO","VARIABLE"].includes(d.recurrente_tipo) ? d.recurrente_tipo : null;
      const intervalo = Math.min(12, Math.max(1, int(d.intervalo_meses) || 1));
      // Guardar con monto real desmarca "por completar" (era una ocurrencia
      // VARIABLE generada automáticamente en espera de la factura).
      const porCompletar = num(d.monto) ? false : prev[0].por_completar;

      const rows = await q(`
        UPDATE gastos SET
          categoria=$1, subcategoria=$2, concepto=$3, proveedor=$4,
          monto=$5, moneda=$6, monto_secundario=$7, moneda_secundaria=$8,
          fecha=$9, fecha_vencimiento=$10, periodo_mes=$11, periodo_anio=$12,
          estado=$13, persona_id=$14, equipo_id=$15, proyecto_id=$16,
          recurrente=$17, recurrente_tipo=$18, intervalo_meses=$19, por_completar=$20, notas=$21, updated_at=NOW()
          ${nuevoArchivo ? ", archivo=$23" : ""}
        WHERE id=$22
        RETURNING *
      `, [
        d.categoria || "OTRO",
        d.subcategoria || "",
        d.concepto,
        d.proveedor || "",
        num(d.monto),
        moneda,
        num(d.monto_secundario),
        monedaSec,
        d.fecha,
        d.fecha_vencimiento || null,
        int(d.periodo_mes),
        int(d.periodo_anio),
        d.estado || "PENDIENTE",
        int(d.persona_id),
        int(d.equipo_id),
        int(d.proyecto_id),
        esRecurrente,
        esRecurrente ? tipoRec : null,
        esRecurrente ? intervalo : 1,
        porCompletar,
        d.notas || "",
        +req.params.id,
        ...(nuevoArchivo ? [nuevoArchivo] : []),
      ]);

      // Si se activó como recurrente y aún no tiene serie, se vuelve cabeza de cadena.
      if (esRecurrente && tipoRec && !rows[0].serie_id) {
        const upd = await q(
          "UPDATE gastos SET serie_id = id WHERE id = $1 RETURNING *",
          [+req.params.id]
        );
        rows[0] = upd[0];
      }

      if (nuevoArchivo && prev[0].archivo) rmFile(prev[0].archivo);
      res.json(rows[0]);
    } catch (e) {
      if (req.file) rmFile(req.file.filename);
      next(e);
    }
  }
);

// ════════════════════════════════════════════════════════════
//  CAMBIAR ESTADO
// ════════════════════════════════════════════════════════════
router.patch("/:id/estado", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const rows = await q(
      "UPDATE gastos SET estado=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [req.body.estado, +req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Gasto no encontrado" });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  ELIMINAR
// ════════════════════════════════════════════════════════════
router.delete("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const rows = await q("SELECT archivo FROM gastos WHERE id=$1", [+req.params.id]);
    if (rows[0]?.archivo) rmFile(rows[0].archivo);
    await q("DELETE FROM gastos WHERE id=$1", [+req.params.id]);
    res.json({ message: "Gasto eliminado" });
  } catch (e) { next(e); }
});

module.exports = router;
