import dotenv from "dotenv";
dotenv.config();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "1234567";

/**
 * Middleware para autenticar las peticiones de administrador.
 * Verifica si el token de la petición coincide con el token de administración.
 */
export function adminAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  let token = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.query && req.query.admin_token) {
    token = req.query.admin_token;
  }

  if (!token || token !== ADMIN_TOKEN) {
    console.warn("🚫 Intento de acceso no autorizado desde", req.ip);
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}
