// src/routes/gameRoutes.js

import { Router } from "express";
import { adminAuth } from "../middleware/adminAuth.js";
import * as gameManager from "../services/gameManager.js";
import prisma from "../prisma/index.js";

const router = Router();

// Rutas para admin

router.get("/status", adminAuth, (req, res) => {
  const { roomId } = req.query;
  const status = gameManager.getStatus(roomId);

  if (!status) {
    return res.status(404).json({ error: "Sala no encontrada." });
  }

  res.json(status);
});

router.get("/peek/:roomId", adminAuth, (req, res) => {
  const { roomId } = req.params;
  const results = gameManager.peekResults(roomId);
  if (!results) {
    return res.status(404).json({ error: "Room not found" });
  }
  res.json({ roomId, nextResults: results });
});

router.delete("/:roomId", adminAuth, (req, res) => {
  const { roomId } = req.params;

  const wasRemoved = gameManager.removeRoom(roomId);

  if (!wasRemoved) {
    return res.status(404).json({ error: "Sala no encontrada." });
  }

  res.json({ message: `Sala ${roomId} eliminada con éxito.` });
});

// Rutas para jugador

/**
 * @route GET /api/v1/game/rounds
 * @desc Obtiene el historial de rondas de un jugador
 * @query {string} playerId - ID del jugador (requerido)
 * @query {number} limit - Límite de resultados (opcional, default: 10)
 * @query {number} page - Página (opcional, default: 1)
 * @access Public (por ahora)
 */
router.get("/rounds", async (req, res) => {
  const {
    playerId,
    limit = 10,
    page = 1,
    startDate,
    endDate,
    result,
  } = req.query;

  if (!playerId) {
    return res.status(400).json({
      error: "El parámetro 'playerId' es obligatorio.",
    });
  }

  const limitNum = parseInt(limit);
  const pageNum = parseInt(page);
  const skip = (pageNum - 1) * limitNum;

  const where = { playerId: playerId };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  if (result && result !== "all") {
    if (result === "win") {
      where.netResult = { gt: 0 };
    } else if (result === "lose") {
      where.netResult = { lt: 0 };
    }
  }

  try {
    const [rounds, total] = await Promise.all([
      prisma.rouletteRound.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limitNum,
        select: {
          id: true,
          roundId: true,
          sessionId: true,
          winningNumber: true,
          winningColor: true,
          totalBetAmount: true,
          totalWinnings: true,
          netResult: true,
          playerBalanceBefore: true,
          playerBalanceAfter: true,
          currency: true,
          createdAt: true,
          betResults: true,
        },
      }),
      prisma.rouletteRound.count({ where }),
    ]);

    res.json({
      success: true,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
      rounds,
    });
  } catch (error) {
    console.error("Error al obtener historial:", error);
    res.status(500).json({
      error: "Error interno del servidor",
    });
  }
});

export default router;
