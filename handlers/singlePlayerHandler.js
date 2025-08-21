// src/handlers/singlePlayerHandler.js

import { User } from "../classes/User.js";
import * as gameManager from "../services/gameManager.js";

/**
 * @param {object} socket - La instancia del socket del cliente que se ha conectado.
 * @param {object} io - La instancia completa del servidor de Socket.IO, para emitir eventos a todos los clientes.
 */
export const singlePlayerHandler = (io, socket) => {
  socket.on("single-join", (data, callback) => {
    const { userId, userName, balance } = data;
    const player = new User(userId, userName, balance);
    const roomId = socket.id;

    try {
      const room = gameManager.getOrCreateSingleRoom(roomId, io);
      room.addPlayer(player);
      socket.join(roomId);

      if (callback) {
        callback({
          message: "Unido",
          roomId: roomId,
          user: player.toSocketData(),
        });
      }
    } catch (error) {
      console.error("❌ Error al unirse a la sala:", error.message);
      if (callback) {
        callback({ error: error.message });
      }
    }
  });

  socket.on("place-bet", (betData) => {
    const { betKey, amount, roomId } = betData;
    const room = gameManager.getRoom(roomId);
    if (!room || room.gameState !== "betting") {
      socket.emit("error", { message: "No se pueden colocar apuestas ahora." });
      return;
    }
    room.placeBet(socket.id, betKey, amount);
  });

  socket.on("clear-bets", (data) => {
    const { roomId } = data;
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    room.clearBets(socket.id);
  });

  socket.on("undo-bet", (data) => {
    const { roomId } = data;
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    room.undoBet(socket.id);
  });

  socket.on("repeat-bet", (data) => {
    const { roomId } = data;
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    room.repeatBet(socket.id);
  });

  socket.on("double-bet", (data) => {
    const { roomId } = data;
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    room.doubleBet(socket.id);
  });

  // 💡 Lógica crucial para el flujo: detiene el temporizador al desconectarse.
  socket.on("disconnect", () => {
    const room = gameManager.getRoom(socket.id);
    if (room) {
      room.stopCountdown();
      room.removePlayer(socket.id);
      gameManager.removeRoom(socket.id);
    }
  });
};
