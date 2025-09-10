// classes/BetValidator.js

export class BetValidator {
  static MAX_COVERED_NUMBERS = 27;

  static BET_COVERAGE_SETS = new Map([
    ["straight_0", new Set([0])],
    ["straight_1", new Set([1])],
    ["straight_2", new Set([2])],
    ["straight_3", new Set([3])],
    ["straight_4", new Set([4])],
    ["straight_5", new Set([5])],
    ["straight_6", new Set([6])],
    ["straight_7", new Set([7])],
    ["straight_8", new Set([8])],
    ["straight_9", new Set([9])],
    ["straight_10", new Set([10])],
    ["straight_11", new Set([11])],
    ["straight_12", new Set([12])],
    ["straight_13", new Set([13])],
    ["straight_14", new Set([14])],
    ["straight_15", new Set([15])],
    ["straight_16", new Set([16])],
    ["straight_17", new Set([17])],
    ["straight_18", new Set([18])],
    ["straight_19", new Set([19])],
    ["straight_20", new Set([20])],
    ["straight_21", new Set([21])],
    ["straight_22", new Set([22])],
    ["straight_23", new Set([23])],
    ["straight_24", new Set([24])],
    ["straight_25", new Set([25])],
    ["straight_26", new Set([26])],
    ["straight_27", new Set([27])],
    ["straight_28", new Set([28])],
    ["straight_29", new Set([29])],
    ["straight_30", new Set([30])],
    ["straight_31", new Set([31])],
    ["straight_32", new Set([32])],
    ["straight_33", new Set([33])],
    ["straight_34", new Set([34])],
    ["straight_35", new Set([35])],
    ["straight_36", new Set([36])],
    ["dozen_1", new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])],
    ["dozen_2", new Set([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])],
    ["dozen_3", new Set([25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36])],
    ["column_1", new Set([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34])],
    ["column_2", new Set([2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35])],
    ["column_3", new Set([3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36])],
    [
      "even_money_red",
      new Set([
        1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
      ]),
    ],
    [
      "even_money_black",
      new Set([
        2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
      ]),
    ],
    [
      "even_money_even",
      new Set([
        2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36,
      ]),
    ],
    [
      "even_money_odd",
      new Set([
        1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35,
      ]),
    ],
    [
      "even_money_low",
      new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
    ],
    [
      "even_money_high",
      new Set([
        19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
      ]),
    ],
  ]);

  static CONFLICTING_BETS = [
    ["even_money_red", "even_money_black"],
    ["even_money_even", "even_money_odd"],
    ["even_money_low", "even_money_high"],
  ];

  static COLUMN_BET_KEYS = ["column_1", "column_2", "column_3"];
  static DOZEN_BET_KEYS = ["dozen_1", "dozen_2", "dozen_3"];

  // =============== MÉTODOS AUXILIARES ===============

  static getCoveredNumbers(existingBets) {
    const coveredNumbers = new Set();
    for (const betKey of existingBets.keys()) {
      const numbersSet = this.BET_COVERAGE_SETS.get(betKey);
      if (numbersSet) {
        numbersSet.forEach((num) => coveredNumbers.add(num));
      }
    }
    return coveredNumbers;
  }

  static validateCoverageLimit(newBetKey, existingBets) {
    const currentCoverage = this.getCoveredNumbers(existingBets);
    const newBetNumbers = this.BET_COVERAGE_SETS.get(newBetKey)?.size || 0;
    const newCoverageSize = currentCoverage.size + newBetNumbers;

    return {
      isValid: newCoverageSize <= this.MAX_COVERED_NUMBERS,
      coveredCount: newCoverageSize,
      maxAllowed: this.MAX_COVERED_NUMBERS,
    };
  }

  static detectNonsensicalCombinations(newBetKey, existingBets) {
    // Creamos copia con la nueva apuesta
    const allBets = new Map(existingBets);
    allBets.set(newBetKey, 1);

    const betKeys = Array.from(allBets.keys());

    const hasAllDozens = this.DOZEN_BET_KEYS.every((key) =>
      betKeys.includes(key)
    );
    if (hasAllDozens) {
      return {
        hasNonsensicalCombination: true,
        reason: "No puedes apostar a las 3 docenas simultáneamente",
      };
    }

    const hasAllColumns = this.COLUMN_BET_KEYS.every((key) =>
      betKeys.includes(key)
    );
    if (hasAllColumns) {
      return {
        hasNonsensicalCombination: true,
        reason: "No puedes apostar a las 3 columnas simultáneamente",
      };
    }

    if (
      betKeys.includes("even_money_low") &&
      betKeys.includes("even_money_high")
    ) {
      return {
        hasNonsensicalCombination: true,
        reason:
          "No puedes apostar a ambos rangos (1-18 y 19-36) simultáneamente",
      };
    }

    if (
      betKeys.includes("even_money_even") &&
      betKeys.includes("even_money_odd")
    ) {
      return {
        hasNonsensicalCombination: true,
        reason: "No puedes apostar a par e impar simultáneamente",
      };
    }

    if (
      betKeys.includes("even_money_red") &&
      betKeys.includes("even_money_black")
    ) {
      return {
        hasNonsensicalCombination: true,
        reason: "No puedes apostar a rojo y negro simultáneamente",
      };
    }

    const dozenCount = this.DOZEN_BET_KEYS.filter((key) =>
      betKeys.includes(key)
    ).length;
    const columnCount = this.COLUMN_BET_KEYS.filter((key) =>
      betKeys.includes(key)
    ).length;

    if (
      dozenCount >= 2 &&
      columnCount >= 1 &&
      this.getCoveredNumbers(allBets).size > this.MAX_COVERED_NUMBERS
    ) {
      return {
        hasNonsensicalCombination: true,
        reason:
          "Esta combinación de docenas y columnas cubre demasiados números",
      };
    }

    return { hasNonsensicalCombination: false };
  }

  // =============== MÉTODOS PÚBLICOS ===============

  /**
   * Valida si una nueva apuesta es permitida en combinación con las apuestas existentes.
   * @param {string} betKey La clave de la nueva apuesta.
   * @param {Map<string, number>} existingBets Las apuestas que el jugador ya ha hecho.
   * @returns {boolean} `true` si la apuesta es válida, `false` si hay un conflicto.
   */
  static isBetAllowed(betKey, existingBets) {
    const result = this.isBetAllowedDetailed(betKey, existingBets);
    return result.allowed;
  }

  /**
   * Versión detallada: devuelve razón y cobertura si falla.
   * @param {string} newBetKey
   * @param {Map<string, number>} existingBets
   * @returns {Object} { allowed: boolean, reason?: string, coverage?: Object }
   */
  static isBetAllowedDetailed(newBetKey, existingBets) {
    // 1. Validar conflictos directos
    for (const pair of this.CONFLICTING_BETS) {
      if (pair.includes(newBetKey)) {
        const conflictingBet = pair.find((key) => key !== newBetKey);
        if (conflictingBet && existingBets.has(conflictingBet)) {
          return {
            allowed: false,
            reason: `Conflicto: no puedes apostar a ${newBetKey} y ${conflictingBet} simultáneamente`,
          };
        }
      }
    }

    // 2. Validar combinación docenas/columnas
    const isNewBetColumn = this.COLUMN_BET_KEYS.includes(newBetKey);
    const isNewBetDozen = this.DOZEN_BET_KEYS.includes(newBetKey);
    const hasExistingColumnBet = this.COLUMN_BET_KEYS.some((key) =>
      existingBets.has(key)
    );
    const hasExistingDozenBet = this.DOZEN_BET_KEYS.some((key) =>
      existingBets.has(key)
    );

    if (
      (isNewBetColumn && hasExistingDozenBet) ||
      (isNewBetDozen && hasExistingColumnBet)
    ) {
      return {
        allowed: false,
        reason: "No puedes combinar apuestas de docenas y columnas",
      };
    }

    // 3. Validar combinaciones absurdas
    const nonsensicalCheck = this.detectNonsensicalCombinations(
      newBetKey,
      existingBets
    );
    if (nonsensicalCheck.hasNonsensicalCombination) {
      return { allowed: false, reason: nonsensicalCheck.reason };
    }

    // 4. Validar límite de cobertura
    const coverageCheck = this.validateCoverageLimit(newBetKey, existingBets);
    if (!coverageCheck.isValid) {
      return {
        allowed: false,
        reason: `Esta apuesta cubriría ${coverageCheck.coveredCount} números (máximo permitido: ${coverageCheck.maxAllowed})`,
        coverage: {
          current: this.getCoveredNumbers(existingBets).size,
          withNew: coverageCheck.coveredCount,
          max: coverageCheck.maxAllowed,
        },
      };
    }

    // ✅ Todo OK
    return {
      allowed: true,
      coverage: {
        current: this.getCoveredNumbers(existingBets).size,
        withNew: coverageCheck.coveredCount,
        max: coverageCheck.maxAllowed,
      },
    };
  }
}
