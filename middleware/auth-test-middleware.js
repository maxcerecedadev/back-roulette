/**
 * Middleware de autenticación simple para desarrollo.
 * En un entorno de producción, esto sería un sistema de autenticación robusto (JWT, OAuth, etc.).
 */
export const simpleAuthMiddleware = (req, res, next) => {
  // Definimos el usuario y contraseña de prueba
  const TEST_USER = "test";
  const TEST_PASS = "12345678";

  // Suponemos que el usuario y la contraseña vienen en el cuerpo de la petición
  const { username, password } = req.body;

  if (username === TEST_USER && password === TEST_PASS) {
    // Si las credenciales son correctas, pasamos a la siguiente función
    console.log(`✅ Usuario de prueba '${TEST_USER}' autenticado.`);
    next();
  } else {
    // Si no son correctas, devolvemos un error de autenticación
    console.error(
      `❌ Intento de autenticación fallido para el usuario '${username}'.`
    );
    res
      .status(401)
      .json({ error: "Credenciales de autenticación no válidas." });
  }
};
