// src/domain/value-objects/BetPayoutCalculator.js

/**
 * Calculadora de pagos para apuestas de ruleta europea.
 * Implementa las reglas oficiales de pago según el tipo de apuesta.
 * Retorna multiplicadores que se aplican al monto apostado.
 */
export class BetPayoutCalculator {
  /**
   * Calcula el multiplicador de pago de una apuesta según el tipo y el número ganador.
   * Implementa las reglas oficiales de la ruleta europea para todos los tipos de apuesta.
   * @param {{number: number, color: string}} winningNumber - Objeto con número y color ganador
   * @param {string} betKey - La clave de la apuesta (ej. 'straight_17', 'street_13_14_15', 'even_money_red')
   * @param {Set<number>} redNumbers - Conjunto de números rojos de la ruleta
   * @param {Set<number>} blackNumbers - Conjunto de números negros de la ruleta
   * @returns {number} Multiplicador de pago (0 si pierde, >0 si gana).
   *   El multiplicador se aplica al monto apostado para calcular las ganancias.
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

    // Regla especial: el 0 hace perder a docenas, columnas y even_money
    if (winningNum === 0 && ["dozen", "column"].includes(betType)) {
      return 0;
    }

    // Calcular multiplicador según el tipo de apuesta
    switch (betType) {
      // ------------------------ STRAIGHT (Apuesta directa a un número)
      case "straight":
        return numberParts[0] === winningNum ? 35 : 0; // Pago 35:1

      // ------------------------ SPLIT (Apuesta a dos números adyacentes)
      case "split":
        return numberParts.length === 2 && numberParts.includes(winningNum) ? 17 : 0; // Pago 17:1

      // ------------------------ STREET (Apuesta a una fila de 3 números)
      case "street":
        return numberParts.length === 3 && numberParts.includes(winningNum) ? 11 : 0; // Pago 11:1

      // ------------------------ CORNER (Apuesta a 4 números en esquina)
      case "corner":
        return numberParts.length === 4 && numberParts.includes(winningNum) ? 8 : 0; // Pago 8:1

      // ------------------------ LINE (Apuesta a 6 números en dos filas)
      case "line":
        return numberParts.length === 6 && numberParts.includes(winningNum) ? 5 : 0; // Pago 5:1

      // ------------------------ TRIO (Apuesta a 0,1,2 o 0,2,3)
      case "trio":
        return numberParts.length === 3 && numberParts.includes(winningNum) ? 11 : 0; // Pago 11:1

      // ------------------------ DOZEN (Apuesta a una docena: 1-12, 13-24, 25-36)
      case "dozen": {
        const dozen = numberParts[0];
        const start = (dozen - 1) * 12 + 1;
        const end = dozen * 12;
        return winningNum >= start && winningNum <= end ? 2 : 0;
      }

      // ------------------------ COLUMN (Apuesta a una columna vertical)
      case "column": {
        const col = numberParts[0];
        const colMap = {
          1: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
          2: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
          3: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
        };
        return colMap[col]?.includes(winningNum) ? 2 : 0; // Pago 2:1
      }

      // ------------------------ BASKET (Apuesta a 0,1,2,3)
      case "basket":
        return [0, 1, 2, 3].includes(winningNum) ? 8 : 0;

      // ------------------------ TIPO DESCONOCIDO
      default:
        return 0; // No hay pago para tipos de apuesta no reconocidos
    }
  }
}
