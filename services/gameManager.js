// src/services/gameManager.js

import { SinglePlayerRoom } from "../classes/SinglePlayerRoom.js";
import { TournamentRoom } from "../classes/TournamentRoom.js"; // ✅ Nuevo

const rooms = new Map();

/**
 * Obtiene o crea una sala de un solo jugador.
 * @param {string} roomId - El ID de la sala.
 * @param {object} io - La instancia de Socket.IO.
 * @returns {SinglePlayerRoom} La instancia de la sala.
 */
export const getOrCreateSingleRoom = (roomId, io) => {
  if (!rooms.has(roomId)) {
    console.log(`[GameManager] 🎯 Creando nueva sala SINGLE: ${roomId}`);
    const newRoom = new SinglePlayerRoom(io, roomId);
    rooms.set(roomId, newRoom);
    return newRoom;
  }
  return rooms.get(roomId);
};

/**
 * Obtiene o crea una sala de torneo.
 * @param {string} roomId - El ID de la sala de torneo.
 * @param {object} io - La instancia de Socket.IO.
 * @returns {TournamentRoom} La instancia de la sala de torneo.
 */
export const getOrCreateTournamentRoom = (roomId, io) => {
  if (!rooms.has(roomId)) {
    console.log(`[GameManager] 🏆 Creando nueva sala TOURNAMENT: ${roomId}`);
    const newRoom = new TournamentRoom(io, roomId);
    rooms.set(roomId, newRoom);
    return newRoom;
  }
  return rooms.get(roomId);
};

/**
 * Obtiene una sala existente por su ID (puede ser single o tournament).
 * @param {string} roomId - El ID de la sala.
 * @returns {SinglePlayerRoom | TournamentRoom | undefined} La instancia de la sala o undefined si no se encuentra.
 */
export const getRoom = (roomId) => {
  return rooms.get(roomId);
};

/**
 * Elimina una sala por su ID.
 * @param {string} roomId - El ID de la sala.
 * @returns {boolean} True si la sala fue eliminada, false de lo contrario.
 */
export const removeRoom = (roomId) => {
  if (rooms.has(roomId)) {
    const room = rooms.get(roomId);
    const roomType = room instanceof TournamentRoom ? "TOURNAMENT" : "SINGLE";
    rooms.delete(roomId);
    console.log(`[GameManager] 🗑️ Sala ${roomType} ${roomId} eliminada.`);
    return true;
  }
  return false;
};

/**
 * Obtiene el estado de todas las salas activas.
 * @returns {Array<object>} Un array con los detalles de cada sala.
 */
export const getRooms = () => {
  return Array.from(rooms.values()).map((room) => {
    const roomType = room instanceof TournamentRoom ? "tournament" : "single";
    return {
      id: room.id,
      type: roomType,
      gameState: room.gameState,
      playersCount: room.players.size,
      players: Array.from(room.players.values()).map((player) =>
        player.toSocketData()
      ),
      ...(roomType === "tournament" && {
        readyPlayers: Array.from(room.readyPlayers || []),
      }),
    };
  });
};

/**
 * Obtiene el estado de una sala específica.
 * @param {string} roomId - El ID de la sala a buscar.
 * @returns {object | null} El estado de la sala o null si no se encuentra.
 */
export const getStatus = (roomId) => {
  if (roomId) {
    const room = getRoom(roomId);
    if (!room) return null;

    const baseStatus = {
      roomId: room.id,
      gameState: room.gameState,
      players: Array.from(room.players.values()).map((player) =>
        player.toSocketData()
      ),
    };

    // Si es torneo, añadir estado de "ready"
    if (room instanceof TournamentRoom) {
      baseStatus.readyPlayers = Array.from(room.readyPlayers || []);
      baseStatus.totalPlayers = room.players.size;
    }

    return baseStatus;
  }
  return getRooms();
};

/**
 * Devuelve los próximos 20 resultados de la sala (sin sacarlos de la cola).
 * Funciona para ambos tipos de sala.
 * @param {string} roomId - El ID de la sala.
 * @returns {Array<object> | null} Array de resultados {number, color} o null si no existe la sala.
 */
export function peekResults(roomId) {
  const room = getRoom(roomId);
  if (!room) return null;
  return room.peekQueue ? room.peekQueue(20) : null;
}
