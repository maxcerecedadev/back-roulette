// src/server.js

import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import gameRoutes from "./routes/gameRoutes.js";
import { config } from "dotenv";
import { singlePlayerHandler } from "./handlers/singlePlayerHandler.js";
import { tournamentHandler } from "./handlers/tournamentHandler.js";
import prisma from "../prisma/index.js";

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

io.on("connection", (socket) => {
  console.log("🔌 Nuevo cliente conectado:", socket.id);

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

async function startServer() {
  try {
    await prisma.$connect();
    console.log("✅ Conectado a la base de datos");

    server.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
      console.log(`📡 Socket.IO escuchando conexiones`);
    });
  } catch (error) {
    console.error("❌ Error al iniciar el servidor:", error);
    process.exit(1);
  }
}

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
