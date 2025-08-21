// src/services/gameManager.js

import { SinglePlayerRoom } from "../classes/SinglePlayerRoom.js";

const rooms = new Map();

/**
 * Obtiene o crea una sala de un solo jugador.
 * @param {string} roomId - El ID de la sala.
 * @param {object} io - La instancia de Socket.IO.
 * @returns {SinglePlayerRoom} La instancia de la sala.
 */
export const getOrCreateSingleRoom = (roomId, io) => {
  if (!rooms.has(roomId)) {
    console.log(`Creando nueva sala para un jugador: ${roomId}`);
    const newRoom = new SinglePlayerRoom(io, roomId);
    rooms.set(roomId, newRoom);
    return newRoom;
  }
  return rooms.get(roomId);
};

/**
 * Obtiene una sala existente por su ID.
 * @param {string} roomId - El ID de la sala.
 * @returns {SinglePlayerRoom | undefined} La instancia de la sala o undefined si no se encuentra.
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
    rooms.delete(roomId);
    console.log(`Sala ${roomId} eliminada.`);
    return true;
  }
  return false;
};

/**
 * Obtiene el estado de todas las salas activas.
 * @returns {Array<object>} Un array con los detalles de cada sala.
 */
export const getRooms = () => {
  return Array.from(rooms.values()).map((room) => ({
    id: room.id,
    gameState: room.gameState,
    playersCount: room.players.size,
    players: Array.from(room.players.values()).map((player) =>
      player.toSocketData()
    ),
  }));
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
    return {
      roomId: room.id,
      gameState: room.gameState,
      players: Array.from(room.players.values()).map((player) =>
        player.toSocketData()
      ),
    };
  }
  return getRooms();
};

/**
 * Devuelve los próximos 20 resultados de la sala (sin sacarlos de la cola).
 * @param {SinglePlayerRoom} room - La sala de juego.
 * @returns {Array<object>} Array de resultados {number, color}.
 */
export function peekResults(roomId) {
  const room = getRoom(roomId);
  if (!room) return null;
  return room.peekQueue(20);
}
