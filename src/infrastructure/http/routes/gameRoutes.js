// src/infrastructure/http/routes/gameRoutes.js
import axios from "axios";
import { Router } from "express";
import * as gameManager from "#app/managers/gameManager.js";
import { v4 as uuidv4 } from "uuid";
import { adminAuth } from "#infra/http/middleware/adminAuth.js";
import prisma from "#prisma";

const router = Router();

const API_BASE_URL = process.env.CASINO_API_BASE_URL;

/**
 * @swagger
 * /status:
 *   get:
 *     summary: Obtiene el estado de una sala
 *     tags: [Game Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sala
 *     responses:
 *       200:
 *         description: Estado de la sala
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Sala no encontrada
 */
router.get("/status", adminAuth, (req, res) => {
  const { roomId } = req.query;
  const status = gameManager.getStatus(roomId);

  console.log(`[ADMIN] 📋 Estado de sala ${roomId}:`, JSON.stringify(status, null, 2));

  if (!status) {
    return res.status(404).json({ error: "Sala no encontrada." });
  }

  res.json(status);
});

/**
 * @swagger
 * /peek/{roomId}:
 *   get:
 *     summary: Obtiene los resultados futuros de una sala
 *     tags: [Game Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sala
 *     responses:
 *       200:
 *         description: Resultados futuros
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roomId:
 *                   type: string
 *                 nextResults:
 *                   type: array
 *       404:
 *         description: Sala no encontrada
 */
router.get("/peek/:roomId", adminAuth, (req, res) => {
  const { roomId } = req.params;
  const results = gameManager.peekResults(roomId);
  if (!results) {
    return res.status(404).json({ error: "Room not found" });
  }
  res.json({ roomId, nextResults: results });
});

/**
 * @swagger
 * /{roomId}:
 *   delete:
 *     summary: Elimina una sala
 *     tags: [Game Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sala
 *     responses:
 *       200:
 *         description: Sala eliminada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Sala no encontrada
 */
router.delete("/:roomId", adminAuth, (req, res) => {
  const { roomId } = req.params;

  const wasRemoved = gameManager.removeRoom(roomId);

  if (!wasRemoved) {
    return res.status(404).json({
      error: "Sala no encontrada.",
      roomId,
    });
  }

  res.json({
    message: `Sala ${roomId} eliminada con éxito.`,
    roomId,
    success: true,
  });
});

/**
 * @swagger
 * /rounds:
 *   get:
 *     summary: Obtiene historial de rondas de un jugador
 *     tags: [Player]
 *     parameters:
 *       - in: query
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del jugador
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Límite de resultados
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha inicial
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha final
 *       - in: query
 *         name: result
 *         schema:
 *           type: string
 *           enum: [win, lose, all]
 *         description: Filtrar por resultado
 *     responses:
 *       200:
 *         description: Historial de rondas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *                 rounds:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       roundId:
 *                         type: string
 *                       sessionId:
 *                         type: string
 *                       winningNumber:
 *                         type: integer
 *                       winningColor:
 *                         type: string
 *                       totalBetAmount:
 *                         type: number
 *                       totalWinnings:
 *                         type: number
 *                       netResult:
 *                         type: number
 *                       playerBalanceBefore:
 *                         type: number
 *                       playerBalanceAfter:
 *                         type: number
 *                       currency:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       betResults:
 *                         type: object
 *       400:
 *         description: Parámetro faltante
 *       500:
 *         description: Error interno
 */
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

/**
 * @swagger
 * /auth/validate-token:
 *   post:
 *     summary: Valida token externo y crea/actualiza usuario
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token externo
 *           example:
 *             token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Usuario validado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 userId:
 *                   type: string
 *                 userName:
 *                   type: string
 *                 balance:
 *                   type: number
 *       400:
 *         description: Token faltante
 *       401:
 *         description: Token inválido
 *       500:
 *         description: Error interno
 */
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
      where: { name: userName },
      update: {
        name: userName,
        lastLogin: new Date(),
        balance: balance,
        externalToken: token,
      },
      create: {
        id: uuidv4(),
        name: userName,
        balance: balance,
        externalToken: token,
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

/**
 * @swagger
 * /tournament/create:
 *   post:
 *     summary: Crea un nuevo torneo
 *     tags: [Player]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - maxPlayers
 *               - maxRounds
 *               - entryFee
 *             properties:
 *               maxPlayers:
 *                 type: integer
 *                 minimum: 3
 *                 maximum: 10
 *               maxRounds:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *               entryFee:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Torneo creado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 tournamentId:
 *                   type: string
 *                 tournamentCode:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Parámetros inválidos
 *       500:
 *         description: Error interno
 */
router.post("/tournament/create", async (req, res) => {
  const { maxPlayers, maxRounds, entryFee } = req.body;

  if (maxPlayers === undefined || maxRounds === undefined || entryFee === undefined) {
    return res.status(400).json({
      error: "Los campos maxPlayers, maxRounds y entryFee son obligatorios",
    });
  }

  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) {
    return res.status(400).json({
      error: "maxPlayers debe ser un número entero entre 2 y 10",
    });
  }

  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 100) {
    return res.status(400).json({
      error: "maxRounds debe ser un número entero entre 1 y 100",
    });
  }

  if (!Number.isInteger(entryFee) || entryFee < 1) {
    return res.status(400).json({
      error: "entryFee debe ser un número entero positivo",
    });
  }

  try {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dateKey = `${year}${month}${day}`;

    let counter = await prisma.dailyTournamentCounter.upsert({
      where: { dateKey },
      update: {
        count: {
          increment: 1,
        },
      },
      create: {
        dateKey,
        count: 1,
      },
    });

    const sequence = String(counter.count).padStart(3, "0");
    const tournamentCode = `T_${dateKey}_${sequence}`;

    const tournament = await prisma.tournament.create({
      data: {
        code: tournamentCode,
        rounds: maxRounds,
        currentRound: 0,
        maxPlayers,
        status: "waiting",
        results: [],
        createdAt: now,
        entryFee,
      },
    });

    console.log(`✅ Torneo creado: ${tournamentCode} (ID: ${tournament.id})`);

    res.json({
      success: true,
      tournamentId: tournament.id,
      tournamentCode,
      maxPlayers,
      maxRounds,
      entryFee,
      message: "Torneo creado exitosamente",
    });
  } catch (error) {
    console.error("❌ Error creando torneo:", error);
    res.status(500).json({ error: "Error interno al crear torneo" });
  }
});

export default router;
