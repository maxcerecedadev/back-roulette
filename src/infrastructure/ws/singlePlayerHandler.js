// src/infrastructure/ws/singlePlayerHandler.js

import * as gameManager from "#app/managers/gameManager.js";
import { Player } from "#domain/entities/Player.js";
import { CasinoApiService } from "#infra/api/casinoApiService.js";

/**
 * @param {object} socket - La instancia del socket del cliente que se ha conectado.
 * @param {object} io - La instancia completa del servidor de Socket.IO, para emitir eventos a todos los clientes.
 */

export const singlePlayerHandler = (io, socket) => {
  console.log(`✅ [singlePlayerHandler] Adjuntado al socket: ${socket.id}`);

  const getPlayerId = () => {
    if (socket.player && socket.player.id) {
      return socket.player.id;
    }
    return undefined;
  };

  socket.on("single-join", async (data, callback) => {
    console.log(`🎯 [singlePlayerHandler] single-join recibido:`, data);
    const { userId, userName, balance } = data;

    if (socket.player) {
      console.log(`♻️ Reemplazando jugador anterior: ${socket.player.id} → ${userId}`);
      delete socket.player;
    }

    let realBalance = balance;
    try {
      realBalance = await CasinoApiService.getPlayerBalance(userId);
    } catch (error) {
      console.error("❌ Error obteniendo balance real del casino:", error);
      realBalance = balance;
    }

    const player = new Player(userId, userName, realBalance);
    socket.player = player;

    const roomId = socket.id;

    try {
      const room = gameManager.getOrCreateSingleRoom(roomId, io);
      room.addPlayer(player, socket);
      socket.join(roomId);

      gameManager.notifyAdminsRoomUpdate();

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
    const room = gameManager.getRoom(roomId);
    if (!room || room.gameState !== "betting") {
      socket.emit("error", { message: "No se pueden colocar apuestas ahora." });
      return;
    }

    const playerId = getPlayerId();
    if (!playerId) {
      console.warn(`⚠️ Intento de apuesta sin jugador autenticado desde socket: ${socket.id}`);
      socket.emit("error", { message: "Jugador no autenticado." });
      return;
    }

    try {
      room.placeBet(playerId, betKey, amount);
      const player = room.getPlayer(playerId);
      if (player) {
        gameManager.notifyAdminPlayerBalanceUpdate(roomId, playerId, player.balance);
      }
    } catch (error) {
      console.error("Error placing bet:", error);
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("clear-bets", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    const playerId = getPlayerId();
    if (!room || !playerId) return;
    try {
      room.clearBets(playerId);
      const player = room.getPlayer(playerId);
      if (player) {
        gameManager.notifyAdminPlayerBalanceUpdate(roomId, playerId, player.balance);
      }
    } catch (error) {
      console.error("Error clearing bets:", error);
    }
  });

  socket.on("undo-bet", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    const playerId = getPlayerId();
    if (!room || !playerId) return;
    try {
      room.undoBet(playerId);
      const player = room.getPlayer(playerId);
      if (player) {
        gameManager.notifyAdminPlayerBalanceUpdate(roomId, playerId, player.balance);
      }
    } catch (error) {
      console.error("Error undoing bet:", error);
    }
  });

  socket.on("repeat-bet", ({ roomId }, callback) => {
    const room = gameManager.getRoom(roomId);
    const playerId = getPlayerId();
    if (!room || !playerId) {
      if (callback) callback({ success: false, message: "Sala o jugador no encontrado" });
      return;
    }

    try {
      room.repeatBet(playerId, callback);
      const player = room.getPlayer(playerId);
      if (player) {
        gameManager.notifyAdminPlayerBalanceUpdate(roomId, playerId, player.balance);
      }
    } catch (error) {
      console.error("Error repeating bet:", error);
      if (callback) callback({ success: false, message: error.message });
    }
  });

  socket.on("double-bet", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    const playerId = getPlayerId();
    if (!room || !playerId) return;
    try {
      room.doubleBet(playerId);
      const player = room.getPlayer(playerId);
      if (player) {
        gameManager.notifyAdminPlayerBalanceUpdate(roomId, playerId, player.balance);
      }
    } catch (error) {
      console.error("Error doubling bet:", error);
    }
  });

  socket.on("spin", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;

    if (room.gameState === "betting") {
      room.nextState();
    }

    if (room.gameState === "spinning") {
      try {
        room.triggerSpin();
      } catch (error) {
        console.error("Error triggering spin:", error);
      }
    }
  });

  socket.on("leave-room", async ({ roomId, userId }) => {
    console.log(`🚪 [singlePlayerHandler] Jugador ${userId} solicitó salir de sala ${roomId}`);

    if (!roomId || !userId) {
      console.warn("⚠️ [singlePlayerHandler] leave-room: faltan roomId o userId");
      socket.emit("error", { message: "Faltan parámetros." });
      return;
    }

    const room = gameManager.getRoom(roomId);
    if (!room) {
      console.warn(`⚠️ [singlePlayerHandler] Sala ${roomId} no encontrada al salir`);
      socket.emit("error", { message: "Sala no encontrada." });
      return;
    }

    const player = room.getPlayer(userId);
    if (player) {
      socket.emit("balance-updated", { balance: player.balance });
    }

    if (room.players.has(userId)) {
      room.removePlayer(userId);
      console.log(`✅ [singlePlayerHandler] Jugador ${userId} eliminado de sala ${roomId}`);
    }

    if (socket.player && socket.player.id === userId) {
      delete socket.player;
      console.log(`♻️ [singlePlayerHandler] socket.player limpiado para ${userId}`);
    }

    socket.leave(roomId);

    gameManager.removeRoom(roomId);
    console.log(`🗑️ [singlePlayerHandler] Sala ${roomId} eliminada al salir (single player)`);
  });

  socket.on("disconnect", () => {
    const roomId = socket.id;
    const room = gameManager.getRoom(roomId);

    if (room) {
      if (socket.player) {
        room.stopCountdown();
        room.removePlayer(socket.player.id);
        gameManager.notifyAdminsRoomUpdate();
      }

      gameManager.removeRoom(roomId);
      console.log(`🚪 Sala ${roomId} eliminada por desconexión.`);
    }
  });
};
