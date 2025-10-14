// src/infrastructure/http/routes/userRoutes.js

import { Router } from "express";
import * as userManager from "#app/managers/userManager.js";
import { adminAuth } from "#infra/http/middleware/adminAuth.js";

const router = Router();

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Obtiene todos los usuarios
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Buscar por nombre de usuario
 *       - in: query
 *         name: minBalance
 *         schema:
 *           type: number
 *         description: Balance mínimo
 *       - in: query
 *         name: maxBalance
 *         schema:
 *           type: number
 *         description: Balance máximo
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Límite de resultados
 *     responses:
 *       200:
 *         description: Lista de usuarios
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   balance:
 *                     type: number
 *                   lastLogin:
 *                     type: string
 *                     format: date-time
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   updatedAt:
 *                     type: string
 *                     format: date-time
 */

router.get("/", adminAuth, async (req, res) => {
  try {
    const { search, minBalance, maxBalance, page = 1, limit = 20 } = req.query;
    
    const filters = {
      search: search || undefined,
      minBalance: minBalance ? parseFloat(minBalance) : undefined,
      maxBalance: maxBalance ? parseFloat(maxBalance) : undefined,
      page: Math.max(1, parseInt(page)),
      limit: Math.min(100, Math.max(1, parseInt(limit))),
    };

    const result = await userManager.getAllUsers(filters);
    res.json(result);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ error: "Error interno al obtener usuarios" });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Obtiene un usuario por ID
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del usuario
 *     responses:
 *       200:
 *         description: Detalles del usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 balance:
 *                   type: number
 *                 lastLogin:
 *                   type: string
 *                   format: date-time
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 rouletteRounds:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await userManager.getUserById(id);

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error getting user:", error);
    res.status(500).json({ error: "Error interno al obtener usuario" });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Elimina un usuario
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del usuario
 *     responses:
 *       200:
 *         description: Usuario eliminado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Usuario no encontrado
 */
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await userManager.deleteUser(id);

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({ message: `Usuario ${user.name} eliminado exitosamente` });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Error interno al eliminar usuario" });
  }
});

export default router;
