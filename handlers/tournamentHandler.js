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

      room.addPlayer(player, socket);
      socket.join(roomId);
      socket.roomId = roomId;

      // 👇 Log después de unirse: cuántos jugadores hay ahora
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
        // 👇 Log opcional: si quieres ver cada apuesta en consola (puede ser mucho)
        // console.log(`🎰 [Torneo] Jugador ${playerId} ejecutó ${event} en sala ${roomId}`);
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
