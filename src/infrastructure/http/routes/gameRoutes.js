// src/infrastructure/http/routes/gameRoutes.js

import axios from "axios";
import { Router } from "express";
import * as gameManager from "#app/managers/gameManager.js";
import { v4 as uuidv4 } from "uuid";
import { adminAuth } from "#infra/http/middleware/adminAuth.js";
import prisma from "#prisma";

const router = Router();

const API_BASE_URL = process.env.CASINO_API_BASE_URL;

// Rutas para admin

router.get("/status", adminAuth, (req, res) => {
  const { roomId } = req.query;
  const status = gameManager.getStatus(roomId);

  console.log(`[ADMIN] 📋 Estado de sala ${roomId}:`, JSON.stringify(status, null, 2));

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
  const { playerId, limit = 10, page = 1, startDate, endDate, result } = req.query;

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
      `${API_BASE_URL}/usuario/ruleta-user-info`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      },
    );

    const { success, usuario, creditos } = response.data;

    if (!success) {
      console.warn("❌ [AUTH] External API rejected token ending in:", token.slice(-8));
      return res.status(401).json({ error: "Token inválido o expirado" });
    }

    const balance = parseFloat(creditos);
    if (isNaN(balance)) {
      console.error("❌ [AUTH] Invalid credit value received:", creditos);
      return res.status(500).json({ error: "Créditos inválidos del proveedor" });
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
      console.warn("🔒 [AUTH] 401 Unauthorized — Token rejected by external service");
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
    res.status(500).json({ error: "Error interno del servidor al validar usuario" });
  }
});

let dailyCounters = {};

router.post("/tournament/create", async (req, res) => {
  const { maxPlayers = 3, maxRounds = 10 } = req.body;

  try {
    // 1. Obtener fecha actual en formato YYMMDD
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2); // "25"
    const month = String(now.getMonth() + 1).padStart(2, "0"); // "04"
    const day = String(now.getDate()).padStart(2, "0"); // "05"
    const dateKey = `${year}${month}${day}`; // "250405"

    // 2. Incrementar contador para hoy
    if (!dailyCounters[dateKey]) {
      dailyCounters[dateKey] = 1;
    } else {
      dailyCounters[dateKey]++;
    }

    const sequence = String(dailyCounters[dateKey]).padStart(3, "0"); // "001", "002", ...

    // 3. Formar el ID legible
    const tournamentId = `T_${dateKey}_${sequence}`; // "T_250405_001"

    // Opcional: Guardar en DB
    // await prisma.tournament.create({
    //   data: {
    //     id: tournamentId,
    //     maxPlayers,
    //     maxRounds,
    //     createdAt: now,
    //   },
    // });

    res.json({
      success: true,
      tournamentId,
      maxPlayers,
      maxRounds,
      message: "Torneo creado exitosamente",
    });
  } catch (error) {
    console.error("❌ Error creando torneo:", error);
    res.status(500).json({ error: "Error interno al crear torneo" });
  }
});

export default router;
