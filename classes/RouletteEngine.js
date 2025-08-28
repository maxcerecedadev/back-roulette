// classes/RouletteEngine.js

export class RouletteEngine {
  static RED_NUMBERS = new Set([
    1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
  ]);
  static BLACK_NUMBERS = new Set([
    2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
  ]);

  static CONFLICTING_BETS = [
    ["even_money_red", "even_money_black"],
    ["even_money_even", "even_money_odd"],
    ["even_money_low", "even_money_high"],
  ]; // Reglas para combinaciones de apuestas

  static COLUMN_BET_KEYS = ["column_1", "column_2", "column_3"];
  static DOZEN_BET_KEYS = ["dozen_1", "dozen_2", "dozen_3"];

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
    if (this.resultsQueue.length === 0) {
      this.fillQueue();
    }
    const result = this.resultsQueue.shift();
    this.fillQueue(); // Asegura que la cola siempre esté llena
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
   * Determina si una apuesta es ganadora y cuánto paga.
   * @param {{number: number, color: string}} winningNumber - El número ganador.
   * @param {string} betKey - La clave de la apuesta (ej. 'straight_17', 'split_17_18', 'red').
   * @returns {number} El multiplicador de pago (pago + apuesta original).
   */

  getBetResult(winningNumber, betKey) {
    const winningNum = Number(winningNumber.number);

    let betType;
    let type;

    if (betKey.startsWith("even_money")) {
      betType = "even_money";
      type = betKey.split("_")[2]; // red, black, even, odd, low, high
    } else {
      const betParts = betKey.trim().split("_");
      betType = betParts[0];
    }

    // Cero = pierde en todas las apuestas externas
    if (
      winningNum === 0 &&
      ["even_money", "dozen", "column", "2:1"].includes(betType)
    ) {
      return 0;
    }

    switch (betType) {
      case "straight": {
        const straightNum = Number(betKey.split("_")[1]);
        if (straightNum === winningNum) return 35; // 35:1
        break;
      }

      case "split": {
        const splitNums = betKey.split("_").slice(1).map(Number);
        if (splitNums.includes(winningNum)) return 17; // 17:1
        break;
      }

      case "trio": {
        const trioNums = betKey.split("_").slice(1).map(Number);
        if (trioNums.includes(winningNum)) return 11; // 11:1
        break;
      }

      case "street": {
        const start = Number(betKey.split("_")[1]);
        if (winningNum >= start && winningNum <= start + 2) return 11; // 11:1
        break;
      }

      case "corner": {
        const cornerNums = betKey.split("_").slice(1).map(Number);
        if (cornerNums.includes(winningNum)) return 8; // 8:1
        break;
      }

      case "line": {
        const lineNums = betKey.split("_").slice(1).map(Number);
        if (winningNum >= lineNums[0] && winningNum <= lineNums[1] + 5)
          return 5; // 5:1
        break;
      }

      case "dozen": {
        const dozen = Number(betKey.split("_")[1]); // 1,2,3
        const start = (dozen - 1) * 12 + 1;
        const end = dozen * 12;
        if (winningNum >= start && winningNum <= end) return 2; // 2:1
        break;
      }

      case "even_money": {
        if (type === "red" && RouletteEngine.RED_NUMBERS.has(winningNum))
          return 1;
        if (type === "black" && RouletteEngine.BLACK_NUMBERS.has(winningNum))
          return 1;
        if (type === "even" && winningNum !== 0 && winningNum % 2 === 0)
          return 1;
        if (type === "odd" && winningNum % 2 !== 0) return 1;
        if (type === "low" && winningNum >= 1 && winningNum <= 18) return 1;
        if (type === "high" && winningNum >= 19 && winningNum <= 36) return 1;
        break;
      }

      case "column": {
        const column = Number(betKey.split("_")[1]); // 1,2,3
        const colMap = {
          1: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
          2: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
          3: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
        };
        if (colMap[column]?.includes(winningNum)) return 2; // 2:1
        break;
      }
    }

    return 0; // pérdida
  }

  /**
   * Valida si una nueva apuesta es permitida en combinación con las apuestas existentes.
   * @param {string} betKey La clave de la nueva apuesta.
   * @param {Map<string, number>} existingBets Las apuestas que el jugador ya ha hecho.
   * @returns {boolean} `true` si la apuesta es válida, `false` si hay un conflicto.
   */

  isBetAllowed(betKey, existingBets) {
    // 1. Verificar apuestas que se excluyen mutuamente
    for (const pair of RouletteEngine.CONFLICTING_BETS) {
      if (
        pair.includes(betKey) &&
        pair.some((key) => key !== betKey && existingBets.has(key))
      ) {
        console.warn(
          `No se puede apostar a ${pair.join(" y ")} al mismo tiempo.`
        );
        return false;
      }
    } // 2. Verificar combinaciones de columnas y docenas

    const isCurrentBetColumn = RouletteEngine.COLUMN_BET_KEYS.includes(betKey);
    const isCurrentBetDozen = RouletteEngine.DOZEN_BET_KEYS.includes(betKey);
    const hasExistingColumnBet = RouletteEngine.COLUMN_BET_KEYS.some((key) =>
      existingBets.has(key)
    );
    const hasExistingDozenBet = RouletteEngine.DOZEN_BET_KEYS.some((key) =>
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
