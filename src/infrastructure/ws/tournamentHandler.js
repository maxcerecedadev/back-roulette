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

    if (
      !tournamentIdentifier ||
      typeof tournamentIdentifier !== "string" ||
      tournamentIdentifier.trim() === ""
    ) {
      console.error("❌ [tournamentHandler] tournamentId inválido o faltante");
      if (callback) {
        callback({ error: "tournamentId es requerido" });
      }
      return;
    }

    try {
      let roomId;
      let tournamentFromDB = null;

      if (tournamentIdentifier.startsWith("T_") && tournamentIdentifier.includes("_")) {
        tournamentFromDB = await prisma.tournament.findUnique({
          where: { code: tournamentIdentifier },
        });
        if (!tournamentFromDB) {
          console.error(`❌ Torneo no encontrado por código: ${tournamentIdentifier}`);
          if (callback) {
            callback({ error: "Torneo no encontrado" });
          }
          return;
        }
        roomId = tournamentFromDB.id;
        console.log(
          `✅ [tournamentHandler] Código legible "${tournamentIdentifier}" resuelto a roomId: ${roomId}`,
        );
      } else {
        roomId = tournamentIdentifier.trim();
        tournamentFromDB = await prisma.tournament.findUnique({
          where: { id: roomId },
        });

        if (!tournamentFromDB) {
          console.error(`❌ Torneo no encontrado por ID: ${roomId}`);
          if (callback) {
            callback({ error: "Torneo no encontrado" });
          }
          return;
        }
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
              if (existingRoom instanceof TournamentRoom) {
                existingRoom.notifyTournamentRemoved(io);
              }
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
        const entryFee = tournamentFromDB.entryFee;

        const room = gameManager.getOrCreateTournamentRoom(
          roomId,
          io,
          isCreator ? userId : undefined,
          entryFee,
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
        gameManager.notifyAdminsRoomUpdate();

        room.notifyTournamentUpdate(io);

        if (callback) {
          callback({
            message: "Unido al torneo",
            roomId,
            tournamentCode: tournamentFromDB.code, 
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
      gameManager.notifyAdminsRoomUpdate();

      room.notifyTournamentUpdate(io);
    } catch (error) {
      socket.emit("error", { message: error.message });
      console.error(`❌ [Torneo] Error iniciando torneo en ${roomId}:`, error.message);
    }
  });

  const betEvents = ["place-bet", "clear-bets", "undo-bet", "repeat-bet", "double-bet"];
  betEvents.forEach((event) => {
    socket.on(`tournament-${event}`, (data, callback) => {
      console.log(`📥 [BACKEND] Recibido evento: tournament-${event}`, data);
      const { roomId } = data;
      const room = gameManager.getRoom(roomId);
      const playerId = getPlayerId();
      if (!room || !playerId) {
        if (callback) {
          callback({ success: false, message: "Sala o jugador no encontrado" });
        }
        return;
      }
      if (typeof room[event] === "function") {
        console.log(`🎰 [Torneo] Jugador ${playerId} ejecutó ${event} en sala ${roomId}`);
        try {
          room[event](playerId, data, callback);
        } catch (error) {
          console.error(`Error en tournament-${event}:`, error);
          socket.emit("tournament-bet-error", {
            betKey: data.betKey || "unknown",
            message: error.message,
          });
          if (callback) {
            callback({ success: false, message: error.message });
          }
        }
      } else {
        console.error(`❌ [BACKEND] Método ${event} no encontrado en el room`);
        socket.emit("tournament-bet-error", {
          betKey: data.betKey || "unknown",
          message: `Método ${event} no implementado`,
        });
        if (callback) {
          callback({ success: false, message: `Método ${event} no implementado` });
        }
      }
    });
  });

  socket.on("tournament:list-active", (callback) => {
    console.log("📥 [tournamentHandler] Cliente solicitó lista de torneos activos");
    try {
      const activeTournaments = getActiveTournamentRooms().map(([roomId, room]) => {
        console.log(roomId);
        return room.getPublicInfo();
      });

      console.log(
        `📋 [tournamentHandler] Enviando ${activeTournaments.length} torneos activos al cliente.`,
      );
      if (callback) {
        callback({ tournaments: activeTournaments });
      }
    } catch (error) {
      console.error("❌ [tournamentHandler] Error obteniendo torneos activos:", error);
      if (callback) {
        callback({ error: "Error interno al obtener torneos activos" });
      }
    }
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

      if (room.players.size === 0) {
        if (room instanceof TournamentRoom) {
          room.notifyTournamentRemoved(io);
        }
        gameManager.removeRoom(roomId);
        console.log(`🗑️ [tournamentHandler] Sala ${roomId} eliminada por estar vacía`);
      } else {
        room.notifyTournamentUpdate(io);
      }
    }
    if (socket.player && socket.player.id === userId) {
      delete socket.player;
      console.log(`♻️ [tournamentHandler] socket.player limpiado para ${userId}`);
    }
    delete socket.roomId;
    console.log(`♻️ [tournamentHandler] socket.roomId limpiado`);
    socket.leave(roomId);
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
          gameManager.notifyAdminsRoomUpdate();
          return;
        }
        console.log(
          `🚪 [Torneo] Jugador ${playerName} (${player.id}) se DESCONECTÓ de sala ${roomId}`,
        );
        room.removePlayer(player.id);
        delete socket.player;
        delete socket.roomId;
        console.log(`👥 [Torneo] Sala ${roomId} ahora tiene ${room.players.size} jugadores`);
        gameManager.notifyAdminsRoomUpdate();
        if (room.players.size === 0) {
          if (room instanceof TournamentRoom) {
            room.notifyTournamentRemoved(io);
          }
          gameManager.removeRoom(roomId);
          console.log(`🗑️ [Torneo] Sala ${roomId} ELIMINADA por inactividad`);
        } else {
          room.notifyTournamentUpdate(io);
        }
        break;
      }
    }
  });
};
