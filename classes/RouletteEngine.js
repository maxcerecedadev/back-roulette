// classes/RouletteEngine.js

import { BetValidator } from "./BetValidator.js";
import { BetPayoutCalculator } from "./BetPayoutCalculator.js";

export class RouletteEngine {
  static RED_NUMBERS = new Set([
    1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
  ]);
  static BLACK_NUMBERS = new Set([
    2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
  ]);

  static COLUMN_BET_KEYS = ["column_1", "column_2", "column_3"];
  static DOZEN_BET_KEYS = ["dozen_1", "dozen_2", "dozen_3"];
  static CONFLICTING_BETS = BetValidator.CONFLICTING_BETS;

  /**
   * @param {number} queueSize - El tamaño de la cola de resultados futuros.
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
      RouletteEngine.BLACK_NUMBERS
    );
  }

  /**
   * Verifica si una apuesta nueva es permitida según las apuestas existentes.
   * @param {string} betKey - La clave de la apuesta a verificar.
   * @param {Map<string, number>} existingBets - Mapa de apuestas actuales del jugador.
   * @returns {boolean} `true` si la apuesta es válida, `false` si hay conflicto con otras apuestas.
   */
  isBetAllowed(betKey, existingBets) {
    return BetValidator.isBetAllowed(betKey, existingBets);
  }
}
