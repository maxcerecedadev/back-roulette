// src/handlers/tournamentHandler.js

import { Player } from "../classes/Player.js";
import * as gameManager from "../services/gameManager.js";

export const tournamentHandler = (io, socket) => {
  const getPlayerId = () => {
    if (socket.player && socket.player.id) return socket.player.id;
    return undefined;
  };

  socket.on("tournament-join", (data, callback) => {
    const { userId, userName, balance, tournamentId } = data;

    const playerId = userId;

    if (
      !tournamentId ||
      typeof tournamentId !== "string" ||
      tournamentId.trim() === ""
    ) {
      console.error("❌ [tournamentHandler] tournamentId inválido o faltante");
      if (callback) {
        callback({ error: "tournamentId es requerido" });
      }
      return;
    }

    const roomId = tournamentId.trim();
    const isNewRoom = !gameManager.getRoom(roomId);
    const isCreator = isNewRoom;

    const player = new Player(userId, userName, balance, isCreator);
    socket.player = player;

    console.log(
      `🔎 [tournamentHandler] ANTES de unirse: buscando si jugador ${playerId} ya está en alguna sala...`
    );

    for (const [
      existingRoomId,
      existingRoom,
    ] of gameManager.tournamentRooms.entries()) {
      if (existingRoom.players.has(playerId)) {
        console.warn(
          `⚠️ [tournamentHandler] ¡Jugador ${playerId} YA ESTÁ en sala ${existingRoomId}!`
        );
        // Opcional: podrías eliminarlo aquí si quieres forzar un solo juego a la vez
        // existingRoom.removePlayer(playerId);
      }
    }

    try {
      const room = gameManager.getOrCreateTournamentRoom(
        roomId,
        io,
        isCreator ? userId : undefined
      );

      console.log(
        `🎯 [Torneo] Jugador ${userName} (${userId}) ${
          isCreator ? "CREÓ" : "SE UNIÓ A"
        } la sala ${roomId}`
      );

      // 👇 ¡PRIMERO unir el socket a la sala!
      socket.join(roomId);
      socket.roomId = roomId;

      // 👇 LUEGO agregar el jugador (emite broadcast a la sala)
      room.addPlayer(player, socket);

      console.log(
        `👥 [Torneo] Sala ${roomId} ahora tiene ${room.players.size}/3 jugadores`
      );

      if (callback) {
        callback({
          message: "Unido al torneo",
          roomId,
          user: player.toSocketData(),
        });
      }
    } catch (error) {
      console.error(
        `❌ [Torneo] Error al unirse (${userName}):`,
        error.message
      );
      if (callback) {
        callback({ error: error.message });
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

      // 👇 Log claro de inicio
      console.log(
        `✅ [Torneo] ¡Torneo INICIADO en sala ${roomId} por creador ${creatorId}!`
      );
      console.log(
        `🎲 [Torneo] Estado: ${room.players.size} jugadores listos, ronda ${room.currentRound}`
      );

      socket.emit("tournament-started", { round: room.currentRound });
    } catch (error) {
      socket.emit("error", { message: error.message });
      console.error(
        `❌ [Torneo] Error iniciando torneo en ${roomId}:`,
        error.message
      );
    }
  });

  const betEvents = [
    "place-bet",
    "clear-bets",
    "undo-bet",
    "repeat-bet",
    "double-bet",
  ];
  betEvents.forEach((event) => {
    socket.on(`tournament-${event}`, (data) => {
      const { roomId } = data;
      const room = gameManager.getRoom(roomId);
      const playerId = getPlayerId();
      if (!room || !playerId) return;

      if (typeof room[event] === "function") {
        console.log(
          `🎰 [Torneo] Jugador ${playerId} ejecutó ${event} en sala ${roomId}`
        );
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
    console.log(
      `🚪 [tournamentHandler] Jugador ${userId} solicitó salir de sala ${roomId}`
    );

    if (!roomId || !userId) {
      console.warn("⚠️ [tournamentHandler] leave-room: faltan roomId o userId");
      socket.emit("error", { message: "Faltan parámetros." });
      return;
    }

    const room = gameManager.getRoom(roomId);
    if (!room) {
      console.warn(
        `⚠️ [tournamentHandler] Sala ${roomId} no encontrada al salir`
      );
      socket.emit("error", { message: "Sala no encontrada." });
      return;
    }

    if (room.isStarted) {
      console.warn(
        `⚠️ [tournamentHandler] Jugador ${userId} intentó salir de torneo INICIADO`
      );
      socket.emit("error", {
        message: "No puedes salir: el torneo ya ha comenzado.",
      });
      return;
    }

    if (room.players.has(userId)) {
      room.removePlayer(userId);
      console.log(
        `✅ [tournamentHandler] Jugador ${userId} eliminado de sala ${roomId}`
      );
    }

    if (room.players.size === 0) {
      gameManager.removeRoom(roomId);
      console.log(
        `🗑️ [tournamentHandler] Sala ${roomId} eliminada por estar vacía`
      );
    }

    room.broadcast("tournament-state-update", room.getTournamentState());
  });

  socket.on("disconnect", () => {
    const player = socket.player;
    if (!player) return;

    for (const [roomId, room] of gameManager.tournamentRooms.entries()) {
      if (room.players.has(player.id)) {
        const playerName = player.name || "Desconocido";
        console.log(
          `🚪 [Torneo] Jugador ${playerName} (${player.id}) se DESCONECTÓ de sala ${roomId}`
        );

        room.removePlayer(player.id);

        console.log(
          `👥 [Torneo] Sala ${roomId} ahora tiene ${room.players.size} jugadores`
        );

        if (room.players.size === 0) {
          gameManager.removeRoom(roomId);
          console.log(`🗑️ [Torneo] Sala ${roomId} ELIMINADA por inactividad`);
        }
        break;
      }
    }
  });
};
