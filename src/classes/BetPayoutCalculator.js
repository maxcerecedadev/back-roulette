// src/classes/BetPayoutCalculator.js

export class BetPayoutCalculator {
  /**
   * Calcula el multiplicador de pago de una apuesta según el tipo y el número ganador.
   * @param {{number: number, color: string}} winningNumber - Objeto con número y color ganador
   * @param {string} betKey - La clave de la apuesta (ej. 'straight_17', 'street_13_14_15', 'even_money_red')
   * @param {Set<number>} redNumbers - Conjunto de números rojos
   * @param {Set<number>} blackNumbers - Conjunto de números negros
   * @returns {number} multiplicador de pago (0 si pierde, >0 si gana)
   */
  static calculatePayout(winningNumber, betKey, redNumbers, blackNumbers) {
    const winningNum = Number(winningNumber.number);

    const parts = betKey.trim().split("_");
    const betType = parts[0];
    const numberParts = parts.slice(1).map(Number);

    if (betKey.startsWith("even_money")) {
      const type = parts[2]; // red, black, even, odd, low, high
      if (type === "red") return redNumbers.has(winningNum) ? 1 : 0;
      if (type === "black") return blackNumbers.has(winningNum) ? 1 : 0;
      if (type === "even") return winningNum !== 0 && winningNum % 2 === 0 ? 1 : 0;
      if (type === "odd") return winningNum % 2 === 1 ? 1 : 0;
      if (type === "low") return winningNum >= 1 && winningNum <= 18 ? 1 : 0;
      if (type === "high") return winningNum >= 19 && winningNum <= 36 ? 1 : 0;
      return 0;
    }

    // Si el número ganador es 0, pierden docenas, columnas y even_money
    if (winningNum === 0 && ["dozen", "column"].includes(betType)) {
      return 0;
    }

    switch (betType) {
      // ------------------------ STRAIGHT
      case "straight":
        return numberParts[0] === winningNum ? 35 : 0;

      // ------------------------ SPLIT
      case "split":
        return numberParts.length === 2 && numberParts.includes(winningNum) ? 17 : 0;

      // ------------------------ STREET (3 números explícitos)
      case "street":
        return numberParts.length === 3 && numberParts.includes(winningNum) ? 11 : 0;

      // ------------------------ CORNER (4 números explícitos)
      case "corner":
        return numberParts.length === 4 && numberParts.includes(winningNum) ? 8 : 0;

      // ------------------------ LINE (6 números explícitos)
      case "line":
        return numberParts.length === 6 && numberParts.includes(winningNum) ? 5 : 0;

      // ------------------------ TRIO (3 números: 0,1,2 o 0,2,3)
      case "trio":
        return numberParts.length === 3 && numberParts.includes(winningNum) ? 11 : 0;

      // ------------------------ DOZEN
      case "dozen": {
        const dozen = numberParts[0];
        const start = (dozen - 1) * 12 + 1;
        const end = dozen * 12;
        return winningNum >= start && winningNum <= end ? 2 : 0;
      }

      // ------------------------ COLUMN
      case "column": {
        const col = numberParts[0];
        const colMap = {
          1: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
          2: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
          3: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
        };
        return colMap[col]?.includes(winningNum) ? 2 : 0;
      }

      // ------------------------ BASKET (0,1,2,3)
      case "basket":
        return [0, 1, 2, 3].includes(winningNum) ? 8 : 0;

      // ------------------------ DESCONOCIDO
      default:
        return 0;
    }
  }
}
