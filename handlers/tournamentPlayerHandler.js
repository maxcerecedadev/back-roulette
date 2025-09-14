// src/handlers/tournamentPlayerHandler.js

import { Player } from "../classes/Player.js";
import * as gameManager from "../services/gameManager.js";
import { emitErrorByKey } from "../utils/errorHandler.js";

export const tournamentPlayerHandler = (io, socket) => {
  const getPlayer = () => {
    return socket.player || undefined;
  };

  const canJoinTournament = (player) => {
    if (!player) return false;
    if (player.inTournament) {
      emitErrorByKey(socket, "ALREADY_IN_TOURNAMENT");
      return false;
    }
    if (player.balance < 10000) {
      emitErrorByKey(socket, "INSUFFICIENT_BALANCE", {
        details: { required: 10000, current: player.balance },
      });
      return false;
    }
    return true;
  };

  // ========================
  // 🟢 EVENTO: Unirse a un torneo
  // ========================
  socket.on("tournament-join", (data, callback) => {
    const { userId, userName, balance } = data;
    const player = new Player(userId, userName, balance);
    player.setSocket(socket);
    socket.player = player;

    if (!canJoinTournament(player)) {
      if (callback) callback({ error: "No puedes unirte al torneo." });
      return;
    }

    let targetTournament = null;
    for (const [room] of gameManager.tournamentRooms.entries()) {
      if (room.gameState === "waiting" && room.players.size < 3) {
        targetTournament = room;
        break;
      }
    }

    if (!targetTournament) {
      const roomId = `tournament_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      targetTournament = gameManager.getOrCreateTournamentRoom(roomId, io);
    }

    try {
      targetTournament.addPlayer(player, socket);
      socket.join(targetTournament.id);

      if (callback) {
        callback({
          success: true,
          message: "¡Te has unido al torneo!",
          tournamentId: targetTournament.id,
          playersJoined: targetTournament.players.size,
          maxPlayers: 3,
          entryFee: 10000,
          potTotal: targetTournament.potTotal + 10000,
        });
      }
    } catch (error) {
      console.error(
        `❌ Error al unir jugador ${player.id} al torneo:`,
        error.message
      );
      if (callback) callback({ error: error.message });
    }
  });

  // ========================
  // 💰 EVENTO: Colocar apuesta — VALIDADO POR TORNEO Y JUGADOR
  // ========================
  socket.on("place-bet", (betData, callback) => {
    const { betKey, amount, roomId } = betData;

    // 1. Validar que el roomId existe y es un torneo
    const room = gameManager.getTournamentRoom(roomId);
    if (!room || room.gameState !== "in_progress") {
      emitErrorByKey(socket, "GAME_STATE_INVALID");
      return callback?.({
        success: false,
        message: "No se pueden colocar apuestas ahora.",
      });
    }

    // 2. Obtener jugador autenticado
    const player = getPlayer();
    if (!player) {
      emitErrorByKey(socket, "PLAYER_NOT_FOUND");
      return callback?.({ success: false, message: "Jugador no autenticado." });
    }

    // 3. ✅ CRÍTICO: Verificar que el jugador está en este torneo específico
    if (!room.players.has(player.id)) {
      emitErrorByKey(socket, "PLAYER_NOT_IN_ROOM");
      return callback?.({
        success: false,
        message: "No estás inscrito en este torneo.",
      });
    }

    // 4. Procesar apuesta
    room.placeBet(player.id, betKey, amount, callback);
  });

  // ========================
  // 🧹 EVENTO: Limpiar apuestas — VALIDADO POR TORNEO Y JUGADOR
  // ========================
  socket.on("clear-bets", ({ roomId }, callback) => {
    // 1. Validar que el roomId existe y es un torneo
    const room = gameManager.getTournamentRoom(roomId);
    if (!room || room.gameState !== "in_progress") {
      emitErrorByKey(socket, "GAME_STATE_INVALID");
      return callback?.({
        success: false,
        message: "No se pueden limpiar apuestas ahora.",
      });
    }

    // 2. Obtener jugador autenticado
    const player = getPlayer();
    if (!player) {
      emitErrorByKey(socket, "PLAYER_NOT_FOUND");
      return callback?.({ success: false, message: "Jugador no autenticado." });
    }

    // 3. ✅ CRÍTICO: Verificar que el jugador está en este torneo específico
    if (!room.players.has(player.id)) {
      emitErrorByKey(socket, "PLAYER_NOT_IN_ROOM");
      return callback?.({
        success: false,
        message: "No estás inscrito en este torneo.",
      });
    }

    // 4. Procesar limpieza
    room.clearBets(player.id, callback);
  });

  // ========================
  // 🚫 EVENTO: Salir del torneo
  // ========================
  socket.on("tournament-leave", (data, callback) => {
    const player = getPlayer();
    if (!player) {
      emitErrorByKey(socket, "PLAYER_NOT_FOUND");
      return callback?.({ error: "Jugador no encontrado." });
    }

    let foundRoom = null;
    for (const [room] of gameManager.tournamentRooms.entries()) {
      if (room.players.has(player.id)) {
        foundRoom = room;
        break;
      }
    }

    if (!foundRoom) {
      return callback?.({ error: "No estás en ningún torneo." });
    }

    if (foundRoom.gameState !== "waiting") {
      emitErrorByKey(socket, "TOURNAMENT_ALREADY_STARTED");
      return callback?.({ error: "El torneo ya comenzó. No puedes salir." });
    }

    foundRoom.removePlayer(player.id);
    player.balance += 10000;
    player.inTournament = false;

    callback?.({
      success: true,
      message: "Has salido del torneo. Tus 10.000 fichas han sido devueltas.",
      newBalance: player.balance,
    });
  });

  // ========================
  // ❌ EVENTO: Desconexión
  // ========================
  socket.on("disconnect", () => {
    const player = getPlayer();
    if (!player) return;

    let foundRoom = null;

    // Iterar sobre una copia de las entradas (evita problemas si se modifica el mapa durante el recorrido)
    const roomsCopy = Array.from(gameManager.tournamentRooms.entries());

    for (const [room] of roomsCopy) {
      if (!room || !room.players) continue;

      // ✅ Verifica que el jugador esté en este torneo
      if (room.players.has(player.id)) {
        foundRoom = room;
        break;
      }
    }

    if (foundRoom) {
      // Si el torneo aún existe y el jugador está dentro
      if (foundRoom.gameState === "waiting") {
        player.balance += 10000;
        player.inTournament = false;
        console.log(
          `🔁 Jugador ${player.id} abandonó torneo antes de iniciar. Fichas devueltas.`
        );
      } else {
        console.warn(
          `⚠️ Jugador ${player.id} se desconectó durante torneo. Descalificado.`
        );
      }

      // Eliminar al jugador del torneo (esto también limpia referencias)
      foundRoom.removePlayer(player.id);

      // Si el torneo quedó vacío y está en espera, eliminarlo
      if (foundRoom.gameState === "waiting" && foundRoom.players.size === 0) {
        gameManager.removeTournamentRoom(foundRoom.id);
      }
    }

    // Limpiar referencia del jugador
    player.clearSocket();
    socket.player = null;
  });
};
