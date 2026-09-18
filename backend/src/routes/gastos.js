// backend/src/routes/gastos.js
// Gastos operativos. Usa pg directo (igual que invoices.js) por los enums nuevos.

const router   = require("express").Router();
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const ExcelJS  = require("exceljs");
const { Pool } = require("pg");
const { authMiddleware, editorMiddleware } = require("../middleware/auth");
const { siguientePeriodo, generarOcurrencia } = require("../lib/gastosRecurrentes");

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

// Import histórico: el archivo se parsea en memoria (nunca se guarda en disco).
const uploadXlsx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    [".xlsx"].includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true) : cb(new Error("El archivo debe ser .xlsx"));
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
//  EXPORTAR EXCEL — reporte por rango de fechas
// ════════════════════════════════════════════════════════════
const CAT_LABEL = {
  RECIBO_PUBLICO: "Recibo público", ADMINISTRACION: "Administración",
  CONTRATISTA: "Pago contratista", VUELO: "Vuelo", VIATICO: "Viático",
  DEPRECIACION: "Depreciación", OTRO: "Otro",
};

router.get("/export.xlsx", authMiddleware, async (req, res, next) => {
  try {
    const { desde, hasta, categoria, estado, personaId, proyectoId } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: "desde y hasta son requeridos" });

    const conds = ["g.fecha BETWEEN $1 AND $2"];
    const vals  = [desde, hasta];
    let   i     = 3;
    if (categoria)  { conds.push(`g.categoria = $${i++}`);    vals.push(categoria); }
    if (estado)     { conds.push(`g.estado = $${i++}`);       vals.push(estado); }
    if (personaId)  { conds.push(`g.persona_id = $${i++}`);   vals.push(+personaId); }
    if (proyectoId) { conds.push(`g.proyecto_id = $${i++}`);  vals.push(+proyectoId); }

    const rows = await q(`
      SELECT g.*,
        p.nombre || ' ' || p.apellido       AS persona_nombre,
        pr.codigo                           AS proyecto_codigo,
        pr.nombre                           AS proyecto_nombre,
        e.nombre                            AS equipo_nombre
      FROM gastos g
      LEFT JOIN users       p  ON p.id  = g.persona_id
      LEFT JOIN geo_projects pr ON pr.id = g.proyecto_id
      LEFT JOIN equipment   e  ON e.id  = g.equipo_id
      WHERE ${conds.join(" AND ")}
      ORDER BY g.fecha ASC, g.id ASC
    `, vals);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Intranet CTGlobal";

    // ── Hoja detalle ──
    const ws = wb.addWorksheet("Gastos");
    ws.columns = [
      { header: "Fecha",               key: "fecha",       width: 13 },
      { header: "Categoría",           key: "categoria",   width: 18 },
      { header: "Subcategoría",        key: "subcategoria", width: 16 },
      { header: "Concepto",            key: "concepto",    width: 32 },
      { header: "Proveedor / Persona", key: "quien",       width: 26 },
      { header: "Proyecto",            key: "proyecto",    width: 20 },
      { header: "Monto",               key: "monto",       width: 15 },
      { header: "Moneda",              key: "moneda",      width: 10 },
      { header: "Monto adicional",     key: "montoSec",    width: 15 },
      { header: "Moneda adicional",    key: "monedaSec",   width: 12 },
      { header: "Estado",              key: "estado",      width: 12 },
      { header: "Recurrente",          key: "recurrente",  width: 22 },
      { header: "Vence",               key: "vence",       width: 13 },
      { header: "Notas",               key: "notas",       width: 30 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const fecha0 = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
    for (const g of rows) {
      ws.addRow({
        fecha:       fecha0(g.fecha),
        categoria:   CAT_LABEL[g.categoria] || g.categoria,
        subcategoria: g.subcategoria || "",
        concepto:    g.concepto,
        quien:       g.persona_nombre || g.proveedor || "",
        proyecto:    g.proyecto_codigo || "",
        monto:       Number(g.monto),
        moneda:      g.moneda,
        montoSec:    g.monto_secundario != null ? Number(g.monto_secundario) : "",
        monedaSec:   g.moneda_secundaria || "",
        estado:      g.estado,
        recurrente:  g.recurrente
          ? `${g.recurrente_tipo === "FIJO" ? "Fijo" : "Variable"} · cada ${g.intervalo_meses === 1 ? "mes" : `${g.intervalo_meses} meses`}`
          : "",
        vence:       fecha0(g.fecha_vencimiento),
        notas:       g.notas || "",
      });
    }

    // ── Hoja resumen por categoría ──
    const wsR = wb.addWorksheet("Resumen");
    wsR.columns = [
      { header: "Categoría",   key: "categoria", width: 20 },
      { header: "Registros",   key: "count",     width: 12 },
      { header: "Total COP",   key: "cop",       width: 16 },
      { header: "Total USD",   key: "usd",       width: 16 },
    ];
    wsR.getRow(1).font = { bold: true };

    const porCat = {};
    for (const g of rows) {
      if (g.estado === "ANULADO") continue;
      const k = g.categoria;
      porCat[k] ||= { count: 0, cop: 0, usd: 0 };
      porCat[k].count++;
      if (g.moneda === "COP") porCat[k].cop += Number(g.monto);
      if (g.moneda === "USD") porCat[k].usd += Number(g.monto);
      if (g.moneda_secundaria === "COP") porCat[k].cop += Number(g.monto_secundario || 0);
      if (g.moneda_secundaria === "USD") porCat[k].usd += Number(g.monto_secundario || 0);
    }
    let totCop = 0, totUsd = 0, totCount = 0;
    for (const [cat, v] of Object.entries(porCat)) {
      wsR.addRow({ categoria: CAT_LABEL[cat] || cat, count: v.count, cop: v.cop, usd: v.usd });
      totCop += v.cop; totUsd += v.usd; totCount += v.count;
    }
    const totalRow = wsR.addRow({ categoria: "TOTAL", count: totCount, cop: totCop, usd: totUsd });
    totalRow.font = { bold: true };
    wsR.addRow({});
    wsR.addRow({ categoria: `Período: ${desde} a ${hasta}` });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="gastos_${desde}_a_${hasta}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  IMPORTAR HISTÓRICO — plantilla Excel normalizada + carga masiva
// ════════════════════════════════════════════════════════════
const IMPORT_CATEGORIAS = ["RECIBO_PUBLICO", "ADMINISTRACION", "CONTRATISTA", "VUELO", "VIATICO", "OTRO"];
const CATEGORIA_LABEL_TO_CODE = Object.fromEntries(IMPORT_CATEGORIAS.map(c => [CAT_LABEL[c], c]));
const ESTADO_LABEL = { PENDIENTE: "Pendiente", PAGADO: "Pagado", ANULADO: "Anulado" };
const ESTADO_LABEL_TO_CODE = Object.fromEntries(Object.entries(ESTADO_LABEL).map(([k, v]) => [v, k]));
const TIPO_REC_LABEL = { FIJO: "Fijo", VARIABLE: "Variable" };
const TIPO_REC_LABEL_TO_CODE = Object.fromEntries(Object.entries(TIPO_REC_LABEL).map(([k, v]) => [v, k]));
const IMPORT_INTERVALOS = [1, 2, 3, 4, 6, 12];
const IMPORT_LAST_ROW = 500; // filas habilitadas con listas desplegables en la plantilla

const IMPORT_COLS = [
  { key: "fecha",        header: "Fecha* (aaaa-mm-dd)",      width: 16 },
  { key: "categoria",    header: "Categoría*",                width: 20 },
  { key: "subcategoria", header: "Subcategoría",              width: 16 },
  { key: "concepto",     header: "Concepto*",                 width: 30 },
  { key: "proveedor",    header: "Proveedor",                 width: 22 },
  { key: "cedula",       header: "Persona (cédula)",          width: 16 },
  { key: "proyecto",     header: "Proyecto (código)",         width: 16 },
  { key: "monto",        header: "Monto*",                    width: 14 },
  { key: "moneda",       header: "Moneda*",                   width: 10 },
  { key: "montoSec",     header: "Monto adicional",           width: 14 },
  { key: "monedaSec",    header: "Moneda adicional",          width: 12 },
  { key: "vence",        header: "Fecha vencimiento",         width: 16 },
  { key: "estado",       header: "Estado*",                   width: 12 },
  { key: "recurrente",   header: "Recurrente",                width: 10 },
  { key: "tipoRec",      header: "Tipo recurrente",           width: 14 },
  { key: "intervalo",    header: "Intervalo (meses)",         width: 14 },
  { key: "notas",        header: "Notas",                     width: 28 },
];

function colLetter(idx) { // 1-based
  let s = "", n = idx;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function addListValidation(ws, colIdx, list, allowBlank = true) {
  const letter = colLetter(colIdx);
  const formula = `"${list.join(",")}"`;
  for (let r = 2; r <= IMPORT_LAST_ROW; r++) {
    ws.getCell(`${letter}${r}`).dataValidation = {
      type: "list", allowBlank, formulae: [formula],
      showErrorMessage: true, errorStyle: "error",
      error: "Selecciona un valor de la lista desplegable.",
      promptTitle: "Valor permitido", prompt: "Usa la lista desplegable de esta celda.",
    };
  }
}

router.get("/import/plantilla.xlsx", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Intranet CTGlobal";

    // ── Instrucciones ──
    const wsI = wb.addWorksheet("Instrucciones");
    wsI.columns = [{ width: 100 }];
    const lineas = [
      "PLANTILLA DE IMPORTACIÓN DE GASTOS HISTÓRICOS",
      "",
      "1. Completa la hoja 'Gastos', una fila por registro. Borra la fila de ejemplo antes de importar (o déjala: se ignora automáticamente).",
      "2. Las columnas Categoría, Moneda, Estado, Recurrente y Tipo recurrente SOLO aceptan los valores de su lista desplegable (clic en la celda → flecha). No escribas el valor a mano: evita errores de mayúsculas/tildes.",
      "3. Campos con * son obligatorios.",
      "4. Persona (cédula): solo para categoría 'Pago contratista' — debe coincidir exactamente con la cédula registrada en Usuarios.",
      "5. Proyecto (código): opcional — debe coincidir con el código del proyecto en Geovisores.",
      "6. Si marcas Recurrente = 'Sí', esa fila queda como cabeza de una nueva serie recurrente y el sistema seguirá generando las ocurrencias siguientes (Fijo = mismo valor, Variable = queda 'por completar'). Marca Recurrente = 'Sí' solo en la fila MÁS RECIENTE de cada concepto recurrente.",
      "7. Fechas en formato AAAA-MM-DD (ej. 2026-08-26).",
      "8. Si algo falla, la importación completa se rechaza y se listan los errores fila por fila — no se crea ningún registro parcial.",
    ];
    lineas.forEach((t, i) => {
      const row = wsI.addRow([t]);
      if (i === 0) row.font = { bold: true, size: 13 };
    });

    // ── Hoja de datos ──
    const ws = wb.addWorksheet("Gastos");
    ws.columns = IMPORT_COLS.map(c => ({ header: c.header, key: c.key, width: c.width }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    ws.addRow({
      fecha: "2026-08-26", categoria: CAT_LABEL.RECIBO_PUBLICO, subcategoria: "Energía",
      concepto: "EJEMPLO — borra esta fila", proveedor: "Enel", cedula: "", proyecto: "",
      monto: 217000, moneda: "COP", montoSec: "", monedaSec: "",
      vence: "2026-08-26", estado: ESTADO_LABEL.PAGADO,
      recurrente: "Sí", tipoRec: TIPO_REC_LABEL.VARIABLE, intervalo: 1,
      notas: "",
    }).font = { italic: true, color: { argb: "FF94A3B8" } };

    const idx = Object.fromEntries(IMPORT_COLS.map((c, i) => [c.key, i + 1]));
    addListValidation(ws, idx.categoria, IMPORT_CATEGORIAS.map(c => CAT_LABEL[c]), false);
    addListValidation(ws, idx.moneda, MONEDAS, false);
    addListValidation(ws, idx.monedaSec, MONEDAS, true);
    addListValidation(ws, idx.estado, Object.values(ESTADO_LABEL), false);
    addListValidation(ws, idx.recurrente, ["Sí", "No"], true);
    addListValidation(ws, idx.tipoRec, Object.values(TIPO_REC_LABEL), true);
    addListValidation(ws, idx.intervalo, IMPORT_INTERVALOS, true);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="plantilla_gastos_historicos.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

function cellText(cell) {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object" && "result" in v) return String(v.result ?? "").trim();
  if (typeof v === "object" && "text" in v) return String(v.text).trim();
  if (typeof v === "object" && v.richText) return v.richText.map(r => r.text).join("").trim();
  return String(v).trim();
}
function cellNum(cell) {
  const v = cell.value;
  if (v == null || v === "") return null;
  const raw = (typeof v === "object" && "result" in v) ? v.result : v;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function cellDate(cell) {
  const v = cell.value;
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const raw = (typeof v === "object" && "result" in v) ? v.result : v;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

router.post("/import", authMiddleware, editorMiddleware, uploadXlsx.single("archivo"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "Adjunta el archivo .xlsx de la plantilla" });
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.getWorksheet("Gastos");
    if (!ws) return res.status(400).json({ error: "El archivo no tiene una hoja 'Gastos'. Usa la plantilla oficial." });

    const idx = Object.fromEntries(IMPORT_COLS.map((c, i) => [c.key, i + 1]));
    const parsed = [];
    const errores = [];
    const cedulas = new Set();
    const codigos = new Set();

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const get = (key) => row.getCell(idx[key]);
      const concepto = cellText(get("concepto"));
      const fecha = cellDate(get("fecha"));
      const categoriaLabel = cellText(get("categoria"));
      const monto = cellNum(get("monto"));
      const vacia = !concepto && !fecha && !categoriaLabel && monto == null;
      if (vacia) return;
      if (/^EJEMPLO\b/i.test(concepto)) return;

      const fila = { rowNum, concepto, fecha, categoriaLabel, monto };
      fila.subcategoria = cellText(get("subcategoria"));
      fila.proveedor    = cellText(get("proveedor"));
      fila.cedula       = cellText(get("cedula"));
      fila.proyecto     = cellText(get("proyecto"));
      fila.moneda       = cellText(get("moneda")) || "COP";
      fila.montoSec     = cellNum(get("montoSec"));
      fila.monedaSec    = cellText(get("monedaSec")) || null;
      fila.vence        = cellDate(get("vence"));
      fila.estadoLabel  = cellText(get("estado")) || ESTADO_LABEL.PAGADO;
      fila.recurrenteTxt = cellText(get("recurrente")) || "No";
      fila.tipoRecLabel = cellText(get("tipoRec"));
      fila.intervalo    = cellNum(get("intervalo"));
      fila.notas        = cellText(get("notas"));

      if (fila.cedula) cedulas.add(fila.cedula);
      if (fila.proyecto) codigos.add(fila.proyecto);
      parsed.push(fila);
    });

    if (parsed.length === 0) return res.status(400).json({ error: "El archivo no tiene filas con datos" });

    const [personas, proyectos] = await Promise.all([
      cedulas.size ? q(`SELECT id, cedula FROM users WHERE cedula = ANY($1)`, [[...cedulas]]) : [],
      codigos.size ? q(`SELECT id, codigo FROM geo_projects WHERE codigo = ANY($1)`, [[...codigos]]) : [],
    ]);
    const personaByCedula = Object.fromEntries(personas.map(p => [p.cedula, p.id]));
    const proyectoByCodigo = Object.fromEntries(proyectos.map(p => [p.codigo, p.id]));

    for (const f of parsed) {
      const pfx = `Fila ${f.rowNum}: `;
      if (!f.fecha) errores.push(pfx + "fecha inválida o vacía (usa AAAA-MM-DD)");
      if (!f.concepto) errores.push(pfx + "concepto vacío");
      if (!CATEGORIA_LABEL_TO_CODE[f.categoriaLabel]) errores.push(pfx + `categoría inválida "${f.categoriaLabel}" — usa el menú desplegable`);
      if (f.monto == null || f.monto <= 0) errores.push(pfx + "monto inválido (debe ser un número mayor a 0)");
      if (!MONEDAS.includes(f.moneda)) errores.push(pfx + `moneda inválida "${f.moneda}"`);
      if (f.monedaSec && !MONEDAS.includes(f.monedaSec)) errores.push(pfx + `moneda adicional inválida "${f.monedaSec}"`);
      if (!ESTADO_LABEL_TO_CODE[f.estadoLabel]) errores.push(pfx + `estado inválido "${f.estadoLabel}" — usa el menú desplegable`);
      if (f.cedula && !personaByCedula[f.cedula]) errores.push(pfx + `no existe ningún usuario con cédula "${f.cedula}"`);
      if (f.proyecto && !proyectoByCodigo[f.proyecto]) errores.push(pfx + `no existe ningún proyecto con código "${f.proyecto}"`);

      const esRecurrente = f.recurrenteTxt === "Sí";
      if (esRecurrente) {
        if (!TIPO_REC_LABEL_TO_CODE[f.tipoRecLabel]) errores.push(pfx + `tipo recurrente inválido "${f.tipoRecLabel}" — usa el menú desplegable`);
        if (!IMPORT_INTERVALOS.includes(f.intervalo)) errores.push(pfx + `intervalo (meses) inválido — usa el menú desplegable`);
      } else if (f.recurrenteTxt && f.recurrenteTxt !== "No") {
        errores.push(pfx + `columna Recurrente inválida "${f.recurrenteTxt}" — usa el menú desplegable`);
      }
    }

    if (errores.length > 0) return res.status(400).json({ error: "La plantilla tiene errores, no se importó nada", errores });

    const client = await pool.connect();
    let insertados = 0;
    try {
      await client.query("BEGIN");
      for (const f of parsed) {
        const [anio, mes] = f.fecha.split("-").map(Number);
        const esRecurrente = f.recurrenteTxt === "Sí";
        const { rows } = await client.query(`
          INSERT INTO gastos
            (categoria, subcategoria, concepto, proveedor, monto, moneda,
             monto_secundario, moneda_secundaria, fecha, fecha_vencimiento,
             periodo_mes, periodo_anio, estado, persona_id, equipo_id, proyecto_id,
             recurrente, recurrente_tipo, intervalo_meses, archivo, notas, registrado_por_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
          RETURNING id
        `, [
          CATEGORIA_LABEL_TO_CODE[f.categoriaLabel], f.subcategoria, f.concepto, f.proveedor,
          f.monto, f.moneda, f.montoSec, f.monedaSec,
          f.fecha, f.vence, mes, anio,
          ESTADO_LABEL_TO_CODE[f.estadoLabel],
          f.cedula ? personaByCedula[f.cedula] : null,
          null,
          f.proyecto ? proyectoByCodigo[f.proyecto] : null,
          esRecurrente,
          esRecurrente ? TIPO_REC_LABEL_TO_CODE[f.tipoRecLabel] : null,
          esRecurrente ? f.intervalo : 1,
          "", f.notas, req.user.id,
        ]);
        const id = rows[0].id;
        if (esRecurrente) await client.query("UPDATE gastos SET serie_id = $1 WHERE id = $1", [id]);
        insertados++;
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    res.status(201).json({ insertados });
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
//  RECURRENTES — generar manualmente la siguiente ocurrencia de una serie
//  (mismo cálculo que el scheduler diario, pero disparado por el usuario;
//  útil al cargar histórico y no querer esperar al cron de las 06:00).
// ════════════════════════════════════════════════════════════
router.post("/series/:serieId/siguiente", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const serieId = +req.params.serieId;
    const ultimas = await q(`
      SELECT DISTINCT ON (serie_id) *
      FROM gastos
      WHERE recurrente = TRUE AND serie_id = $1
      ORDER BY serie_id, (periodo_anio * 12 + periodo_mes) DESC, id DESC
    `, [serieId]);
    const actual = ultimas[0];
    if (!actual) return res.status(404).json({ error: "Serie recurrente no encontrada" });

    const now = new Date();
    const periodoActual = now.getFullYear() * 12 + (now.getMonth() + 1);
    const { anio, mes } = siguientePeriodo(actual);
    if ((anio * 12 + mes) > periodoActual) {
      return res.status(400).json({
        error: `Aún no corresponde generarla — la próxima es ${mes}/${anio}`,
        proximo_mes: mes, proximo_anio: anio,
      });
    }

    const nueva = await generarOcurrencia(q, actual);
    res.status(201).json(nueva);
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
