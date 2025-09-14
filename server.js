import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import gameRoutes from "./routes/gameRoutes.js";
import { singlePlayerHandler } from "./handlers/singlePlayerHandler.js";
import { tournamentPlayerHandler } from "./handlers/tournamentPlayerHandler.js";
import prisma from "./prisma/index.js";
import { config } from "dotenv";
import { initializeTournaments } from "./services/gameManager.js";

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

initializeTournaments(io);

app.use("/api/v1", gameRoutes);

io.on("connection", (socket) => {
  console.log("🔌 Nuevo cliente conectado:", socket.id);

  singlePlayerHandler(io, socket);
  tournamentPlayerHandler(io, socket);

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
