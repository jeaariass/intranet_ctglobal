const router = require("express").Router();
const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
const prisma = require("../lib/prisma");
const { authMiddleware, editorMiddleware } = require("../middleware/auth");

const uploadsDir = path.join(__dirname, "../../uploads/documents");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    // Conserva el nombre original limpiando caracteres especiales
    const ext = path.extname(file.originalname);
    const nombre = path.basename(file.originalname, ext)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")  // quita tildes
      .replace(/[^a-zA-Z0-9_\-]/g, "_") // reemplaza espacios y símbolos por _
      .substring(0, 80);                 // máximo 80 caracteres
    cb(null, `${nombre}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx",
                     ".jpg",".jpeg",".png",".zip",".rar",".dwg",
                     ".geojson",".kml",".kmz",".csv",".txt",".shp"];
    allowed.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true) : cb(new Error("Tipo de archivo no permitido"));
  },
});

router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const { categoria, proyectoId, q } = req.query;
    const where = {};
    if (categoria)  where.categoria   = categoria;
    if (proyectoId) where.proyecto_id = +proyectoId;
    if (q)          where.nombre      = { contains: q, mode: "insensitive" };
    const docs = await prisma.document.findMany({
      where,
      include: {
        users:        { select: { nombre: true, apellido: true } },
        geo_projects: { select: { nombre: true, codigo: true } },
      },
      orderBy: { created_at: "desc" },
    });
    res.json(docs.map(({ users, geo_projects, ...d }) => ({
      ...d,
      subido_por_nombre: users        ? `${users.nombre} ${users.apellido}` : null,
      proyecto_nombre:   geo_projects ? geo_projects.nombre : null,
    })));
  } catch (e) { next(e); }
});

router.post("/", authMiddleware, editorMiddleware, upload.single("archivo"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Archivo requerido" });
    const { nombre, descripcion, categoria, proyectoId } = req.body;
    const doc = await prisma.document.create({
      data: {
        nombre,
        descripcion:   descripcion || "",
        categoria:     categoria   || "GENERAL",
        archivo:       req.file.filename,
        tamano:        req.file.size,
        proyecto_id:   proyectoId ? +proyectoId : null,
        subido_por_id: req.user.id,
      },
    });
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

router.delete("/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: +req.params.id } });
    if (doc) {
      const fp = path.join(uploadsDir, doc.archivo);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      await prisma.document.delete({ where: { id: +req.params.id } });
    }
    res.json({ message: "Eliminado" });
  } catch (e) { next(e); }
});

module.exports = router;
