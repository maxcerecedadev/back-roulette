// constants/errorMessages.js

/**
 * Catálogo centralizado de errores.
 * Fácil de modificar, traducir o extender.
 * Cada error tiene: type (para frontend actual), message (español), y puede tener valores por defecto.
 */

export const ERROR_DEFINITIONS = {
  INSUFFICIENT_BALANCE: {
    type: "balance",
    message: "Saldo insuficiente para esta operación.",
  },
  GAME_STATE_INVALID: {
    type: "game_state",
    message: "No se aceptan apuestas en este momento.",
  },
  PLAYER_NOT_FOUND: {
    type: "server",
    message: "Jugador no encontrado.",
  },
  BET_NOT_ALLOWED: {
    type: "validation",
    message: "Apuesta no permitida en esta combinación.",
  },
  NO_BETS_TO_UNDO: {
    type: "validation",
    message: "No hay apuestas para deshacer.",
  },
  NO_BETS_TO_REPEAT: {
    type: "validation",
    message: "No hay apuestas para repetir.",
  },
  SERVER_ERROR: {
    type: "server",
    message: "Error interno del servidor.",
  },
  BET_CONFLICT: {
    type: "validation",
    message: "No puedes combinar estas apuestas.",
  },
  BET_COVERAGE_EXCEEDED: {
    type: "validation",
    message: "Has excedido el límite de números cubiertos.",
  },
  BET_TYPE_LIMIT_EXCEEDED: {
    type: "validation",
    message: "Has superado el límite de apuesta para este tipo.",
  },
  ALREADY_IN_TOURNAMENT: {
    message:
      "Ya estás en otro torneo. Termina el actual antes de unirte a otro.",
  },
  TOURNAMENT_ALREADY_STARTED: {
    message: "El torneo ya ha comenzado. No puedes salir.",
  },
  PLAYER_NOT_IN_ROOM: { message: "No estás inscrito en este torneo." },
};

export const getErrorDefinition = (key) => {
  return ERROR_DEFINITIONS[key] || ERROR_DEFINITIONS.SERVER_ERROR;
};
