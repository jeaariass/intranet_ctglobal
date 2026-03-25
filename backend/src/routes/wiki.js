const router = require("express").Router();
const prisma = require("../lib/prisma");
const { authMiddleware, editorMiddleware } = require("../middleware/auth");

// GET /api/wiki/categories
router.get("/categories", authMiddleware, async (req, res, next) => {
  try {
    const cats = await prisma.wikiCategory.findMany({
      orderBy: { orden: "asc" },
      include: { _count: { select: { wiki_pages: true } } },
    });
    res.json(cats.map(({ _count, ...c }) => ({ ...c, pages_count: _count.wiki_pages })));
  } catch (e) { next(e); }
});

// POST /api/wiki/categories
router.post("/categories", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { nombre, icono, orden } = req.body;
    const slug = nombre.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const cat = await prisma.wikiCategory.create({
      data: { nombre, slug, icono: icono || "📄", orden: orden || 0 },
    });
    res.status(201).json(cat);
  } catch (e) { next(e); }
});

// GET /api/wiki/pages
router.get("/pages", authMiddleware, async (req, res, next) => {
  try {
    const { categoriaId, q } = req.query;
    const where = { publicado: true };
    if (categoriaId) where.categoria_id = +categoriaId;
    if (q) where.titulo = { contains: q, mode: "insensitive" };
    const pages = await prisma.wikiPage.findMany({
      where,
      include: {
        users:           { select: { nombre: true, apellido: true } },
        wiki_categories: { select: { nombre: true, icono: true } },
      },
      orderBy: { updated_at: "desc" },
    });
    res.json(pages.map(({ users, wiki_categories, ...p }) => ({
      ...p,
      autor:     users           ? { nombre: users.nombre, apellido: users.apellido } : null,
      categoria: wiki_categories || null,
    })));
  } catch (e) { next(e); }
});

// GET /api/wiki/pages/:slug
router.get("/pages/:slug", authMiddleware, async (req, res, next) => {
  try {
    const page = await prisma.wikiPage.findUnique({
      where: { slug: req.params.slug },
      include: {
        users:           { select: { nombre: true, apellido: true } },
        wiki_categories: true,
        wiki_revisions: {
          orderBy: { revision: "desc" },
          take: 5,
          include: { users: { select: { nombre: true } } },
        },
      },
    });
    if (!page) return res.status(404).json({ error: "Página no encontrada" });

    const { users, wiki_categories, wiki_revisions, ...rest } = page;
    res.json({
      ...rest,
      autor:     users           ? { nombre: users.nombre, apellido: users.apellido } : null,
      categoria: wiki_categories || null,
      revisions: wiki_revisions.map(({ users: u, ...r }) => ({
        ...r, autor: u ? { nombre: u.nombre } : null,
      })),
    });
  } catch (e) { next(e); }
});

// POST /api/wiki/pages
router.post("/pages", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { titulo, contenido, categoriaId } = req.body;
    const slug = titulo.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").substring(0, 80);
    const page = await prisma.wikiPage.create({
      data: {
        titulo, slug,
        contenido:   contenido   || "",
        categoria_id: categoriaId ? +categoriaId : null,
        autor_id:    req.user.id,
      },
    });
    res.status(201).json(page);
  } catch (e) { next(e); }
});

// PUT /api/wiki/pages/:id
router.put("/pages/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    const { titulo, contenido, categoriaId, publicado } = req.body;
    const existing = await prisma.wikiPage.findUnique({ where: { id: +req.params.id } });
    if (!existing) return res.status(404).json({ error: "No encontrada" });

    // Guardar revisión anterior
    await prisma.wikiRevision.create({
      data: {
        page_id:  existing.id,
        contenido: existing.contenido,
        revision:  existing.revision,
        autor_id:  req.user.id,
      },
    });

    const page = await prisma.wikiPage.update({
      where: { id: +req.params.id },
      data: {
        titulo, contenido,
        categoria_id: categoriaId ? +categoriaId : null,
        publicado:    publicado !== undefined ? publicado : true,
        revision:     { increment: 1 },
        autor_id:     req.user.id,
      },
    });
    res.json(page);
  } catch (e) { next(e); }
});

// DELETE /api/wiki/pages/:id
router.delete("/pages/:id", authMiddleware, editorMiddleware, async (req, res, next) => {
  try {
    await prisma.wikiPage.update({
      where: { id: +req.params.id },
      data: { publicado: false },
    });
    res.json({ message: "Página archivada" });
  } catch (e) { next(e); }
});

module.exports = router;
