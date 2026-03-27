require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const prisma = require("./lib/prisma");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Seguridad: headers ────────────────────────────────────────
// X-Frame-Options DENY solo para rutas API, NO para /uploads
// (los PDFs de facturas necesitan poder mostrarse en iframe)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  if (!req.path.startsWith("/uploads")) {
    res.setHeader("X-Frame-Options", "DENY");
  }
  next();
});

// ── Rate limiting ─────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, max: 20,
  message: { error: "Demasiados intentos. Espera 15 minutos." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 300,
  message: { error: "Demasiadas solicitudes." },
});

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ── Rutas ─────────────────────────────────────────────────────
app.use("/api/auth",          loginLimiter, require("./routes/auth"));
app.use("/api/users",         apiLimiter,   require("./routes/users"));
app.use("/api/announcements", apiLimiter,   require("./routes/announcements"));
app.use("/api/documents",     apiLimiter,   require("./routes/documents"));
app.use("/api/events",        apiLimiter,   require("./routes/events"));
app.use("/api/wiki",          apiLimiter,   require("./routes/wiki"));
app.use("/api/equipment",     apiLimiter,   require("./routes/equipment"));
app.use("/api/geoprojects",   apiLimiter,   require("./routes/geoprojects"));
app.use("/api/geoauth",       loginLimiter, require("./routes/geoauth"));
app.use("/api/sessions",      apiLimiter,   require("./routes/sessions"));
app.use("/api/invoices",     apiLimiter,   require("./routes/invoices"));
app.use("/api/reports",       apiLimiter,   require("./routes/reports"));

// ── Health check ──────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "2.0.0", ts: new Date() });
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(413).json({ error: "Archivo demasiado grande (máx 20MB)" });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production"
      ? "Error interno del servidor"
      : err.message,
  });
});

app.use("/api/*", (req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

// ── Arrancar ──────────────────────────────────────────────────
async function start() {
  await prisma.$connect();
  console.log("✅ Conectado a PostgreSQL");
  app.listen(PORT, () =>
    console.log(`✅ Servidor CTGlobal v2 en http://localhost:${PORT}`)
  );
}

start().catch((e) => { console.error("❌ Error al iniciar:", e.message); process.exit(1); });