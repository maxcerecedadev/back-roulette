// src/domain/entities/RouletteEngine.js

import { BetValidator } from "#domain/value-objects/BetValidator.js";
import { BetPayoutCalculator } from "#domain/value-objects/BetPayoutCalculator.js";
import { BetLimits } from "#domain/value-objects/BetLimits.js";

export class RouletteEngine {
  static RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  static BLACK_NUMBERS = new Set([
    2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
  ]);

  static COLUMN_BET_KEYS = ["column_1", "column_2", "column_3"];
  static DOZEN_BET_KEYS = ["dozen_1", "dozen_2", "dozen_3"];
  static CONFLICTING_BETS = BetValidator.CONFLICTING_BETS;

  // 👇 MAPA DE TRADUCCIÓN: betKey → nombre amigable en español
  static BET_KEY_NAMES = {
    even_money_red: "rojo",
    even_money_black: "negro",
    even_money_even: "par",
    even_money_odd: "impar",
    even_money_low: "1-18",
    even_money_high: "19-36",
    dozen_1: "1ra docena (1-12)",
    dozen_2: "2da docena (13-24)",
    dozen_3: "3ra docena (25-36)",
    column_1: "columna 1",
    column_2: "columna 2",
    column_3: "columna 3",
    straight_0: "número 0",
    straight_1: "número 1",
    straight_2: "número 2",
    straight_3: "número 3",
    straight_4: "número 4",
    straight_5: "número 5",
    straight_6: "número 6",
    straight_7: "número 7",
    straight_8: "número 8",
    straight_9: "número 9",
    straight_10: "número 10",
    straight_11: "número 11",
    straight_12: "número 12",
    straight_13: "número 13",
    straight_14: "número 14",
    straight_15: "número 15",
    straight_16: "número 16",
    straight_17: "número 17",
    straight_18: "número 18",
    straight_19: "número 19",
    straight_20: "número 20",
    straight_21: "número 21",
    straight_22: "número 22",
    straight_23: "número 23",
    straight_24: "número 24",
    straight_25: "número 25",
    straight_26: "número 26",
    straight_27: "número 27",
    straight_28: "número 28",
    straight_29: "número 29",
    straight_30: "número 30",
    straight_31: "número 31",
    straight_32: "número 32",
    straight_33: "número 33",
    straight_34: "número 34",
    straight_35: "número 35",
    straight_36: "número 36",
  };

  // 👇 FUNCIÓN AUXILIAR: Reemplaza betKeys por nombres amigables en mensajes
  static humanizeBetKeyInMessage(message) {
    if (!message || typeof message !== "string") return message;

    for (const [key, name] of Object.entries(this.BET_KEY_NAMES)) {
      const regex = new RegExp(`\\b${key}\\b`, "g");
      message = message.replace(regex, name);
    }

    return message;
  }

  /**
   * @param {number} queueSize
   */
  constructor(queueSize = 10) {
    this.queueSize = queueSize;
    this.resultsQueue = [];
    this.fillQueue();
  }

  /**
   * Genera un número aleatorio de la ruleta (0-36).
   * @returns {number} El número aleatorio.
   */
  generateRandomNumber() {
    return Math.floor(Math.random() * 37);
  }

  /**
   * Determina el color de un número de la ruleta.
   * @param {number} number - El número de la ruleta.
   * @returns {string} El color ('red', 'black', 'green').
   */
  numberToColor(number) {
    if (number === 0) return "green";
    if (RouletteEngine.RED_NUMBERS.has(number)) return "red";
    return "black";
  }

  /**
   * Genera un resultado completo (número y color).
   * @returns {object} Un objeto con el número y el color.
   */
  generateResult() {
    const number = this.generateRandomNumber();
    const color = this.numberToColor(number);
    return { number, color };
  }

  /**
   * Rellena la cola de resultados si es necesario.
   * Se llama para mantener un número mínimo de resultados pregenerados.
   */
  fillQueue() {
    while (this.resultsQueue.length < this.queueSize) {
      this.resultsQueue.push(this.generateResult());
    }
  }

  /**
   * Obtiene el próximo resultado de la cola y la rellena.
   * @returns {object} El próximo resultado.
   */
  getNextWinningNumber() {
    if (this.resultsQueue.length === 0) this.fillQueue();
    const result = this.resultsQueue.shift();
    this.fillQueue();
    return result;
  }

  /**
   * Muestra los resultados futuros sin eliminarlos de la cola.
   * @returns {Array<object>} Una copia de la cola de resultados.
   */
  peekQueue() {
    return [...this.resultsQueue];
  }

  /**
   * Calcula el multiplicador de pago de una apuesta usando BetPayoutCalculator.
   * @param {{number: number, color: string}} winningNumber - Objeto con número y color ganador.
   * @param {string} betKey - La clave de la apuesta (ej. 'straight_17', 'split_17_18', 'even_money_red').
   * @returns {number} El multiplicador de pago según las reglas de la apuesta (0 si pierde).
   */
  calculatePayout(winningNumber, betKey) {
    return BetPayoutCalculator.calculatePayout(
      winningNumber,
      betKey,
      RouletteEngine.RED_NUMBERS,
      RouletteEngine.BLACK_NUMBERS,
    );
  }

  /**
   * ✅ NUEVO: Valida una apuesta con detalles (límites + combinaciones)
   * @param {string} betKey
   * @param {Map<string, number>} existingBets
   * @param {number} newAmount
   * @returns {{
   *   allowed: boolean,
   *   reasonCode?: string,
   *   details?: any
   * }}
   */
  isBetAllowedDetailed(betKey, existingBets, newAmount = 0) {
    // 1. Validar límites de apuesta (si se pasa newAmount)
    if (newAmount > 0) {
      const limitValidation = BetLimits.validateBetAmount(betKey, existingBets, newAmount);
      if (!limitValidation.allowed) {
        return {
          allowed: false,
          reasonCode: "BET_TYPE_LIMIT_EXCEEDED",
          details: limitValidation,
        };
      }
    }

    // 2. Validar combinaciones (conflictos, docenas/columnas, etc.)
    const betValidation = BetValidator.isBetAllowedDetailed(betKey, existingBets);
    if (!betValidation.allowed) {
      // Inferir reasonCode según contenido del mensaje
      let reasonCode = "BET_NOT_ALLOWED";

      if (betValidation.reason?.includes("cubriría")) {
        reasonCode = "BET_COVERAGE_EXCEEDED";
      } else if (
        betValidation.reason?.includes("Conflicto") ||
        betValidation.reason?.includes("simultáneamente") ||
        betValidation.reason?.includes("combinar") ||
        betValidation.reason?.includes("rojo y negro") ||
        betValidation.reason?.includes("par e impar") ||
        betValidation.reason?.includes("1-18 y 19-36") ||
        betValidation.reason?.includes("docenas") ||
        betValidation.reason?.includes("columnas")
      ) {
        reasonCode = "BET_CONFLICT";
      }

      // 👇 HUMANIZAMOS EL MENSAJE antes de enviarlo
      const humanizedReason = this.constructor.humanizeBetKeyInMessage(betValidation.reason);

      return {
        allowed: false,
        reasonCode,
        details: {
          betKey,
          reason: humanizedReason, // ✅ Ahora en español amigable
          ...(betValidation.coverage && { coverage: betValidation.coverage }),
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Verifica si una apuesta nueva es permitida según las apuestas existentes.
   * @param {string} betKey - La clave de la apuesta a verificar.
   * @param {Map<string, number>} existingBets - Mapa de apuestas actuales del jugador.
   * @returns {boolean} `true` si la apuesta es válida, `false` si hay conflicto con otras apuestas.
   */
  isBetAllowed(betKey, existingBets) {
    const result = this.isBetAllowedDetailed(betKey, existingBets, 0);
    return result.allowed;
  }
}
