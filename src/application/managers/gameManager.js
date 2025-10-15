// src/application/managers/gameManager.js
import { SinglePlayerRoom } from "#domain/entities/SinglePlayerRoom.js";
import { TournamentRoom } from "#domain/entities/TournamentRoom.js";

/**
 * Gestor central de salas de juego.
 * Maneja la creación, eliminación y consulta de salas de un jugador y torneos.
 * Proporciona una interfaz unificada para el manejo de todas las salas activas.
 */

// Instancia global de Socket.IO para comunicación con clientes
let ioInstance = null;

/**
 * Inicializa el GameManager con la instancia de Socket.IO.
 * Debe ser llamado una sola vez al iniciar la aplicación.
 * @param {import("socket.io").Server} io - Instancia de Socket.IO para comunicación.
 */
export const initGameManager = (io) => {
  if (ioInstance) {
    throw new Error("GameManager ya fue inicializado");
  }
  ioInstance = io;
  console.log("🎮 GameManager inicializado con Socket.IO");
};

/**
 * Obtiene la instancia de Socket.IO (solo para uso interno).
 * @returns {import("socket.io").Server} Instancia de Socket.IO.
 * @throws {Error} Si el GameManager no ha sido inicializado.
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

// =============== NOTIFICACIONES A ADMINISTRADORES ===============

/**
 * Notifica a los administradores sobre cambios en el estado de las salas.
 * Emite el estado actual de todas las salas a los clientes conectados como admin.
 */
export const notifyAdminsRoomUpdate = () => {
  try {
    const io = getIO();
    const status = getRooms();
    io.to("admin-room").emit("admin:rooms-update", status);
    console.log(`📡 [Admin] Evento 'admin:rooms-update' emitido a room 'admin-room'`);
  } catch (err) {
    console.warn("⚠️ No se pudo notificar a admins:", err.message);
  }
};

// =============== GESTIÓN DE SALAS ===============

/**
 * Obtiene una sala de un solo jugador existente o crea una nueva.
 * @param {string} roomId - ID único de la sala.
 * @param {import("socket.io").Server} io - Instancia de Socket.IO.
 * @returns {SinglePlayerRoom} Instancia de la sala (existente o nueva).
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
 * Obtiene una sala de torneo existente o crea una nueva.
 * @param {string} roomId - ID único de la sala.
 * @param {import("socket.io").Server} io - Instancia de Socket.IO.
 * @param {string} creatorId - ID del jugador que crea la sala.
 * @param {number} entryFee - Costo de entrada del torneo.
 * @param {string} code - Código amigable del torneo (T_XXXXXX_XXX).
 * @returns {TournamentRoom} Instancia de la sala (existente o nueva).
 */
export const getOrCreateTournamentRoom = (roomId, io, creatorId, entryFee, code) => {
  if (!tournamentRooms.has(roomId)) {
    const newRoom = new TournamentRoom(io, roomId, creatorId, entryFee, code);
    tournamentRooms.set(roomId, newRoom);
    console.log(
      `🏆 [GameManager] Sala TORNEO creada: ${roomId} (creador: ${creatorId}, entrada: ${entryFee}, código: ${code})`,
    );
    notifyAdminsRoomUpdate();
    return newRoom;
  }
  console.log(`🔁 [GameManager] Sala TORNEO existente obtenida: ${roomId}`);
  return tournamentRooms.get(roomId);
};

/**
 * Elimina una sala por su ID y limpia todos sus recursos.
 * @param {string} roomId - ID de la sala a eliminar.
 * @returns {boolean} `true` si la sala fue eliminada, `false` si no se encontró.
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
 * @param {string} roomId - ID de la sala a buscar.
 * @returns {SinglePlayerRoom | TournamentRoom | undefined} Instancia de la sala o `undefined` si no se encuentra.
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
 * @returns {Array<Object>} Array con los detalles de cada sala activa.
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
 * Obtiene el estado detallado de una sala específica.
 * @param {string} roomId - ID de la sala a consultar.
 * @returns {Object | null} Estado de la sala o `null` si no se encuentra.
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
 * Obtiene los próximos resultados de la ruleta sin eliminarlos de la cola.
 * @param {string} roomId - ID de la sala.
 * @returns {Array<Object> | null} Array de resultados {number, color} o `null` si no se encuentra la sala.
 */
export function peekResults(roomId) {
  const room = getRoom(roomId);
  if (!room) return null;
  return room.peekQueue?.(20) || null;
}

/**
 * Obtiene solo los IDs de las salas para herramientas de administración.
 * Útil para debugging sin exponer objetos completos.
 * @returns {Object} Lista de IDs de salas por tipo.
 */
export const getRoomsForAdmin = () => ({
  single: Array.from(singleRooms.keys()),
  tournament: Array.from(tournamentRooms.keys()),
});

/**
 * Notifica a los administradores sobre cambios en el balance de un jugador.
 * @param {string} roomId - ID de la sala donde ocurrió el cambio.
 * @param {string} playerId - ID del jugador cuyo balance cambió.
 * @param {number} balance - Nuevo balance del jugador.
 */
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
