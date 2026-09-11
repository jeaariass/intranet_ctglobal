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

// Un usuario tiene un rol principal (req.user.rol) y puede tener roles
// adicionales (req.user.roles_adicionales, ej. un CONTRATISTA con
// CONTABILIDAD extra). hasRole() cuenta ambos.
function hasRole(user, roles) {
  if (!user) return false;
  const propios = [user.rol, ...(user.roles_adicionales || [])];
  return roles.some((r) => propios.includes(r));
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

// Acceso de solo lectura a información financiera (Facturación): por
// defecto ADMIN/EDITOR/CONTABILIDAD/TESORERIA, o cualquiera que tenga
// alguno de esos roles como adicional (ej. un contratista con CONTABILIDAD).
const ROLES_FINANZAS = ["ADMIN", "EDITOR", "CONTABILIDAD", "TESORERIA"];
function financeMiddleware(req, res, next) {
  if (!hasRole(req.user, ROLES_FINANZAS))
    return res.status(403).json({ error: "No tienes acceso a Facturación" });
  next();
}

module.exports = {
  authMiddleware, adminMiddleware, editorMiddleware, financeMiddleware,
  hasRole, ROLES_FINANZAS,
};
