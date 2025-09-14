// src/handlers/singlePlayerHandler.js

import { Player } from "../classes/Player.js";
import * as gameManager from "../services/gameManager.js";

/**
 * @param {object} socket - La instancia del socket del cliente que se ha conectado.
 * @param {object} io - La instancia completa del servidor de Socket.IO, para emitir eventos a todos los clientes.
 */
export const singlePlayerHandler = (io, socket) => {
  const getPlayerId = () => {
    if (socket.player && socket.player.id) {
      return socket.player.id;
    }
    return undefined;
  };

  socket.on("single-join", (data, callback) => {
    const { userId, userName, balance } = data;
    const player = new Player(userId, userName, balance);

    socket.player = player;

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

  socket.on("place-bet", (betData) => {
    const { betKey, amount, roomId } = betData;
    const room = gameManager.getSingleRoom(roomId);
    if (!room || room.gameState !== "betting") {
      socket.emit("error", { message: "No se pueden colocar apuestas ahora." });
      return;
    }

    const playerId = getPlayerId();
    if (!playerId) {
      console.warn(
        `⚠️ Intento de apuesta sin jugador autenticado desde socket: ${socket.id}`
      );
      socket.emit("error", { message: "Jugador no autenticado." });
      return;
    }

    room.placeBet(playerId, betKey, amount);
  });

  socket.on("clear-bets", ({ roomId }) => {
    const room = gameManager.getSingleRoom(roomId);
    const playerId = getPlayerId();
    if (!room || !playerId) return;
    room.clearBets(playerId);
  });

  socket.on("undo-bet", ({ roomId }) => {
    const room = gameManager.getSingleRoom(roomId);
    const playerId = getPlayerId();
    if (!room || !playerId) return;
    room.undoBet(playerId);
  });

  socket.on("repeat-bet", ({ roomId }) => {
    const room = gameManager.getSingleRoom(roomId);
    const playerId = getPlayerId();
    if (!room || !playerId) return;
    room.repeatBet(playerId);
  });

  socket.on("double-bet", ({ roomId }) => {
    const room = gameManager.getSingleRoom(roomId);
    const playerId = getPlayerId();
    if (!room || !playerId) return;
    room.doubleBet(playerId);
  });

  socket.on("spin", ({ roomId }) => {
    const room = gameManager.getSingleRoom(roomId);
    if (!room) return;

    if (room.gameState === "betting") {
      room.nextState();
    }

    if (room.gameState === "spinning") {
      room.triggerSpin();
    }
  });

  socket.on("disconnect", () => {
    const roomId = socket.id;
    const room = gameManager.getSingleRoom(roomId);

    if (room) {
      if (socket.player) {
        room.stopCountdown();
        room.removePlayer(socket.player.id);
      }

      gameManager.removeRoom(roomId);
      console.log(`🚪 Sala ${roomId} eliminada por desconexión.`);
    }
  });
};
