// backend/src/routes/equipment.js
const router  = require("express").Router();
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const ExcelJS = require("exceljs");
const prisma  = require("../lib/prisma");
const { Pool } = require("pg");
const { authMiddleware, editorMiddleware, adminMiddleware } = require("../middleware/auth");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

// ── Uploads (fotos + factura de compra) ──────────────────────
const uploadsDir = path.join(__dirname, "../../uploads/equipment");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9_\-]/g, "_")
      .substring(0, 60);
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const IMG_EXT = [".jpg", ".jpeg", ".png", ".webp"];
const DOC_EXT = [...IMG_EXT, ".pdf"];

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = file.fieldname === "factura" ? DOC_EXT.includes(ext) : IMG_EXT.includes(ext);
    ok ? cb(null, true) : cb(new Error("Formato de archivo no permitido"));
  },
});

const uploadFields = upload.fields([
  { name: "foto1",   maxCount: 1 },
  { name: "foto2",   maxCount: 1 },
  { name: "foto3",   maxCount: 1 },
  { name: "factura", maxCount: 1 },
]);

// Borra un archivo del disco sin reventar si no existe
function rmFile(name) {
  if (!name) return;
  const fp = path.join(uploadsDir, name);
  if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch { /* noop */ } }
}

// ── Includes / mapeo comunes ─────────────────────────────────
const CLASIF_INCLUDE = {
  equipment_categorias: { select: { id: true, nombre: true, prefijo: true, icono: true } },
  equipment_subtipos:   { select: { id: true, nombre: true } },
};

function mapEquipo({ geo_projects, equipment_categorias, equipment_subtipos, _count, ...e }) {
  return {
    ...e,
    proyectoActual: geo_projects || null,
    categoria:      equipment_categorias || null,
    subtipo:        equipment_subtipos || null,
    _count:         _count ? { logs: _count.equipment_logs } : undefined,
  };
}

// ── Identificador interno de inventario ──────────────────────
function ymd(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date();
  const iso = isNaN(d) ? new Date() : d;
  return iso.toISOString().slice(0, 10).replace(/-/g, "");
}

async function proponerIdentificador(categoriaId, fecha) {
  const cat = await prisma.equipmentCategoria.findUnique({ where: { id: +categoriaId } });
  if (!cat) return null;
  const prefijo = `${cat.prefijo}-${ymd(fecha)}-`;
  const usados = await prisma.equipment.findMany({
    where: { identificador: { startsWith: prefijo } },
    select: { identificador: true },
  });
  let max = 0;
  for (const u of usados) {
    const n = parseInt(String(u.identificador).slice(prefijo.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefijo}${String(max + 1).padStart(3, "0")}`;
}

// Tiempo transcurrido desde la compra, formato "1 año 3 meses"
function tiempoConEquipo(fechaCompra) {
  if (!fechaCompra) return "—";
  const desde = new Date(fechaCompra);
  const hoy = new Date();
  if (isNaN(desde) || desde > hoy) return "—";
  let meses = (hoy.getFullYear() - desde.getFullYear()) * 12 + (hoy.getMonth() - desde.getMonth());
  if (hoy.getDate() < desde.getDate()) meses -= 1;
  if (meses < 0) meses = 0;
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  const partes = [];
  if (a) partes.push(`${a} ${a === 1 ? "año" : "años"}`);
  if (m) partes.push(`${m} ${m === 1 ? "mes" : "meses"}`);
  return partes.length ? partes.join(" ") : "menos de 1 mes";
}

const publicBase = (req) =>
  process.env.PUBLIC_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;

// ════════════════════════════════════════════════════════════
//  CATEGORÍAS Y SUBTIPOS  (rutas literales — antes de "/:id")
// ════════════════════════════════════════════════════════════

// GET /api/equipment/categorias
router.get("/categorias", authMiddleware, async (req, res, next) => {
  try {
    const cats = await prisma.equipmentCategoria.findMany({
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      include: {
        equipment_subtipos: { orderBy: [{ orden: "asc" }, { nombre: "asc" }] },
        _count: { select: { equipment: true } },
      },
    });
    res.json(cats.map(({ equipment_subtipos, _count, ...c }) => ({
      ...c,
      subtipos: equipment_subtipos,
      _count: { equipos: _count.equipment },
    })));
  } catch (e) { next(e); }
});

// POST /api/equipment/categorias
router.post("/categorias", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { nombre, prefijo, icono, orden } = req.body;
    if (!nombre?.trim() || !prefijo?.trim())
      return res.status(400).json({ error: "Nombre y prefijo requeridos" });
    const cat = await prisma.equipmentCategoria.create({
      data: {
        nombre:  nombre.trim(),
        prefijo: prefijo.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "EQ",
        icono:   icono?.trim() || "📦",
        orden:   orden ? +orden : 0,
      },
    });
    res.status(201).json(cat);
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "Ya existe una categoría con ese nombre" });
    next(e);
  }
});

// PUT /api/equipment/categorias/:id
router.put("/categorias/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { nombre, prefijo, icono, orden } = req.body;
    const cat = await prisma.equipmentCategoria.update({
      where: { id: +req.params.id },
      data: {
        ...(nombre  !== undefined && { nombre: nombre.trim() }),
        ...(prefijo !== undefined && { prefijo: prefijo.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "EQ" }),
        ...(icono   !== undefined && { icono: icono.trim() || "📦" }),
        ...(orden   !== undefined && { orden: +orden || 0 }),
      },
    });
    res.json(cat);
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "Ya existe una categoría con ese nombre" });
    next(e);
  }
});

// DELETE /api/equipment/categorias/:id
router.delete("/categorias/:id", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const enUso = await prisma.equipment.count({ where: { categoria_id: +req.params.id } });
    if (enUso)
      return res.status(409).json({ error: `No se puede eliminar: ${enUso} equipo(s) usan esta categoría` });
    await prisma.equipmentCategoria.delete({ where: { id: +req.params.id } });
    res.json({ message: "Categoría eliminada" });
  } catch (e) { next(e); }
});

// POST /api/equipment/categorias/:id/subtipos
router.post("/categorias/:id/subtipos", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { nombre, orden } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: "Nombre requerido" });
    const sub = await prisma.equipmentSubtipo.create({
      data: { categoria_id: +req.params.id, nombre: nombre.trim(), orden: orden ? +orden : 0 },
    });
    res.status(201).json(sub);
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "Ese subtipo ya existe en la categoría" });
    next(e);
  }
});

// PUT /api/equipment/subtipos/:id
router.put("/subtipos/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { nombre, orden } = req.body;
    const sub = await prisma.equipmentSubtipo.update({
      where: { id: +req.params.id },
      data: {
        ...(nombre !== undefined && { nombre: nombre.trim() }),
        ...(orden  !== undefined && { orden: +orden || 0 }),
      },
    });
    res.json(sub);
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "Ese subtipo ya existe en la categoría" });
    next(e);
  }
});

// DELETE /api/equipment/subtipos/:id
router.delete("/subtipos/:id", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const enUso = await prisma.equipment.count({ where: { subtipo_id: +req.params.id } });
    if (enUso)
      return res.status(409).json({ error: `No se puede eliminar: ${enUso} equipo(s) usan este subtipo` });
    await prisma.equipmentSubtipo.delete({ where: { id: +req.params.id } });
    res.json({ message: "Subtipo eliminado" });
  } catch (e) { next(e); }
});

// GET /api/equipment/next-identificador?categoriaId=&fecha=
router.get("/next-identificador", authMiddleware, async (req, res, next) => {
  try {
    const { categoriaId, fecha } = req.query;
    if (!categoriaId) return res.status(400).json({ error: "categoriaId requerido" });
    const identificador = await proponerIdentificador(categoriaId, fecha);
    if (!identificador) return res.status(404).json({ error: "Categoría no encontrada" });
    res.json({ identificador });
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  EXPORT EXCEL  (ruta literal — antes de "/:id")
// ════════════════════════════════════════════════════════════

// GET /api/equipment/export.xlsx
router.get("/export.xlsx", authMiddleware, async (req, res, next) => {
  try {
    const itemsRaw = await prisma.equipment.findMany({
      include: { geo_projects: { select: { codigo: true } }, ...CLASIF_INCLUDE },
      orderBy: { nombre: "asc" },
    });
    const items = itemsRaw.sort((a, b) =>
      (a.equipment_categorias?.nombre || "~").localeCompare(b.equipment_categorias?.nombre || "~") ||
      a.nombre.localeCompare(b.nombre)
    );

    const { rows: invRows } = await pool.query(`
      SELECT equipo_id, concepto, archivo_pdf, estado
      FROM invoices
      WHERE equipo_id IS NOT NULL
      ORDER BY fecha_emision DESC
    `);
    const invByEquipo = {};
    for (const r of invRows) (invByEquipo[r.equipo_id] ||= []).push(r);

    const base = publicBase(req);
    const wb = new ExcelJS.Workbook();
    wb.creator = "Intranet CTGlobal";
    const ws = wb.addWorksheet("Inventario");

    ws.columns = [
      { header: "Identificador",         key: "identificador", width: 20 },
      { header: "Categoría",             key: "categoria",     width: 16 },
      { header: "Subtipo",               key: "subtipo",       width: 16 },
      { header: "Nombre",                key: "nombre",        width: 28 },
      { header: "Marca / Modelo",        key: "marcaModelo",   width: 26 },
      { header: "Serial",                key: "serial",        width: 18 },
      { header: "Estado",                key: "estado",        width: 16 },
      { header: "Ubicación",             key: "ubicacion",     width: 20 },
      { header: "Fecha de compra",       key: "fechaCompra",   width: 15 },
      { header: "Valor de compra",       key: "valorCompra",   width: 16 },
      { header: "Tiempo con el equipo",  key: "tiempo",        width: 18 },
      { header: "Descripción",           key: "descripcion",   width: 40 },
      { header: "Foto 1",                key: "foto1",         width: 18 },
      { header: "Foto 2",                key: "foto2",         width: 18 },
      { header: "Foto 3",                key: "foto3",         width: 18 },
      { header: "Factura de compra",     key: "factura",       width: 20 },
      { header: "Facturas (Facturación)", key: "invoices",     width: 40 },
      { header: "Próx. mantenimiento",   key: "proxMant",      width: 18 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const fotoColIdx = { foto1: 13, foto2: 14, foto3: 15 };

    items.forEach((it, i) => {
      const rowNum = i + 2;
      const row = ws.addRow({
        identificador: it.identificador || "—",
        categoria:     it.equipment_categorias?.nombre || "—",
        subtipo:       it.equipment_subtipos?.nombre || "—",
        nombre:        it.nombre,
        marcaModelo:   [it.marca, it.modelo].filter(Boolean).join(" ") || "—",
        serial:        it.serial || "—",
        estado:        it.estado,
        ubicacion:     it.ubicacion || "—",
        fechaCompra:   it.fecha_compra ? new Date(it.fecha_compra).toISOString().slice(0, 10) : "—",
        valorCompra:   it.valor_compra != null ? Number(it.valor_compra) : "—",
        tiempo:        tiempoConEquipo(it.fecha_compra),
        descripcion:   it.descripcion || "",
        proxMant:      it.proximo_mantenimiento
          ? new Date(it.proximo_mantenimiento).toISOString().slice(0, 10) : "—",
      });
      row.alignment = { vertical: "middle", wrapText: true };

      // Fotos: miniatura incrustada si es imagen, si no enlace
      let tieneFoto = false;
      for (const campo of ["foto1", "foto2", "foto3"]) {
        const archivo = it[campo];
        if (!archivo) continue;
        const fp = path.join(uploadsDir, archivo);
        const ext = path.extname(archivo).toLowerCase().replace(".", "");
        if (fs.existsSync(fp) && ["jpg", "jpeg", "png", "gif"].includes(ext)) {
          const imgId = wb.addImage({ filename: fp, extension: ext === "jpg" ? "jpeg" : ext });
          ws.addImage(imgId, {
            tl: { col: fotoColIdx[campo] - 1 + 0.05, row: rowNum - 1 + 0.05 },
            ext: { width: 116, height: 84 },
          });
          tieneFoto = true;
        } else {
          row.getCell(fotoColIdx[campo]).value = {
            text: "Ver archivo", hyperlink: `${base}/uploads/equipment/${archivo}`,
          };
        }
      }
      if (tieneFoto) row.height = 68;

      // Factura de compra pegada al equipo
      if (it.factura_archivo) {
        row.getCell(16).value = {
          text: "Ver factura", hyperlink: `${base}/uploads/equipment/${it.factura_archivo}`,
        };
      } else {
        row.getCell(16).value = "—";
      }

      // Facturas del módulo de Facturación
      const invs = invByEquipo[it.id] || [];
      if (invs.length) {
        const withPdf = invs.find((x) => x.archivo_pdf);
        row.getCell(17).value = withPdf
          ? {
              text: invs.map((x) => `• ${x.concepto} (${x.estado})`).join("\n"),
              hyperlink: `${base}/uploads/invoices/${withPdf.archivo_pdf}`,
            }
          : invs.map((x) => `• ${x.concepto} (${x.estado})`).join("\n");
      } else {
        row.getCell(17).value = "—";
      }
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="inventario-equipos-${new Date().toISOString().slice(0, 10)}.xlsx"`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════
//  EQUIPOS
// ════════════════════════════════════════════════════════════

// GET /api/equipment
router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const { tipo, estado, q, categoriaId, subtipoId } = req.query;
    const where = {};
    if (tipo)        where.tipo         = tipo;
    if (estado)      where.estado       = estado;
    if (categoriaId) where.categoria_id = +categoriaId;
    if (subtipoId)   where.subtipo_id   = +subtipoId;
    if (q) {
      where.OR = [
        { nombre:        { contains: q, mode: "insensitive" } },
        { identificador: { contains: q, mode: "insensitive" } },
        { serial:        { contains: q, mode: "insensitive" } },
      ];
    }

    const items = await prisma.equipment.findMany({
      where,
      include: {
        geo_projects: { select: { nombre: true, codigo: true } },
        ...CLASIF_INCLUDE,
        _count: { select: { equipment_logs: true } },
      },
      orderBy: { nombre: "asc" },
    });
    res.json(items.map(mapEquipo));
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
        geo_projects: { select: { nombre: true, codigo: true } },
        ...CLASIF_INCLUDE,
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
    const { equipment_logs, ...rest } = item;
    res.json({
      ...mapEquipo(rest),
      logs: equipment_logs.map(({ geo_projects: gp, users: u, ...l }) => ({
        ...l,
        proyecto: gp || null,
        usuario:  u ? { nombre: u.nombre, apellido: u.apellido } : null,
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
router.post("/", authMiddleware, editorMiddleware, uploadFields, async (req, res, next) => {
  try {
    const d = req.body;
    const f = req.files || {};

    let identificador = d.identificador?.trim() || null;
    if (!identificador && d.categoriaId) {
      identificador = await proponerIdentificador(d.categoriaId, d.fechaCompra);
    }

    const item = await prisma.equipment.create({
      data: {
        nombre:                d.nombre,
        marca:                 d.marca                || "",
        modelo:                d.modelo               || "",
        serial:                d.serial               || "",
        estado:                d.estado               || "DISPONIBLE",
        descripcion:           d.descripcion          || "",
        ubicacion:             d.ubicacion            || "",
        categoria_id:          d.categoriaId          ? +d.categoriaId : null,
        subtipo_id:            d.subtipoId            ? +d.subtipoId   : null,
        identificador,
        fecha_compra:          d.fechaCompra          ? new Date(d.fechaCompra)          : null,
        valor_compra:          d.valorCompra          ? +d.valorCompra                   : null,
        proximo_mantenimiento: d.proximoMantenimiento ? new Date(d.proximoMantenimiento) : null,
        foto1:                 f.foto1?.[0]?.filename   || "",
        foto2:                 f.foto2?.[0]?.filename   || "",
        foto3:                 f.foto3?.[0]?.filename   || "",
        factura_archivo:       f.factura?.[0]?.filename || "",
        vida_util_meses:       d.vidaUtilMeses ? +d.vidaUtilMeses : null,
        valor_residual:        d.valorResidual ? +d.valorResidual : 0,
        depreciable:           !(d.depreciable === "false" || d.depreciable === false),
      },
    });
    res.status(201).json(item);
  } catch (e) {
    if (e.code === "P2002")
      return res.status(409).json({ error: "El identificador ya está en uso" });
    next(e);
  }
});

// PUT /api/equipment/:id
router.put("/:id", authMiddleware, editorMiddleware, uploadFields, async (req, res, next) => {
  try {
    const id = +req.params.id;
    const d = req.body;
    const f = req.files || {};
    const actual = await prisma.equipment.findUnique({ where: { id } });
    if (!actual) return res.status(404).json({ error: "No encontrado" });

    const data = {
      nombre:                d.nombre,
      marca:                 d.marca,
      modelo:                d.modelo,
      serial:                d.serial,
      estado:                d.estado,
      descripcion:           d.descripcion,
      ubicacion:             d.ubicacion,
      categoria_id:          d.categoriaId      ? +d.categoriaId  : null,
      subtipo_id:            d.subtipoId        ? +d.subtipoId    : null,
      fecha_compra:          d.fechaCompra          ? new Date(d.fechaCompra)          : null,
      valor_compra:          d.valorCompra          ? +d.valorCompra                   : null,
      proximo_mantenimiento: d.proximoMantenimiento ? new Date(d.proximoMantenimiento) : null,
      proyecto_actual_id:    d.proyectoActualId     ? +d.proyectoActualId              : null,
    };
    if (d.identificador  !== undefined) data.identificador   = d.identificador.trim() || null;
    if (d.vidaUtilMeses  !== undefined) data.vida_util_meses = d.vidaUtilMeses ? +d.vidaUtilMeses : null;
    if (d.valorResidual  !== undefined) data.valor_residual  = d.valorResidual ? +d.valorResidual : 0;
    if (d.depreciable    !== undefined) data.depreciable     = !(d.depreciable === "false" || d.depreciable === false);

    // Reemplazo de archivos: solo si vino uno nuevo; borra el anterior
    for (const campo of ["foto1", "foto2", "foto3"]) {
      if (f[campo]?.[0]) {
        rmFile(actual[campo]);
        data[campo] = f[campo][0].filename;
      }
    }
    if (f.factura?.[0]) {
      rmFile(actual.factura_archivo);
      data.factura_archivo = f.factura[0].filename;
    }

    const item = await prisma.equipment.update({ where: { id }, data });
    res.json(item);
  } catch (e) {
    if (e.code === "P2002")
      return res.status(409).json({ error: "El identificador ya está en uso" });
    next(e);
  }
});

// DELETE /api/equipment/:id/foto/:n — quita una foto puntual
router.delete("/:id/foto/:n", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const n = +req.params.n;
    if (![1, 2, 3].includes(n)) return res.status(400).json({ error: "Foto inválida" });
    const campo = `foto${n}`;
    const actual = await prisma.equipment.findUnique({ where: { id: +req.params.id } });
    if (!actual) return res.status(404).json({ error: "No encontrado" });
    rmFile(actual[campo]);
    await prisma.equipment.update({ where: { id: +req.params.id }, data: { [campo]: "" } });
    res.json({ message: "Foto eliminada" });
  } catch (e) { next(e); }
});

// POST /api/equipment/:id/log
router.post("/:id/log", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { accion, proyectoId, notas, nuevoEstado } = req.body;

    await prisma.equipmentLog.updateMany({
      where: { equipo_id: +req.params.id, fecha_fin: null },
      data:  { fecha_fin: new Date() },
    });

    const log = await prisma.equipmentLog.create({
      data: {
        equipo_id:   +req.params.id,
        proyecto_id: proyectoId ? +proyectoId : null,
        usuario_id:  req.user.id,
        accion,
        notas: notas || "",
      },
    });

    const updateData = {};
    if (nuevoEstado) updateData.estado = nuevoEstado;
    if (nuevoEstado === "DISPONIBLE" || nuevoEstado === "EN_MANTENIMIENTO") {
      updateData.proyecto_actual_id = null;
    } else if (proyectoId && nuevoEstado === "EN_CAMPO") {
      updateData.proyecto_actual_id = +proyectoId;
    }

    if (Object.keys(updateData).length) {
      await prisma.equipment.update({ where: { id: +req.params.id }, data: updateData });
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
