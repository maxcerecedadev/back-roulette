import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import gameRoutes from "./routes/gameRoutes.js";
import { singlePlayerHandler } from "./handlers/singlePlayerHandler.js";

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

// 💡 Centraliza las salas aquí
const singlePlayerRooms = new Map();

// Monta las rutas de la API
app.use("/api/v1", gameRoutes);

io.on("connection", (socket) => {
  console.log(`✅ Nuevo jugador conectado a la sala: ${socket.id}`);

  singlePlayerHandler(io, socket, singlePlayerRooms);
});

server.listen(PORT, () => {
  console.log("Servidor escuchando en el puerto " + PORT);
});
