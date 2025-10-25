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
          tournamentFromDB.code,
        );
        console.log(
          `🎯 [Torneo] Jugador ${userName} (${userId}) ${
            isCreator ? "CREÓ" : "SE UNIÓ A"
          } la sala ${roomId}`,
        );
        socket.join(roomId);
        socket.roomId = roomId;
        await room.addPlayer(player, socket);
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
    console.log(`🔌 [tournamentHandler] Socket ID: ${socket.id}`);
    console.log(`👤 [tournamentHandler] Player ID: ${socket.player?.id || "No player"}`);

    try {
      const rooms = getActiveTournamentRooms();
      console.log(`🔍 [tournamentHandler] Se encontraron ${rooms.length} salas de torneo`);

      if (rooms.length === 0) {
        console.log(`ℹ️ [tournamentHandler] No hay torneos activos, devolviendo array vacío`);
        if (callback) {
          callback({ tournaments: [] });
          console.log(`✅ [tournamentHandler] Callback ejecutado con array vacío`);
        }
        return;
      }

      const activeTournaments = rooms
        .map(([roomId, room]) => {
          console.log(`📝 [tournamentHandler] Procesando sala ${roomId}`);

          try {
            const info = room.getPublicInfo();
            console.log(`✅ [tournamentHandler] Info de sala ${roomId}:`, {
              id: info.id,
              code: info.code,
              players: `${info.players}/${info.maxPlayers}`,
              status: info.status,
              isStarted: info.isStarted,
            });

            // Intentar serializar para detectar problemas
            try {
              JSON.stringify(info);
              console.log(`✅ [tournamentHandler] Sala ${roomId} es serializable`);
            } catch (jsonError) {
              console.error(
                `❌ [tournamentHandler] Sala ${roomId} NO es serializable:`,
                jsonError.message,
              );
              // Intentar crear versión serializable
              return {
                ...info,
                createdAt: info.createdAt ? info.createdAt.toISOString() : new Date().toISOString(),
              };
            }

            return info;
          } catch (error) {
            console.error(
              `❌ [tournamentHandler] Error obteniendo info de sala ${roomId}:`,
              error.message,
            );
            console.error(`Stack:`, error.stack);
            return null;
          }
        })
        .filter(Boolean); // Filtrar nulls

      console.log(
        `📋 [tournamentHandler] Enviando ${activeTournaments.length} torneos activos al cliente.`,
      );

      // Intentar serializar el resultado completo
      try {
        const serialized = JSON.stringify({ tournaments: activeTournaments });
        console.log(
          `✅ [tournamentHandler] Payload serializable (${serialized.length} caracteres)`,
        );
      } catch (jsonError) {
        console.error(`❌ [tournamentHandler] Payload NO es serializable:`, jsonError.message);
      }

      if (callback) {
        try {
          callback({ tournaments: activeTournaments });
          console.log(
            `✅ [tournamentHandler] Callback ejecutado exitosamente con ${activeTournaments.length} torneos`,
          );
        } catch (callbackError) {
          console.error(`❌ [tournamentHandler] Error ejecutando callback:`, callbackError.message);
        }
      } else {
        console.warn("⚠️ [tournamentHandler] No se proporcionó callback en tournament:list-active");
      }
    } catch (error) {
      console.error("❌ [tournamentHandler] Error obteniendo torneos activos:", error.message);
      console.error("Stack completo:", error.stack);

      if (callback) {
        try {
          callback({ error: "Error interno al obtener torneos activos" });
          console.log(`📤 [tournamentHandler] Callback ejecutado con error`);
        } catch (callbackError) {
          console.error(
            `❌ [tournamentHandler] Error ejecutando callback de error:`,
            callbackError.message,
          );
        }
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
      return;
    }

    const room = gameManager.getRoom(roomId);

    if (!room || !(room instanceof TournamentRoom)) {
      console.log(`ℹ️ [tournamentHandler] Sala ${roomId} no es de torneo, ignorando...`);
      return;
    }

    if (room.isStarted && room.gameState !== "finished" && room.gameState !== "results") {
      console.warn(`⚠️ [tournamentHandler] Jugador ${userId} intentó salir de torneo EN CURSO`);
      socket.emit("error", {
        message: "No puedes salir: el torneo está en curso.",
      });
      return;
    }

    if (room.players.has(userId)) {
      room.removePlayer(userId);
      console.log(`✅ [tournamentHandler] Jugador ${userId} eliminado de sala ${roomId}`);

      if (room.players.size === 0) {
        room.notifyTournamentRemoved(io);
        gameManager.removeRoom(roomId);
        console.log(`🗑️ [tournamentHandler] Sala ${roomId} eliminada por estar vacía`);
      } else {
        room.notifyTournamentUpdate(io);
      }
    } else {
      console.warn(`⚠️ [tournamentHandler] Jugador ${userId} no estaba en sala ${roomId}`);
    }

    if (socket.player && socket.player.id === userId) {
      delete socket.player;
      console.log(`♻️ [tournamentHandler] socket.player limpiado para ${userId}`);
    }
    delete socket.roomId;
    console.log(`♻️ [tournamentHandler] socket.roomId limpiado`);

    socket.leave(roomId);
    console.log(`🔌 [tournamentHandler] Socket ${socket.id} salió de sala ${roomId} de Socket.IO`);

    gameManager.notifyAdminsRoomUpdate();
    console.log(`📊 [tournamentHandler] Panel de admin notificado sobre salida de ${userId}`);

    socket.emit("left-room-success", { message: "Saliste correctamente del torneo." });
  });

  socket.on("disconnect", () => {
    const player = socket.player;
    if (!player) {
      gameManager.notifyAdminsRoomUpdate();
      return;
    }

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

        if (room.players.size === 0) {
          if (room instanceof TournamentRoom) {
            room.notifyTournamentRemoved(io);
          }
          gameManager.removeRoom(roomId);
          console.log(`🗑️ [Torneo] Sala ${roomId} ELIMINADA por inactividad`);
        } else {
          room.notifyTournamentUpdate(io);
        }

        gameManager.notifyAdminsRoomUpdate();
        break;
      }
    }
  });
};
