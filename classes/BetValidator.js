export class BetValidator {
  static CONFLICTING_BETS = [
    ["even_money_red", "even_money_black"],
    ["even_money_even", "even_money_odd"],
    ["even_money_low", "even_money_high"],
  ];

  static COLUMN_BET_KEYS = ["column_1", "column_2", "column_3"];
  static DOZEN_BET_KEYS = ["dozen_1", "dozen_2", "dozen_3"];

  /**
   * Valida si una nueva apuesta es permitida en combinación con las apuestas existentes.
   * @param {string} betKey La clave de la nueva apuesta.
   * @param {Map<string, number>} existingBets Las apuestas que el jugador ya ha hecho.
   * @returns {boolean} `true` si la apuesta es válida, `false` si hay un conflicto.
   */

  static isBetAllowed(betKey, existingBets) {
    for (const pair of BetValidator.CONFLICTING_BETS) {
      if (
        pair.includes(betKey) &&
        pair.some((key) => key !== betKey && existingBets.has(key))
      ) {
        console.warn(
          `No se puede apostar a ${pair.join(" y ")} al mismo tiempo.`
        );
        return false;
      }
    }

    const isCurrentBetColumn = BetValidator.COLUMN_BET_KEYS.includes(betKey);
    const isCurrentBetDozen = BetValidator.DOZEN_BET_KEYS.includes(betKey);
    const hasExistingColumnBet = BetValidator.COLUMN_BET_KEYS.some((key) =>
      existingBets.has(key)
    );
    const hasExistingDozenBet = BetValidator.DOZEN_BET_KEYS.some((key) =>
      existingBets.has(key)
    );

    if (isCurrentBetColumn && hasExistingDozenBet) {
      console.warn(
        "No se pueden combinar apuestas de columna con apuestas de docena."
      );
      return false;
    }
    if (isCurrentBetDozen && hasExistingColumnBet) {
      console.warn(
        "No se pueden combinar apuestas de docena con apuestas de columna."
      );
      return false;
    }

    return true;
  }
}
