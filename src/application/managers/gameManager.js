// src/application/managers/gameManager.js

import { SinglePlayerRoom } from "#domain/entities/SinglePlayerRoom.js";
import { TournamentRoom } from "#domain/entities/TournamentRoom.js";

let ioInstance = null;

/**
 * Inicializa el GameManager con la instancia de Socket.IO
 * @param {import("socket.io").Server} io
 */

export const initGameManager = (io) => {
  if (ioInstance) {
    throw new Error("GameManager ya fue inicializado");
  }
  ioInstance = io;
  console.log("🎮 GameManager inicializado con Socket.IO");
};

/**
 * Obtiene la instancia de Socket.IO (solo para uso interno)
 */

const getIO = () => {
  if (!ioInstance) {
    throw new Error("GameManager no ha sido inicializado. Llama a initGameManager(io) primero.");
  }
  return ioInstance;
};

const singleRooms = new Map();
const tournamentRooms = new Map();

const ROOM_TYPES = [
  { name: "tournament", map: tournamentRooms },
  { name: "single", map: singleRooms },
];

// Notificar a admins cuando cambie el estado global ===
/**
 * Emite el estado actual de todas las salas a los clientes admin.
 */

export const notifyAdminsRoomUpdate = () => {
  try {
    const io = getIO();
    const status = getRooms(); // obtiene el estado actual
    io.to("admin-room").emit("admin:rooms-update", status);
    console.log(`📡 [Admin] Evento 'admin:rooms-update' emitido a room 'admin-room'`);
  } catch (err) {
    console.warn("⚠️ No se pudo notificar a admins:", err.message);
  }
};

/**
 * Obtiene o crea una sala de un solo jugador.
 * @param {string} roomId - El ID de la sala.
 * @param {object} io - La instancia de Socket.IO.
 * @returns {SinglePlayerRoom} La instancia de la sala.
 */

export const getOrCreateSingleRoom = (roomId, io) => {
  if (!singleRooms.has(roomId)) {
    const newRoom = new SinglePlayerRoom(io, roomId);
    singleRooms.set(roomId, newRoom);
    console.log(`🆕 [GameManager] Sala SINGLE creada: ${roomId}`);
    notifyAdminsRoomUpdate();
    return newRoom;
  }
  console.log(`🔁 [GameManager] Sala SINGLE existente obtenida: ${roomId}`);
  return singleRooms.get(roomId);
};

/**
 * Obtiene o crea una sala de torneo.
 * @param {string} roomId - El ID de la sala.
 * @param {object} io - La instancia de Socket.IO.
 * @param {string} creatorId - ID del creador de la sala.
 * @returns {TournamentRoom} La instancia de la sala.
 */

export const getOrCreateTournamentRoom = (roomId, io, creatorId) => {
  if (!tournamentRooms.has(roomId)) {
    const newRoom = new TournamentRoom(io, roomId, creatorId);
    tournamentRooms.set(roomId, newRoom);
    console.log(`🏆 [GameManager] Sala TORNEO creada: ${roomId} (creador: ${creatorId})`);
    notifyAdminsRoomUpdate();
    return newRoom;
  }
  console.log(`🔁 [GameManager] Sala TORNEO existente obtenida: ${roomId}`);
  return tournamentRooms.get(roomId);
};

/**
 * Elimina una sala por su ID.
 * @param {string} roomId - El ID de la sala.
 * @returns {boolean} True si la sala fue eliminada, false de lo contrario.
 */

export const removeRoom = (roomId) => {
  for (const { name, map } of ROOM_TYPES) {
    if (map.has(roomId)) {
      const room = map.get(roomId);

      room.players?.forEach((player) => {
        const socket = player.socket;
        if (socket && socket.connected) {
          try {
            socket.emit("room-deleted", {
              reason: "disconnected",
              message: "La sala ha sido eliminada.",
            });
            socket.disconnect(true);
          } catch (err) {
            console.warn(`⚠️ No se pudo notificar a socket ${socket.id}:`, err.message);
          }
        }
      });

      if (room.stopCountdown) room.stopCountdown();
      if (typeof room.destroy === "function") room.destroy();

      map.delete(roomId);
      console.log(`🗑️ Sala ${roomId} (${name}) eliminada del manager.`);
      notifyAdminsRoomUpdate();
      return true;
    }
  }
  return false;
};

/**
 * Obtiene una sala existente por su ID.
 * @param {string} roomId - El ID de la sala.
 * @returns {SinglePlayerRoom | TournamentRoom | undefined} La instancia de la sala o undefined si no se encuentra.
 */

export const getRoom = (roomId) => {
  for (const { map } of ROOM_TYPES) {
    if (map.has(roomId)) {
      return map.get(roomId);
    }
  }
  return undefined;
};

/**
 * Obtiene el estado de todas las salas activas.
 * @returns {Array<object>} Un array con los detalles de cada sala.
 */

export const getRooms = () => {
  const allRooms = [...singleRooms.values(), ...tournamentRooms.values()];
  return allRooms.map((room) => {
    const roomType =
      room instanceof TournamentRoom
        ? "tournament"
        : room instanceof SinglePlayerRoom
          ? "single"
          : "unknown";

    return {
      id: room.id,
      roomType,
      gameState: room.gameState,
      playersCount: room.players?.size || 0,
      players: Array.from(room.players?.values() || []).map((player) => player.toSocketData()),
    };
  });
};

/**
 * Obtiene el estado de una sala específica.
 * @param {string} roomId - El ID de la sala a buscar.
 * @returns {object | null} El estado de la sala o null si no se encuentra.
 */

export const getStatus = (roomId) => {
  if (!roomId) return getRooms();

  const room = getRoom(roomId);
  if (!room) {
    console.warn(`[getStatus] ❌ No se encontró sala con ID: ${roomId}`);
    return null;
  }

  const roomType =
    room instanceof TournamentRoom
      ? "tournament"
      : room instanceof SinglePlayerRoom
        ? "single"
        : "unknown";

  console.log(`[getStatus] 🧭 Obteniendo estado de sala ${roomId} (tipo: ${roomType})`);

  return {
    roomId: room.id,
    gameState: room.gameState,
    players: Array.from(room.players?.values() || []).map((player) => {
      console.log(`[getStatus] 👤 Jugador en sala: ${player.id} - ${player.name}`);
      return player.toSocketData();
    }),
  };
};

/**
 * Devuelve los próximos 20 resultados de la sala (sin sacarlos de la cola).
 * @param {string} roomId - El ID de la sala.
 * @returns {Array<object>} Array de resultados {number, color}.
 */

export function peekResults(roomId) {
  const room = getRoom(roomId);
  if (!room) return null;
  return room.peekQueue?.(20) || null;
}

/**
 * Para debugging o herramientas de admin, expón los IDs, no los objetos.
 * @returns {object} Lista de IDs de salas por tipo.
 */

export const getRoomsForAdmin = () => ({
  single: Array.from(singleRooms.keys()),
  tournament: Array.from(tournamentRooms.keys()),
});

export const notifyAdminPlayerBalanceUpdate = (roomId, playerId, balance) => {
  try {
    const io = getIO();
    io.to("admin-room").emit("admin:player-balance-update", {
      roomId,
      playerId,
      balance,
    });
    console.log(
      `📡 [Admin] Balance actualizado: sala=${roomId}, jugador=${playerId}, balance=${balance}`,
    );
  } catch (err) {
    console.warn("⚠️ No se pudo notificar cambio de balance a admins:", err.message);
  }
};
