// src/server.js

import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { config } from "dotenv";
import prisma from "#prisma";
import { singlePlayerHandler } from "#infra/ws/singlePlayerHandler.js";
import { tournamentHandler } from "#infra/ws/tournamentHandler.js";
import gameRoutes from "#infra/http/routes/gameRoutes.js";
import { initGameManager, getRooms } from "./application/managers/gameManager.js";
import { specs, swaggerUi } from "../docs/swagger.js";

/**
 * Servidor principal de la aplicación de ruleta.
 * Configura Express, Socket.IO y maneja las conexiones de clientes.
 * Soporta dos modos de juego: individual y torneo.
 */

config();

const PORT = process.env.PORT || 2000;

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

app.use("/api/v1", gameRoutes);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

app.get("/", (req, res) => {
  res.redirect("/api-docs");
});

// =============== CONFIGURACIÓN DE SOCKET.IO ===============

io.on("connection", (socket) => {
  console.log("🔌 Nuevo cliente conectado:", socket.id);

  const adminToken = socket.handshake.auth?.adminToken;
  if (adminToken === process.env.ADMIN_TOKEN) {
    socket.join("admin-room");
    console.log("✅ Admin conectado:", socket.id);
    socket.emit("admin:rooms-update", getRooms());
    return;
  }

  socket.on("join-mode", (mode, callback) => {
    console.log(`🎯 [server] join-mode recibido: ${mode}`);

    if (mode === "single") {
      singlePlayerHandler(io, socket);
      if (callback && typeof callback === "function") {
        callback({ success: true });
      }
    } else if (mode === "tournament") {
      tournamentHandler(io, socket);
      if (callback && typeof callback === "function") {
        callback({ success: true });
      }
    } else {
      if (callback && typeof callback === "function") {
        callback({ error: "Modo no soportado" });
      }
      socket.emit("error", { message: "Modo no soportado" });
      socket.disconnect(true);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔌 Cliente desconectado:", socket.id);
  });
});

initGameManager(io);

// =============== INICIO DEL SERVIDOR ===============

/**
 * Inicia el servidor y establece la conexión con la base de datos.
 * Configura los listeners y muestra información de estado.
 */
async function startServer() {
  try {
    await prisma.$connect();
    console.log("✅ Conectado a la base de datos");

    server.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
      console.log(`Swagger docs disponible en http://localhost:${PORT}/api-docs`);
      console.log(`📡 Socket.IO escuchando conexiones`);
    });
  } catch (error) {
    console.error("❌ Error al iniciar el servidor:", error);
    process.exit(1);
  }
}

// =============== MANEJO DE CIERRE GRACEFUL ===============

/**
 * Cierra el servidor de forma segura.
 * Desconecta la base de datos y termina el proceso.
 */
async function shutdown() {
  try {
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
