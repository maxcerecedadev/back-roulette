// src/domain/value-objects/BetLimits.js

export class BetLimits {
  static MAX_BETS = {
    straight: 10000, // directa
    split: 20000, // dividida
    corner: 40000, // de esquina
    column: 50000, // de columna
    dozen: 50000, // de docena
    even_money: 100000, // de dinero par
  };

  /**
   * Obtiene el límite máximo para un tipo de apuesta según su betKey.
   * @param {string} betKey - Ej: "straight_17", "even_money_red", "column_1"
   * @returns {number} - Límite máximo permitido
   */
  static getMaxBetForType(betKey) {
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
   * Devuelve un nombre amigable para mostrar al usuario según el tipo de apuesta.
   * @param {string} betKey - Ej: "straight_17", "even_money_red"
   * @returns {string} - Nombre legible
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
   * Valida si el monto total propuesto (existente + nuevo) excede el límite.
   * @param {string} betKey
   * @param {Map<string, number>} existingBets - Mapa de apuestas actuales del jugador
   * @param {number} newAmount - Monto que se quiere apostar ahora
   * @returns {{ allowed: boolean, maxAllowed?: number, currentAmount?: number, proposedTotal?: number }}
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
