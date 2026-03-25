const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "secret_dev";

function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token requerido" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(403).json({ error: "Token inválido o expirado" });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user?.rol !== "ADMIN")
    return res.status(403).json({ error: "Requiere rol administrador" });
  next();
}

function editorMiddleware(req, res, next) {
  if (!["ADMIN", "EDITOR"].includes(req.user?.rol))
    return res.status(403).json({ error: "Requiere rol editor o superior" });
  next();
}

module.exports = { authMiddleware, adminMiddleware, editorMiddleware };
