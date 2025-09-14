// src/services/gameManager.js

import { SinglePlayerRoom } from "../classes/SinglePlayerRoom.js";
import { TournamentRoom } from "../classes/TournamentRoom.js";

const singleRooms = new Map();
export const tournamentRooms = new Map();

/**
 * Obtiene o crea una sala de un solo jugador.
 */
export const getOrCreateSingleRoom = (roomId, io) => {
  if (!singleRooms.has(roomId)) {
    console.log(`Creando nueva sala para un jugador: ${roomId}`);
    const newRoom = new SinglePlayerRoom(io, roomId);
    singleRooms.set(roomId, newRoom);
    return newRoom;
  }
  return singleRooms.get(roomId);
};

/**
 * Obtiene una sala existente por su ID (modo individual).
 */
export const getSingleRoom = (roomId) => {
  return singleRooms.get(roomId);
};

/**
 * Elimina una sala individual.
 */
export const removeSingleRoom = (roomId) => {
  if (singleRooms.has(roomId)) {
    const room = singleRooms.get(roomId);
    room.players.forEach((player) => {
      const socket = player.socket;
      if (socket && socket.connected) {
        try {
          socket.emit("room-deleted", {
            reason: "disconnected",
            message:
              "La sala ha sido eliminada porque el jugador se desconectó.",
          });
          socket.disconnect(true);
        } catch (err) {
          console.warn(
            `⚠️ No se pudo notificar a socket ${socket.id}:`,
            err.message
          );
        }
      }
    });
    room.stopCountdown?.();
    singleRooms.delete(roomId);
    console.log(`🗑️ Sala individual ${roomId} eliminada del manager.`);
    return true;
  }
  return false;
};

/**
 * Obtiene o crea un torneo (si hay espacio).
 * @param {string} roomId - ID único para el torneo
 * @param {object} io - Socket.IO server
 * @returns {TournamentRoom}
 */
export const getOrCreateTournamentRoom = (roomId, io) => {
  if (!tournamentRooms.has(roomId)) {
    console.log(`Creando nuevo torneo: ${roomId}`);
    const newRoom = new TournamentRoom(io, roomId);
    tournamentRooms.set(roomId, newRoom);
    return newRoom;
  }
  return tournamentRooms.get(roomId);
};

/**
 * Obtiene un torneo existente.
 */
export const getTournamentRoom = (roomId) => {
  return tournamentRooms.get(roomId);
};

/**
 * Elimina un torneo.
 */
export const removeTournamentRoom = (roomId) => {
  if (tournamentRooms.has(roomId)) {
    const room = tournamentRooms.get(roomId);
    room.players.forEach((playerData) => {
      const player = playerData.player;
      const socket = player.socket;
      if (socket && socket.connected) {
        try {
          socket.emit("tournament-deleted", {
            reason: "disconnected",
            message: "El torneo fue cancelado por desconexión.",
          });
          socket.disconnect(true);
        } catch (err) {
          console.warn(
            `⚠️ No se pudo notificar a socket ${socket.id}:`,
            err.message
          );
        }
      }
    });
    tournamentRooms.delete(roomId);
    console.log(`🗑️ Torneo ${roomId} eliminado del manager.`);
    return true;
  }
  return false;
};

/**
 * Obtiene el estado de todas las salas activas (individuales y torneos).
 */
export const getRooms = () => {
  return {
    singles: Array.from(singleRooms.values()).map((room) => ({
      id: room.id,
      type: "single",
      gameState: room.gameState,
      playersCount: room.players.size,
      players: Array.from(room.players.values()).map((p) => p.toSocketData()),
    })),
    tournaments: Array.from(tournamentRooms.values()).map((room) => ({
      id: room.id,
      type: "tournament",
      gameState: room.gameState,
      playersJoined: room.players.size,
      maxPlayers: 3,
      currentRound: room.currentRound,
      totalRounds: room.totalRounds,
      potTotal: room.potTotal,
      houseEarnings: room.houseEarnings,
      payoutPool: room.payoutPool,
      players: Array.from(room.players.values()).map((p) => ({
        playerId: p.player.id,
        playerName: p.player.name,
        points: p.points,
        balance: p.player.balance,
      })),
    })),
  };
};

/**
 * Obtiene el estado de una sala específica.
 */
export const getStatus = (roomId) => {
  const singleRoom = getSingleRoom(roomId);
  if (singleRoom) {
    return {
      roomId: singleRoom.id,
      type: "single",
      gameState: singleRoom.gameState,
      players: Array.from(singleRoom.players.values()).map((p) =>
        p.toSocketData()
      ),
    };
  }

  const tournamentRoom = getTournamentRoom(roomId);
  if (tournamentRoom) {
    return {
      roomId: tournamentRoom.id,
      type: "tournament",
      gameState: tournamentRoom.gameState,
      currentRound: tournamentRoom.currentRound,
      totalRounds: tournamentRoom.totalRounds,
      playersJoined: tournamentRoom.players.size,
      potTotal: tournamentRoom.potTotal,
      houseEarnings: tournamentRoom.houseEarnings,
      payoutPool: tournamentRoom.payoutPool,
      players: Array.from(tournamentRoom.players.values()).map((p) => ({
        playerId: p.player.id,
        playerName: p.player.name,
        points: p.points,
        balance: p.player.balance,
      })),
    };
  }

  return null;
};

/**
 * Devuelve los próximos 20 resultados de una sala.
 */
export function peekResults(roomId) {
  const singleRoom = getSingleRoom(roomId);
  if (singleRoom) return singleRoom.peekQueue(20);

  const tournamentRoom = getTournamentRoom(roomId);
  if (tournamentRoom) return tournamentRoom.peekQueue(20);

  return null;
}

/**
 * Crear múltiples torneos vacíos al iniciar (min 10)
 */
export const initializeTournaments = (io) => {
  for (let i = 0; i < 10; i++) {
    const roomId = `tournament_${Date.now()}_${i}`;
    getOrCreateTournamentRoom(roomId, io);
  }
  console.log(`✅ Inicializados 10 torneos vacíos.`);
};
