// utils/errorHandler.js

/**
 * Emite un error estructurado al cliente.
 *
 * @param {import("socket.io").Socket} socket - Socket del jugador
 * @param {string} type - Tipo de error: "balance", "validation", "game_state", "server"
 * @param {string} message - Mensaje descriptivo
 * @param {string} [betKey] - Opcional: clave de apuesta relacionada
 */
export const emitError = (socket, type, message, betKey = null) => {
  const errorPayload = {
    type,
    message,
    id: Date.now(),
    ...(betKey !== null && { betKey }),
  };

  console.warn(
    `[ERROR][${type}] Jugador ${socket.id}: ${message} ${
      betKey ? `(Apuesta: ${betKey})` : ""
    }`
  );

  socket.emit("bet-error", errorPayload);
};

/**
 * Emite un error a todos los jugadores en una sala.
 *
 * @param {import("socket.io").Namespace} io - Instancia de Socket.IO
 * @param {string} roomId - ID de la sala
 * @param {string} type - Tipo de error
 * @param {string} message - Mensaje
 * @param {string} [betKey] - Apuesta relacionada
 */
export const broadcastError = (io, roomId, type, message, betKey = null) => {
  const errorPayload = {
    type,
    message,
    id: Date.now(),
    ...(betKey !== null && { betKey }),
  };

  console.warn(`[BROADCAST ERROR][${type}] Sala ${roomId}: ${message}`);
  io.to(roomId).emit("bet-error", errorPayload);
};
