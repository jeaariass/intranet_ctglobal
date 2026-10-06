// backend/src/routes/contratos.js
// Contratos de contratistas: valor mensual + vigencia. Alimenta la previsión
// anual de Finanzas (cuánto queda comprometido según contratos activos).

const router   = require("express").Router();
const { Pool } = require("pg");
const { authMiddleware, editorMiddleware } = require("../middleware/auth");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function q(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

const MONEDAS = ["COP", "USD", "EUR"];
const num = (v) => (v === "" || v == null ? null : parseFloat(v));

// ════════════════════════════════════════════════════════════
//  LISTA
// ════════════════════════════════════════════════════════════
router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const { personaId, estado } = req.query;
    const conds = ["1=1"];
    const vals  = [];
    let   i     = 1;
    if (personaId) { conds.push(`c.persona_id = $${i++}`); vals.push(+personaId); }
    if (estado)    { conds.push(`c.estado = $${i++}`);      vals.push(estado); }

    const rows = await q(`
      SELECT c.*,
        p.nombre || ' ' || p.apellido AS persona_nombre,
        p.cedula                      AS persona_cedula
      FROM contratos_contratista c
      JOIN users p ON p.id = c.persona_id
      WHERE ${conds.join(" AND ")}
      ORDER BY c.estado ASC, c.fecha_inicio DESC
    `, vals);
    res.json(rows);
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  CREAR
// ════════════════════════════════════════════════════════════
router.post("/", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const d = req.body;
    if (!d.persona_id)      return res.status(400).json({ error: "Contratista requerido" });
    if (num(d.valor_mensual) == null || num(d.valor_mensual) <= 0)
      return res.status(400).json({ error: "Valor mensual requerido" });
    if (!d.fecha_inicio)    return res.status(400).json({ error: "Fecha de inicio requerida" });

    const rows = await q(`
      INSERT INTO contratos_contratista
        (persona_id, valor_mensual, moneda, fecha_inicio, fecha_fin, estado, referencia, notas, creado_por_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      +d.persona_id,
      num(d.valor_mensual),
      MONEDAS.includes(d.moneda) ? d.moneda : "COP",
      d.fecha_inicio,
      d.fecha_fin || null,
      ["ACTIVO", "TERMINADO"].includes(d.estado) ? d.estado : "ACTIVO",
      d.referencia || "",
      d.notas || "",
      req.user.id,
    ]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  ACTUALIZAR
// ════════════════════════════════════════════════════════════
router.put("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const d = req.body;
    const rows = await q(`
      UPDATE contratos_contratista SET
        persona_id=$1, valor_mensual=$2, moneda=$3, fecha_inicio=$4, fecha_fin=$5,
        estado=$6, referencia=$7, notas=$8, updated_at=NOW()
      WHERE id=$9
      RETURNING *
    `, [
      +d.persona_id,
      num(d.valor_mensual),
      MONEDAS.includes(d.moneda) ? d.moneda : "COP",
      d.fecha_inicio,
      d.fecha_fin || null,
      ["ACTIVO", "TERMINADO"].includes(d.estado) ? d.estado : "ACTIVO",
      d.referencia || "",
      d.notas || "",
      +req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Contrato no encontrado" });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  ELIMINAR
// ════════════════════════════════════════════════════════════
router.delete("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    await q("DELETE FROM contratos_contratista WHERE id=$1", [+req.params.id]);
    res.json({ message: "Contrato eliminado" });
  } catch (e) { next(e); }
});

module.exports = router;
