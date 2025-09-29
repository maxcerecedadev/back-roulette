// src/domain/value-objects/BetLimits.js

/**
 * Gestor de límites de apuestas por tipo.
 * Define los montos máximos permitidos para cada tipo de apuesta en la ruleta.
 * Previene apuestas excesivas que podrían comprometer la estabilidad del casino.
 */
export class BetLimits {
  /**
   * Límites máximos de apuesta por tipo en fichas.
   * Estos límites protegen al casino de pérdidas excesivas y mantienen el juego equilibrado.
   * @type {Object<string, number>}
   */
  static MAX_BETS = {
    straight: 10000, // Apuesta directa a un número (35:1)
    split: 20000, // Apuesta dividida entre dos números (17:1)
    corner: 40000, // Apuesta de esquina a 4 números (8:1)
    column: 50000, // Apuesta de columna (2:1)
    dozen: 50000, // Apuesta de docena (2:1)
    even_money: 100000, // Apuestas de dinero par (1:1)
  };

  /**
   * Obtiene el límite máximo para un tipo de apuesta según su clave.
   * @param {string} betKey - Clave de la apuesta (ej: "straight_17", "even_money_red", "column_1")
   * @returns {number} Límite máximo permitido en fichas para este tipo de apuesta.
   */
  static getMaxBetForType(betKey) {
    // Determinar el tipo de apuesta basado en el prefijo de la clave
    if (betKey.startsWith("straight_")) return this.MAX_BETS.straight;
    if (betKey.startsWith("split_")) return this.MAX_BETS.split;
    if (betKey.startsWith("corner_")) return this.MAX_BETS.corner;
    if (betKey.startsWith("column_")) return this.MAX_BETS.column;
    if (betKey.startsWith("dozen_")) return this.MAX_BETS.dozen;
    if (betKey.startsWith("even_money_")) return this.MAX_BETS.even_money;

    console.warn(`⚠️ Tipo de apuesta desconocido: ${betKey}`);
    return Infinity;
  }

  /**
   * Convierte una clave de apuesta en un nombre amigable para mostrar al usuario.
   * @param {string} betKey - Clave de la apuesta (ej: "straight_17", "even_money_red")
   * @returns {string} Nombre legible del tipo de apuesta en español.
   */
  static getBetTypeName(betKey) {
    if (betKey.startsWith("straight_")) return "apuesta directa";
    if (betKey.startsWith("split_")) return "apuesta dividida";
    if (betKey.startsWith("corner_")) return "apuesta de esquina";
    if (betKey.startsWith("column_") || betKey.startsWith("dozen_"))
      return "apuesta de docena o columna";
    if (betKey.startsWith("even_money_")) return "apuesta de dinero par";
    return "esta apuesta";
  }

  /**
   * Valida si el monto total propuesto excede el límite permitido para el tipo de apuesta.
   * @param {string} betKey - Clave de la apuesta a validar.
   * @param {Map<string, number>} existingBets - Apuestas actuales del jugador.
   * @param {number} newAmount - Monto que se quiere apostar adicionalmente.
   * @returns {Object} Resultado de la validación con detalles del error si aplica.
   * @returns {boolean} returns.allowed - Si el monto es permitido.
   * @returns {number} [returns.maxAllowed] - Límite máximo permitido.
   * @returns {number} [returns.currentAmount] - Monto actual ya apostado.
   * @returns {number} [returns.proposedTotal] - Total propuesto (actual + nuevo).
   */
  static validateBetAmount(betKey, existingBets, newAmount) {
    const maxAllowed = this.getMaxBetForType(betKey);
    const currentAmount = existingBets.get(betKey) || 0;
    const proposedTotal = currentAmount + newAmount;

    if (proposedTotal > maxAllowed) {
      return {
        allowed: false,
        maxAllowed,
        currentAmount,
        proposedTotal,
        betType: this.getBetTypeName(betKey),
      };
    }

    return { allowed: true };
  }
}
