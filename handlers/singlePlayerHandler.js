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

    // Guardar referencia del player en el socket
    socket.player = player;

    // Usar socket.id solo para la sala
    const roomId = socket.id;

    try {
      const room = gameManager.getOrCreateSingleRoom(roomId, io);
      room.addPlayer(player, socket);
      socket.join(roomId);

      if (callback) {
        callback({
          message: "Unido",
          roomId,
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

  const getPlayerId = () => socket.player?.id;

  socket.on("place-bet", (betData) => {
    const { betKey, amount, roomId } = betData;
    const room = gameManager.getRoom(roomId);
    if (!room || room.gameState !== "betting") {
      socket.emit("error", { message: "No se pueden colocar apuestas ahora." });
      return;
    }
    if (!getPlayerId()) return;
    room.placeBet(getPlayerId(), betKey, amount);
  });

  socket.on("clear-bets", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room || !getPlayerId()) return;
    room.clearBets(getPlayerId());
  });

  socket.on("undo-bet", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room || !getPlayerId()) return;
    room.undoBet(getPlayerId());
  });

  socket.on("repeat-bet", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room || !getPlayerId()) return;
    room.repeatBet(getPlayerId());
  });

  socket.on("double-bet", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room || !getPlayerId()) return;
    room.doubleBet(getPlayerId());
  });

  // Lógica de desconexión
  socket.on("disconnect", () => {
    const room = gameManager.getRoom(socket.id);
    if (room && getPlayerId()) {
      room.stopCountdown();
      room.removePlayer(getPlayerId());
      gameManager.removeRoom(socket.id);
    }
  });
};
