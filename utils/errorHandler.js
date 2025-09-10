// utils/errorHandler.js
import { v4 as uuidv4 } from "uuid";
import { getErrorDefinition } from "../constants/errorMessages.js";

/**
 * Emite un error estructurado usando una clave predefinida.
 * Centralizado, fácil de mantener, con UUID y detalles.
 *
 * @param {import("socket.io").Socket} socket
 * @param {string} errorCode
 * @param {Object} [options]
 * @param {string} [options.betKey]
 * @param {Object} [options.details]
 * @param {string} [options.customMessage]
 * @param {Object} [options.state]
 */
export const emitErrorByKey = (socket, errorCode, options = {}) => {
  const {
    betKey = null,
    details = {},
    customMessage = null,
    state = null, // 👈 añadimos
  } = options;

  const definition = getErrorDefinition(errorCode);
  const message = customMessage || definition.message;

  const errorId = uuidv4();

  const errorPayload = {
    type: definition.type,
    message,
    id: errorId,
    ...(betKey !== null && { betKey }),
    ...(Object.keys(details).length > 0 && { details }),
    ...(state && { state }),
  };

  const logSuffix = betKey ? `(Apuesta: ${betKey})` : "";
  const detailsLog =
    Object.keys(details).length > 0
      ? `\nDetalles: ${JSON.stringify(details, null, 2)}`
      : "";

  console.warn(
    `[ERROR][${errorCode}][${errorId}] Jugador ${socket.id}: ${message} ${logSuffix}${detailsLog}`
  );

  socket.emit("bet-error", errorPayload);

  console.log("📤 Backend: emitiendo bet-error a", socket.id, errorPayload);

  return errorId;
};

export const emitError = (socket, type, message, options = {}) => {
  const { betKey = null, details = {} } = options;
  const errorId = uuidv4();

  const errorPayload = {
    type,
    message,
    id: errorId,
    ...(betKey !== null && { betKey }),
    ...(Object.keys(details).length > 0 && { details }),
  };

  const logSuffix = betKey ? `(Apuesta: ${betKey})` : "";
  const detailsLog =
    Object.keys(details).length > 0
      ? `\nDetalles: ${JSON.stringify(details, null, 2)}`
      : "";

  console.warn(
    `[ERROR][${type}][${errorId}] Jugador ${socket.id}: ${message} ${logSuffix}${detailsLog}`
  );

  socket.emit("bet-error", errorPayload);
  return errorId;
};
