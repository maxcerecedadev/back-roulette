// src/routes/gameRoutes.js

import { Router } from "express";
import { adminAuth } from "../middleware/adminAuth.js";
import * as gameManager from "../services/gameManager.js";
import prisma from "../prisma/index.js";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";

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

router.post("/auth/validate-token", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    console.warn("⚠️ [AUTH] No token provided in request body");
    return res.status(400).json({ error: "Token is required" });
  }

  try {
    const response = await axios.post(
      process.env.PROVIDER_API_URL,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    );

    const { success, usuario, creditos } = response.data;

    if (!success) {
      console.warn(
        "❌ [AUTH] External API rejected token ending in:",
        token.slice(-8)
      );
      return res.status(401).json({ error: "Token inválido o expirado" });
    }

    const balance = parseFloat(creditos);
    if (isNaN(balance)) {
      console.error("❌ [AUTH] Invalid credit value received:", creditos);
      return res
        .status(500)
        .json({ error: "Créditos inválidos del proveedor" });
    }

    const userName = usuario;

    const user = await prisma.user.upsert({
      where: { externalToken: token },
      update: {
        name: userName,
        lastLogin: new Date(),
        balance: balance,
      },
      create: {
        id: uuidv4(),
        name: userName,
        externalToken: token,
        balance: balance,
      },
    });

    const userId = user.id;

    console.info("✅ [AUTH] User validated successfully:", {
      userId,
      userName,
      externalToken: token.slice(-8),
    });

    res.json({
      success: true,
      userId,
      userName,
      balance,
    });
  } catch (error) {
    console.error("💥 [AUTH] Error calling external API:", {
      message: error.message,
      code: error.code,
      status: error.response?.status,
    });

    if (error.response?.status === 401) {
      console.warn(
        "🔒 [AUTH] 401 Unauthorized — Token rejected by external service"
      );
      return res.status(401).json({ error: "Token inválido o expirado" });
    }

    if (error.code === "ECONNABORTED") {
      console.error("⏳ [AUTH] Timeout connecting to external service");
      return res.status(504).json({
        error: "Tiempo de espera agotado al conectar con el proveedor",
      });
    }

    if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") {
      console.error("🌐 [AUTH] DNS or network issue reaching external service");
      return res.status(502).json({
        error: "No se puede contactar con el proveedor de usuarios",
      });
    }

    console.error("🚨 [AUTH] Unexpected validation error", error);
    res
      .status(500)
      .json({ error: "Error interno del servidor al validar usuario" });
  }
});

export default router;
