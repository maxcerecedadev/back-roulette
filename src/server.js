// src/server.js
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { config } from "dotenv";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import prisma from "#prisma";
import { singlePlayerHandler } from "#infra/ws/singlePlayerHandler.js";
import { tournamentHandler } from "#infra/ws/tournamentHandler.js";
import routes from "#infra/http/routes/index.js";
import { initGameManager, getRooms } from "./application/managers/gameManager.js";
import * as gameManager from "./application/managers/gameManager.js";
import { specs, swaggerUi } from "../docs/swagger.js";

config();

const PORT = process.env.PORT || 2000;
const API_BASE_URL = process.env.CASINO_API_BASE_URL;

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: "*",
    credentials: false,
  },
});

app.use("/api/v1", routes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
app.get("/", (req, res) => res.redirect("/api-docs"));

// =============== CONTROL ESTRICTO: 1 TOKEN = 1 PESTAÑA ===============

const activeSessions = new Map(); // token -> { socketId, connectedAt, userName }
const pendingConnections = new Map(); // token -> Promise (evita race conditions)
const disconnectCooldown = new Map(); // token -> timestamp

const COOLDOWN_DURATION = 3000; // 3 segundos antes de permitir reconexión

// Limpiar cooldowns expirados
setInterval(() => {
  const now = Date.now();
  for (const [token, timestamp] of disconnectCooldown.entries()) {
    if (now - timestamp > COOLDOWN_DURATION) {
      disconnectCooldown.delete(token);
    }
  }
}, 2000);

// =============== MIDDLEWARE DE AUTENTICACIÓN ===============

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  const adminToken = socket.handshake.auth?.adminToken;

  // 1️⃣ Verificar si es admin
  if (adminToken === process.env.ADMIN_TOKEN) {
    socket.data.isAdmin = true;
    console.log("✅ Admin autenticado:", socket.id);
    return next();
  }

  // 2️⃣ Verificar token de usuario
  if (!token) {
    console.warn("❌ Conexión rechazada: No token provided");
    return next(new Error("Token requerido"));
  }

  // 3️⃣ Verificar cooldown
  if (disconnectCooldown.has(token)) {
    const disconnectedAt = disconnectCooldown.get(token);
    const timeSince = Date.now() - disconnectedAt;
    const remaining = Math.ceil((COOLDOWN_DURATION - timeSince) / 1000);

    if (remaining > 0) {
      console.warn(`⏳ Reconexión bloqueada temporalmente: ${token.slice(-8)} (${remaining}s)`);
      return next(new Error(`Por favor espera ${remaining} segundos antes de reconectar`));
    } else {
      disconnectCooldown.delete(token);
    }
  }

  // 4️⃣ Verificar si ya hay una conexión pendiente
  if (pendingConnections.has(token)) {
    console.warn(`⚠️ Conexión simultánea detectada para token: ${token.slice(-8)}`);
    return next(
      new Error("Ya hay una conexión en proceso para este usuario. Usa solo una pestaña."),
    );
  }

  // 5️⃣ Crear lock para esta conexión
  const connectionLock = (async () => {
    try {
      // Verificar si ya existe una sesión activa
      if (activeSessions.has(token)) {
        const existingSession = activeSessions.get(token);
        const oldSocket = io.sockets.sockets.get(existingSession.socketId);

        console.warn(`🚫 Intento de conexión múltiple detectado para: ${existingSession.userName}`);
        console.log(`   └─ Socket existente: ${existingSession.socketId}`);
        console.log(`   └─ Nuevo intento: ${socket.id}`);

        if (oldSocket && oldSocket.connected) {
          oldSocket.emit("session:force-close", {
            message: "Se detectó una nueva conexión. Esta sesión será cerrada.",
            reason: "multiple_tabs",
            allowReconnect: false,
          });
          oldSocket.disconnect(true);
        }

        disconnectCooldown.set(token, Date.now());
        activeSessions.delete(token);

        throw new Error(
          "Se detectó uso de múltiples pestañas. Por favor espera 3 segundos y usa solo una pestaña.",
        );
      }

      // Validar token con servicio externo
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
        throw new Error("Token inválido o expirado");
      }

      const balance = parseFloat(creditos);
      if (isNaN(balance)) {
        throw new Error("Datos de usuario inválidos");
      }

      // Crear/actualizar usuario en DB
      const user = await prisma.user.upsert({
        where: { name: usuario },
        update: {
          name: usuario,
          lastLogin: new Date(),
          balance: balance,
          externalToken: token,
        },
        create: {
          id: uuidv4(),
          name: usuario,
          balance: balance,
          externalToken: token,
        },
      });

      // Adjuntar datos al socket
      socket.data.userId = user.id;
      socket.data.userName = user.name;
      socket.data.balance = user.balance;
      socket.data.token = token;

      // Registrar como sesión activa
      activeSessions.set(token, {
        socketId: socket.id,
        connectedAt: Date.now(),
        userName: user.name,
      });

      console.log(`✅ Usuario autenticado: ${user.name} (${user.id}) - Socket: ${socket.id}`);

      return true;
    } finally {
      pendingConnections.delete(token);
    }
  })();

  pendingConnections.set(token, connectionLock);

  try {
    await connectionLock;
    next();
  } catch (error) {
    console.error("💥 Error en autenticación:", error.message);

    if (error.message.includes("múltiples pestañas")) {
      console.log(`🔒 Conexión bloqueada: ${token.slice(-8)}`);
    }

    pendingConnections.delete(token);
    next(error instanceof Error ? error : new Error("Error al validar usuario"));
  }
});

// =============== MANEJADORES DE SOCKET.IO ===============

io.on("connection", (socket) => {
  // 🔒 Admin flow
  if (socket.data.isAdmin) {
    socket.join("admin-room");
    console.log("✅ Admin conectado a admin-room:", socket.id);
    socket.emit("admin:rooms-update", getRooms());
    return;
  }

  // 👤 Usuario normal - ya autenticado
  console.log(`🔌 Usuario conectado: ${socket.data.userName} (${socket.id})`);

  // Enviar datos de sesión al cliente
  socket.emit("session", {
    userId: socket.data.userId,
    userName: socket.data.userName,
    balance: socket.data.balance,
  });

  // ==================== EVENTOS DE CONSULTA (sin estado) ====================
  
  socket.on("tournament:list-active", (callback) => {
    console.log(`📋 [Server] ${socket.data.userName} consulta torneos disponibles`);
    
    try {
      const activeTournaments = [];
      const tournamentRooms = getRooms().tournament || [];
      
      console.log(`🔍 [Server] Encontradas ${tournamentRooms.length} salas de torneo`);
      
      for (const roomId of tournamentRooms) {
        try {
          const room = gameManager.getRoom(roomId);
          if (room && typeof room.getPublicInfo === 'function') {
            const info = room.getPublicInfo();
            activeTournaments.push(info);
            console.log(`✅ [Server] Sala ${roomId}: ${info.players}/${info.maxPlayers} jugadores, estado: ${info.status}`);
          }
        } catch (error) {
          console.error(`❌ [Server] Error obteniendo info de sala ${roomId}:`, error.message);
        }
      }

      console.log(`📤 [Server] Enviando ${activeTournaments.length} torneos al cliente`);
      
      if (callback) {
        callback({ tournaments: activeTournaments });
      }
    } catch (error) {
      console.error("❌ [Server] Error en tournament:list-active:", error);
      if (callback) {
        callback({ error: "Error al obtener torneos" });
      }
    }
  });

  // ==================== EVENTOS DE INTERACCIÓN (con estado) ====================
  
  socket.on("join-mode", (mode, callback) => {
    console.log(`🎯 ${socket.data.userName} seleccionó modo: ${mode}`);

    if (mode === "single") {
      singlePlayerHandler(io, socket);
      callback?.({ success: true });
    } else if (mode === "tournament") {
      tournamentHandler(io, socket);
      callback?.({ success: true });
    } else {
      console.warn(`⚠️ Modo inválido: ${mode}`);
      callback?.({ error: "Modo no soportado" });
      socket.emit("error", { message: "Modo no soportado" });
      socket.disconnect(true);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`🔌 ${socket.data.userName} desconectado (razón: ${reason})`);

    if (socket.data.token) {
      const session = activeSessions.get(socket.data.token);

      if (session && session.socketId === socket.id) {
        activeSessions.delete(socket.data.token);
        console.log(`🗑️ Sesión liberada: ${socket.data.token.slice(-8)}`);

        if (reason === "client namespace disconnect" || reason === "transport close") {
          console.log(`✅ Desconexión limpia, token disponible inmediatamente`);
        }
      }
    }
  });
});

initGameManager(io);


async function startServer() {
  try {
    await prisma.$connect();
    console.log("✅ Conectado a la base de datos");

    server.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
      console.log(`📖 Swagger docs: http://localhost:${PORT}/api-docs`);
      console.log(`📡 Socket.IO escuchando con autenticación`);
      console.log(`🔐 Modo: 1 TOKEN = 1 PESTAÑA (conexiones múltiples bloqueadas)`);
      console.log(`🔒 Protección anti-race condition: ACTIVADA`);
      console.log(`⏳ Cooldown de reconexión: ${COOLDOWN_DURATION / 1000}s`);
    });
  } catch (error) {
    console.error("❌ Error al iniciar el servidor:", error);
    process.exit(1);
  }
}

async function shutdown() {
  try {
    activeSessions.clear();
    pendingConnections.clear();
    disconnectCooldown.clear();
    console.log("🧹 Sesiones activas limpiadas");

    await prisma.$disconnect();
    console.log("🔌 Base de datos desconectada");
  } catch (error) {
    console.error("❌ Error al desconectar la base de datos:", error);
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();
