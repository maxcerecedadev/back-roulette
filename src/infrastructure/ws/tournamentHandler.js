// src/infrastructure/ws/tournamentHandler.js

import prisma from "#prisma";
import { Player } from "#domain/entities/Player.js";
import * as gameManager from "#app/managers/gameManager.js";
import { TournamentRoom } from "#domain/entities/TournamentRoom.js";

export const tournamentHandler = (io, socket) => {
  const getPlayerId = () => {
    if (socket.player && socket.player.id) return socket.player.id;
    return undefined;
  };

  /**
   * Helper: Obtiene todas las salas de TORNEO activas.
   * @returns {Array<[string, TournamentRoom]>} Array de [roomId, room]
   */

  const getActiveTournamentRooms = () => {
    const rooms = [];
    for (const roomId of gameManager.getRoomsForAdmin().tournament) {
      const room = gameManager.getRoom(roomId);
      if (room instanceof TournamentRoom) {
        rooms.push([roomId, room]);
      }
    }
    return rooms;
  };

  socket.on("tournament-join", async (data, callback) => { 
  const { userId, userName, balance, tournamentId: tournamentIdentifier } = data;

  const playerId = userId;

  if (!tournamentIdentifier || typeof tournamentIdentifier !== "string" || tournamentIdentifier.trim() === "") {
    console.error("❌ [tournamentHandler] tournamentId inválido o faltante");
    if (callback) {
      callback({ error: "tournamentId es requerido" });
    }
    return;
  }

  try {
    let roomId;
    if (tournamentIdentifier.startsWith("T_") && tournamentIdentifier.includes("_")) {
      const tournament = await prisma.tournament.findUnique({
        where: { code: tournamentIdentifier },
      });

      if (!tournament) {
        console.error(`❌ Torneo no encontrado por código: ${tournamentIdentifier}`);
        if (callback) {
          callback({ error: "Torneo no encontrado" });
        }
        return;
      }

      roomId = tournament.id; 
      console.log(`✅ [tournamentHandler] Código legible "${tournamentIdentifier}" resuelto a roomId: ${roomId}`);
    } else {
      roomId = tournamentIdentifier.trim();
    }

    const isNewRoom = !gameManager.getRoom(roomId);
    const isCreator = isNewRoom;

    if (socket.player) {
      console.log(`♻️ [Torneo] Limpiando jugador anterior: ${socket.player.id}`);

      for (const [existingRoomId, existingRoom] of getActiveTournamentRooms()) {
        if (existingRoom.players.has(socket.player.id)) {
          console.log(
            `🚪 Eliminando jugador ${socket.player.id} de sala anterior ${existingRoomId}`,
          );
          existingRoom.removePlayer(socket.player.id);
          if (existingRoom.players.size === 0) {
            gameManager.removeRoom(existingRoomId);
            console.log(`🗑️ Sala anterior ${existingRoomId} eliminada (quedó vacía)`);
          }
        }
      }
      delete socket.player;
      delete socket.roomId;
    }

    const player = new Player(userId, userName, balance, isCreator);
    socket.player = player;

    console.log(
      `🔎 [tournamentHandler] ANTES de unirse: buscando si jugador ${playerId} ya está en alguna sala...`,
    );

    for (const [existingRoomId, existingRoom] of getActiveTournamentRooms()) {
      if (existingRoom.players.has(playerId)) {
        console.warn(
          `⚠️ [tournamentHandler] ¡Jugador ${playerId} YA ESTÁ en sala ${existingRoomId}!`,
        );
        existingRoom.removePlayer(playerId);
      }
    }

    try {
      const room = gameManager.getOrCreateTournamentRoom(
        roomId,
        io,
        isCreator ? userId : undefined,
      );

      console.log(
        `🎯 [Torneo] Jugador ${userName} (${userId}) ${
          isCreator ? "CREÓ" : "SE UNIÓ A"
        } la sala ${roomId}`,
      );

      socket.join(roomId);
      socket.roomId = roomId;

      room.addPlayer(player, socket);

      console.log(`👥 [Torneo] Sala ${roomId} ahora tiene ${room.players.size}/3 jugadores`);

      if (callback) {
        callback({
          message: "Unido al torneo",
          roomId, 
          tournamentCode: tournamentIdentifier.startsWith("T_") ? tournamentIdentifier : undefined, 
          user: player.toSocketData(),
        });
      }
    } catch (error) {
      console.error(`❌ [Torneo] Error al unirse (${userName}):`, error.message);
      if (callback) {
        callback({ error: error.message });
      }
    }
  } catch (error) {
    console.error("❌ Error inesperado en tournament-join:", error);
    if (callback) {
      callback({ error: "Error interno al unirse al torneo" });
    }
  }
});

  socket.on("tournament-start", ({ creatorId }) => {
    const roomId = socket.roomId;
    if (!roomId) {
      socket.emit("error", { message: "No estás en ninguna sala de torneo." });
      return;
    }

    const room = gameManager.getRoom(roomId);
    if (!room) {
      socket.emit("error", { message: "Sala de torneo no encontrada." });
      return;
    }

    try {
      room.startTournament(creatorId);

      console.log(`✅ [Torneo] ¡Torneo INICIADO en sala ${roomId} por creador ${creatorId}!`);
      console.log(
        `🎲 [Torneo] Estado: ${room.players.size} jugadores listos, ronda ${room.currentRound}`,
      );

      socket.emit("tournament-started", { round: room.currentRound });
    } catch (error) {
      socket.emit("error", { message: error.message });
      console.error(`❌ [Torneo] Error iniciando torneo en ${roomId}:`, error.message);
    }
  });

  const betEvents = ["place-bet", "clear-bets", "undo-bet", "repeat-bet", "double-bet"];

  betEvents.forEach((event) => {
    socket.on(`tournament-${event}`, (data) => {
      console.log(`📥 [BACKEND] Recibido evento: tournament-${event}`, data);
      const { roomId } = data;
      const room = gameManager.getRoom(roomId);
      const playerId = getPlayerId();
      if (!room || !playerId) return;

      if (typeof room[event] === "function") {
        console.log(`🎰 [Torneo] Jugador ${playerId} ejecutó ${event} en sala ${roomId}`);
        room[event](playerId, data);
      }
    });
  });

  socket.on("tournament-spin", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    if (room.gameState === "betting") {
      console.log(`⏳ [Torneo] Sala ${roomId}: Forzando giro manual (spin)`);
      room.nextState();
    }
  });

  socket.on("leave-room", ({ roomId, userId }) => {
    console.log(`🚪 [tournamentHandler] Jugador ${userId} solicitó salir de sala ${roomId}`);

    if (!roomId || !userId) {
      console.warn("⚠️ [tournamentHandler] leave-room: faltan roomId o userId");
      socket.emit("error", { message: "Faltan parámetros." });
      return;
    }

    const room = gameManager.getRoom(roomId);
    if (!room) {
      console.warn(`⚠️ [tournamentHandler] Sala ${roomId} no encontrada al salir`);
      socket.emit("error", { message: "Sala no encontrada." });
      return;
    }

    if (room.isStarted) {
      console.warn(`⚠️ [tournamentHandler] Jugador ${userId} intentó salir de torneo INICIADO`);
      socket.emit("error", {
        message: "No puedes salir: el torneo ya ha comenzado.",
      });
      return;
    }

    if (room.players.has(userId)) {
      room.removePlayer(userId);
      console.log(`✅ [tournamentHandler] Jugador ${userId} eliminado de sala ${roomId}`);
    }

    if (socket.player && socket.player.id === userId) {
      delete socket.player;
      console.log(`♻️ [tournamentHandler] socket.player limpiado para ${userId}`);
    }
    delete socket.roomId;
    console.log(`♻️ [tournamentHandler] socket.roomId limpiado`);

    socket.leave(roomId);

    if (room.players.size === 0) {
      gameManager.removeRoom(roomId);
      console.log(`🗑️ [tournamentHandler] Sala ${roomId} eliminada por estar vacía`);
    }
  });

  socket.on("disconnect", () => {
    const player = socket.player;
    if (!player) return;

    for (const [roomId, room] of getActiveTournamentRooms()) {
      if (room.players.has(player.id)) {
        const playerName = player.name || "Desconocido";

        if (room.isStarted) {
          console.warn(
            `⚠️ [Torneo] Jugador ${playerName} (${player.id}) se DESCONECTÓ, pero el torneo YA EMPEZÓ. No se elimina del juego.`,
          );

          // Opcional: marcarlo como "desconectado" pero mantenerlo en la sala
          // para que el torneo pueda terminar correctamente.
          // Puedes agregar un flag: player.isDisconnected = true;

          room.broadcast("player-disconnected", {
            playerId: player.id,
            playerName,
            message: `${playerName} se ha desconectado, pero el torneo continúa.`,
          });

          if (player.socket) {
            player.socket = null;
            player.socketId = null;
          }

          delete socket.player;
          delete socket.roomId;

          console.log(`ℹ️ Jugador ${player.id} marcado como desconectado. Torneo sigue activo.`);
          return;
        }

        console.log(
          `🚪 [Torneo] Jugador ${playerName} (${player.id}) se DESCONECTÓ de sala ${roomId}`,
        );

        room.removePlayer(player.id);
        delete socket.player;
        delete socket.roomId;

        console.log(`👥 [Torneo] Sala ${roomId} ahora tiene ${room.players.size} jugadores`);

        if (room.players.size === 0) {
          gameManager.removeRoom(roomId);
          console.log(`🗑️ [Torneo] Sala ${roomId} ELIMINADA por inactividad`);
        }

        break;
      }
    }
  });
};
