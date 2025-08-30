export class BetPayoutCalculator {
  /**
   * Calcula el multiplicador de pago de una apuesta según el tipo y el número ganador.
   * @param {{number: number, color: string}} winningNumber - Objeto con número y color ganador
   * @param {string} betKey - La clave de la apuesta (ej. 'straight_17', 'split_17_18', 'even_money_red')
   * @param {Set<number>} redNumbers - Conjunto de números rojos
   * @param {Set<number>} blackNumbers - Conjunto de números negros
   * @returns {number} multiplicador de pago (0 si pierde, >0 si gana)
   */
  static calculatePayout(winningNumber, betKey, redNumbers, blackNumbers) {
    const winningNum = Number(winningNumber.number);

    let betType;
    let type;

    // Determina si es apuesta "even_money" (rojo/negro, par/impar, bajo/alto)
    if (betKey.startsWith("even_money")) {
      betType = "even_money";
      type = betKey.split("_")[2]; // red, black, even, odd, low, high
    } else {
      const betParts = betKey.trim().split("_");
      betType = betParts[0]; // straight, split, trio, street, corner, line, dozen, column
    }

    // Si el número ganador es 0, todas las apuestas externas pierden
    if (
      winningNum === 0 &&
      ["even_money", "dozen", "column", "2:1"].includes(betType)
    )
      return 0;

    switch (betType) {
      // ------------------------
      case "straight":
        // Apuesta a un solo número. Si coincide con el ganador paga 35:1
        if (Number(betKey.split("_")[1]) === winningNum) return 35;
        break;

      // ------------------------
      case "split":
        // Apuesta a dos números contiguos. Si el ganador está entre ellos paga 17:1
        if (betKey.split("_").slice(1).map(Number).includes(winningNum))
          return 17;
        break;

      // ------------------------
      case "trio":
        // Apuesta a un grupo de 3 números (trío). Si el ganador está allí paga 11:1
        if (betKey.split("_").slice(1).map(Number).includes(winningNum))
          return 11;
        break;

      // ------------------------
      case "street":
        // Apuesta a una fila de 3 números consecutivos. Si el ganador está en esa fila paga 11:1
        if (
          winningNum >= Number(betKey.split("_")[1]) &&
          winningNum <= Number(betKey.split("_")[1]) + 2
        )
          return 11;
        break;

      // ------------------------
      case "corner":
        // Apuesta a un cuadrado de 4 números. Si el ganador está allí paga 8:1
        if (betKey.split("_").slice(1).map(Number).includes(winningNum))
          return 8;
        break;

      // ------------------------
      case "line": {
        // Apuesta a dos filas consecutivas (6 números). Si el ganador está allí paga 5:1
        const lineNums = betKey.split("_").slice(1).map(Number);
        if (winningNum >= lineNums[0] && winningNum <= lineNums[1] + 5)
          return 5;
        break;
      }

      // ------------------------
      case "dozen": {
        // Apuesta a una docena (1-12, 13-24, 25-36)
        const dozen = Number(betKey.split("_")[1]);
        const start = (dozen - 1) * 12 + 1;
        const end = dozen * 12;
        if (winningNum >= start && winningNum <= end) return 2; // Paga 2:1
        break;
      }

      // ------------------------
      case "even_money":
        // Apuesta externa: rojo/negro, par/impar, bajo/alto
        if (type === "red" && redNumbers.has(winningNum)) return 1;
        if (type === "black" && blackNumbers.has(winningNum)) return 1;
        if (type === "even" && winningNum !== 0 && winningNum % 2 === 0)
          return 1;
        if (type === "odd" && winningNum % 2 !== 0) return 1;
        if (type === "low" && winningNum >= 1 && winningNum <= 18) return 1;
        if (type === "high" && winningNum >= 19 && winningNum <= 36) return 1;
        break;

      // ------------------------
      case "column": {
        // Apuesta a una columna de 12 números
        const column = Number(betKey.split("_")[1]);
        const colMap = {
          3: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
          2: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
          1: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
        };
        if (colMap[column]?.includes(winningNum)) return 2; // Paga 2:1
        break;
      }
    }

    // Si no coincide con ninguna condición de pago, devuelve 0 (apuesta perdida)
    return 0;
  }
}
