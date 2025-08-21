// classes/RouletteEngine.js

export class RouletteEngine {
  static RED_NUMBERS = new Set([
    1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
  ]);
  static BLACK_NUMBERS = new Set([
    2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
  ]);

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

  // --- Lógica para el cálculo de pagos ---
  // A partir de aquí se ha añadido el nuevo código.

  /**
   * Determina si una apuesta es ganadora y cuánto paga.
   * @param {{number: number, color: string}} winningNumber - El número ganador.
   * @param {string} betKey - La clave de la apuesta (ej. 'straight_17', 'split_17_18', 'red').
   * @returns {number} El multiplicador de pago (pago + apuesta original).
   */
  getBetResult(winningNumber, betKey) {
    const winningNum = winningNumber.number;
    const betParts = betKey.split("_");
    const betType = betParts[0];

    // Para cualquier apuesta, si el número ganador es 0, las apuestas perimetrales pierden.
    if (
      winningNum === 0 &&
      (betType === "even_money" || betType === "dozen" || betType === "column")
    ) {
      return 0;
    }

    switch (betType) {
      // Apuesta directa: paga 35:1
      case "straight":
        if (parseInt(betParts[1]) === winningNum) {
          return 36;
        }
        break;

      // Apuesta dividida: paga 17:1
      case "split": {
        const splitNums = betParts.slice(1).map(Number);
        if (splitNums.includes(winningNum)) {
          return 18;
        }
        break;
      }

      // Apuesta a trío: paga 11:1
      case "trio": {
        const trioNums = betParts.slice(1).map(Number);
        if (trioNums.includes(winningNum)) {
          return 12;
        }
        break;
      }

      // Apuesta de calle: paga 11:1
      case "street": {
        const streetStart = parseInt(betParts[1]);
        const streetEnd = streetStart + 2;
        if (winningNum >= streetStart && winningNum <= streetEnd) {
          return 12;
        }
        break;
      }

      // Apuesta de esquina: paga 8:1
      case "corner": {
        const cornerNums = betParts.slice(1).map(Number);
        if (cornerNums.includes(winningNum)) {
          return 9;
        }
        break;
      }

      // Apuesta de línea: paga 5:1
      case "line": {
        const lineNums = betParts.slice(1).map(Number);
        if (winningNum >= lineNums[0] && winningNum <= lineNums[1] + 5) {
          return 6;
        }
        break;
      }

      // Apuesta de columna: paga 2:1
      case "column": {
        const column = parseInt(betParts[1]);
        if (winningNum % 3 === (column === 3 ? 0 : column)) {
          return 3;
        }
        break;
      }

      // Apuesta de docena: paga 2:1
      case "dozen": {
        const dozen = parseInt(betParts[1]);
        const dozenStart = (dozen - 1) * 12 + 1;
        const dozenEnd = dozen * 12;
        if (winningNum >= dozenStart && winningNum <= dozenEnd) {
          return 3;
        }
        break;
      }

      // Apuesta al par (even money): paga 1:1
      case "even_money": {
        const type = betParts[1];
        if (type === "red" && RouletteEngine.RED_NUMBERS.has(winningNum))
          return 2;
        if (type === "black" && RouletteEngine.BLACK_NUMBERS.has(winningNum))
          return 2;
        if (type === "even" && winningNum !== 0 && winningNum % 2 === 0)
          return 2;
        if (type === "odd" && winningNum % 2 !== 0) return 2;
        if (type === "low" && winningNum >= 1 && winningNum <= 18) return 2;
        if (type === "high" && winningNum >= 19 && winningNum <= 36) return 2;
        break;
      }
    }

    return 0;
  }
}
