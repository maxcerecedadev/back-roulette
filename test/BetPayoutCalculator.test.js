// BetPayoutCalculator.test.js

import { describe, test } from "@jest/globals";
import { BetPayoutCalculator } from "../src/classes/BetPayoutCalculator.js";
import assert from "node:assert";

describe("BetPayoutCalculator - Full Test Suite (European Roulette)", () => {
  const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const blackNumbers = new Set([
    2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
  ]);

  const allNumbers = Array.from({ length: 37 }, (_, i) => i); // 0 a 36

  // --- HELPERS ---
  const getNumberColor = (num) => {
    if (num === 0) return "green";
    return redNumbers.has(num) ? "red" : "black";
  };

  const winningNumber = (num) => ({ number: num, color: getNumberColor(num) });

  // --- STRAIGHT BETS (35:1) ---
  describe("Straight Bets (35:1)", () => {
    test("should win 35x when number matches", () => {
      for (const num of allNumbers) {
        const payout = BetPayoutCalculator.calculatePayout(
          winningNumber(num),
          `straight_${num}`,
          redNumbers,
          blackNumbers,
        );
        assert.strictEqual(payout, 35, `straight_${num} should pay 35`);
      }
    });

    test("should lose when number does not match", () => {
      const payout = BetPayoutCalculator.calculatePayout(
        winningNumber(5),
        "straight_10",
        redNumbers,
        blackNumbers,
      );
      assert.strictEqual(payout, 0);
    });
  });

  // --- SPLIT BETS (17:1) ---
  describe("Split Bets (17:1)", () => {
    const splits = [
      // Horizontales
      [1, 2],
      [2, 3],
      [4, 5],
      [5, 6],
      [7, 8],
      [8, 9],
      [10, 11],
      [11, 12],
      [13, 14],
      [14, 15],
      [15, 16],
      [16, 17],
      [17, 18],
      [19, 20],
      [20, 21],
      [22, 23],
      [23, 24],
      [25, 26],
      [26, 27],
      [28, 29],
      [29, 30],
      [31, 32],
      [32, 33],
      [33, 34],
      [34, 35],
      [35, 36],
      // Verticales
      [1, 4],
      [2, 5],
      [3, 6],
      [4, 7],
      [5, 8],
      [6, 9],
      [7, 10],
      [8, 11],
      [9, 12],
      [10, 13],
      [11, 14],
      [12, 15],
      [13, 16],
      [14, 17],
      [15, 18],
      [19, 22],
      [20, 23],
      [21, 24],
      [22, 25],
      [23, 26],
      [24, 27],
      [28, 31],
      [29, 32],
      [30, 33],
      [31, 34],
      [32, 35],
      [33, 36],
    ];

    for (const [a, b] of splits) {
      const betKey = `split_${a}_${b}`;
      test(`${betKey} should win on ${a} or ${b}`, () => {
        for (const win of [a, b]) {
          const payout = BetPayoutCalculator.calculatePayout(
            winningNumber(win),
            betKey,
            redNumbers,
            blackNumbers,
          );
          assert.strictEqual(payout, 17, `${betKey} on ${win}`);
        }

        const other = (a + b + 1) % 37;
        if (![a, b].includes(other)) {
          const payout = BetPayoutCalculator.calculatePayout(
            winningNumber(other),
            betKey,
            redNumbers,
            blackNumbers,
          );
          assert.strictEqual(payout, 0, `${betKey} should lose on ${other}`);
        }
      });
    }
  });

  // --- STREET BETS (11:1) - street_13_14_15 ---
  describe("Street Bets (11:1)", () => {
    const streets = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
      [13, 14, 15],
      [16, 17, 18],
      [19, 20, 21],
      [22, 23, 24],
      [25, 26, 27],
      [28, 29, 30],
      [31, 32, 33],
      [34, 35, 36],
    ];

    for (const [a, b, c] of streets) {
      const betKey = `street_${a}_${b}_${c}`;
      test(`${betKey} should win on any of the three numbers`, () => {
        for (const win of [a, b, c]) {
          const payout = BetPayoutCalculator.calculatePayout(
            winningNumber(win),
            betKey,
            redNumbers,
            blackNumbers,
          );
          assert.strictEqual(payout, 11, `${betKey} on ${win}`);
        }

        const other = (a + 3) % 37;
        if (![a, b, c].includes(other)) {
          const payout = BetPayoutCalculator.calculatePayout(
            winningNumber(other),
            betKey,
            redNumbers,
            blackNumbers,
          );
          assert.strictEqual(payout, 0, `${betKey} should lose on ${other}`);
        }
      });
    }
  });

  // --- CORNER BETS (8:1) - corner_19_20_22_23 ---
  describe("Corner Bets (8:1)", () => {
    const corners = [
      [1, 2, 4, 5],
      [2, 3, 5, 6],
      [4, 5, 7, 8],
      [5, 6, 8, 9],
      [7, 8, 10, 11],
      [8, 9, 11, 12],
      [10, 11, 13, 14],
      [11, 12, 14, 15],
      [13, 14, 16, 17],
      [14, 15, 17, 18],
      [16, 17, 19, 20],
      [17, 18, 20, 21],
      [19, 20, 22, 23],
      [20, 21, 23, 24],
      [22, 23, 25, 26],
      [23, 24, 26, 27],
      [25, 26, 28, 29],
      [26, 27, 29, 30],
      [28, 29, 31, 32],
      [29, 30, 32, 33],
      [31, 32, 34, 35],
      [32, 33, 35, 36],
    ];

    for (const nums of corners) {
      const betKey = `corner_${nums.join("_")}`;
      test(`${betKey} should win on any of the four numbers`, () => {
        for (const win of nums) {
          const payout = BetPayoutCalculator.calculatePayout(
            winningNumber(win),
            betKey,
            redNumbers,
            blackNumbers,
          );
          assert.strictEqual(payout, 8, `${betKey} on ${win}`);
        }

        const other = (nums[0] + 10) % 37;
        if (!nums.includes(other)) {
          const payout = BetPayoutCalculator.calculatePayout(
            winningNumber(other),
            betKey,
            redNumbers,
            blackNumbers,
          );
          assert.strictEqual(payout, 0, `${betKey} should lose on ${other}`);
        }
      });
    }
  });

  // --- LINE BETS (5:1) - line_1_2_3_4_5_6 ---
  describe("Line Bets (5:1)", () => {
    const lines = [
      [1, 2, 3, 4, 5, 6],
      [4, 5, 6, 7, 8, 9],
      [7, 8, 9, 10, 11, 12],
      [10, 11, 12, 13, 14, 15],
      [13, 14, 15, 16, 17, 18],
      [16, 17, 18, 19, 20, 21],
      [19, 20, 21, 22, 23, 24],
      [22, 23, 24, 25, 26, 27],
      [25, 26, 27, 28, 29, 30],
      [28, 29, 30, 31, 32, 33],
      [31, 32, 33, 34, 35, 36],
    ];

    for (const nums of lines) {
      const betKey = `line_${nums.join("_")}`;
      test(`${betKey} should win on any of the six numbers`, () => {
        for (const win of nums) {
          const payout = BetPayoutCalculator.calculatePayout(
            winningNumber(win),
            betKey,
            redNumbers,
            blackNumbers,
          );
          assert.strictEqual(payout, 5, `${betKey} on ${win}`);
        }

        const other = (nums[0] + 6) % 37;
        if (!nums.includes(other)) {
          const payout = BetPayoutCalculator.calculatePayout(
            winningNumber(other),
            betKey,
            redNumbers,
            blackNumbers,
          );
          assert.strictEqual(payout, 0, `${betKey} should lose on ${other}`);
        }
      });
    }
  });

  // --- DOZEN BETS (2:1) ---
  describe("Dozen Bets (2:1)", () => {
    const dozens = [
      { key: "dozen_1", start: 1, end: 12 },
      { key: "dozen_2", start: 13, end: 24 },
      { key: "dozen_3", start: 25, end: 36 },
    ];

    for (const { key, start, end } of dozens) {
      test(`${key} should win on numbers ${start}-${end}`, () => {
        for (let num = start; num <= end; num++) {
          const payout = BetPayoutCalculator.calculatePayout(
            winningNumber(num),
            key,
            redNumbers,
            blackNumbers,
          );
          assert.strictEqual(payout, 2, `${key} on ${num}`);
        }

        const outside = start === 1 ? 13 : start === 13 ? 25 : 1;
        const payout = BetPayoutCalculator.calculatePayout(
          winningNumber(outside),
          key,
          redNumbers,
          blackNumbers,
        );
        assert.strictEqual(payout, 0, `${key} should lose on ${outside}`);
      });
    }

    test("dozen bets lose when winning number is 0", () => {
      for (const { key } of dozens) {
        const payout = BetPayoutCalculator.calculatePayout(
          winningNumber(0),
          key,
          redNumbers,
          blackNumbers,
        );
        assert.strictEqual(payout, 0, `${key} should lose on 0`);
      }
    });
  });

  // --- COLUMN BETS (2:1) ---
  describe("Column Bets (2:1)", () => {
    const columns = {
      1: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
      2: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
      3: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
    };

    for (const [col, nums] of Object.entries(columns)) {
      test(`column_${col} should win on its 12 numbers`, () => {
        for (const num of nums) {
          const payout = BetPayoutCalculator.calculatePayout(
            winningNumber(num),
            `column_${col}`,
            redNumbers,
            blackNumbers,
          );
          assert.strictEqual(payout, 2, `column_${col} on ${num}`);
        }

        const otherCol = col === "1" ? columns[2] : col === "2" ? columns[3] : columns[1];
        for (const num of otherCol.slice(0, 3)) {
          const payout = BetPayoutCalculator.calculatePayout(
            winningNumber(num),
            `column_${col}`,
            redNumbers,
            blackNumbers,
          );
          assert.strictEqual(payout, 0, `column_${col} should lose on ${num}`);
        }
      });
    }

    test("column bets lose on 0", () => {
      for (const col of ["1", "2", "3"]) {
        const payout = BetPayoutCalculator.calculatePayout(
          winningNumber(0),
          `column_${col}`,
          redNumbers,
          blackNumbers,
        );
        assert.strictEqual(payout, 0);
      }
    });
  });

  // --- EVEN MONEY BETS (1:1) ---
  describe("Even Money Bets (1:1)", () => {
    test("red/black: should win on correct color", () => {
      for (let num = 1; num <= 36; num++) {
        const color = redNumbers.has(num) ? "red" : "black";
        const opp = color === "red" ? "black" : "red";

        assert.strictEqual(
          BetPayoutCalculator.calculatePayout(
            winningNumber(num),
            `even_money_${color}`,
            redNumbers,
            blackNumbers,
          ),
          1,
        );
        assert.strictEqual(
          BetPayoutCalculator.calculatePayout(
            winningNumber(num),
            `even_money_${opp}`,
            redNumbers,
            blackNumbers,
          ),
          0,
        );
      }
    });

    test("even/odd: should win on correct parity", () => {
      for (let num = 1; num <= 36; num++) {
        const type = num % 2 === 0 ? "even" : "odd";
        const opp = type === "even" ? "odd" : "even";

        assert.strictEqual(
          BetPayoutCalculator.calculatePayout(
            winningNumber(num),
            `even_money_${type}`,
            redNumbers,
            blackNumbers,
          ),
          1,
        );
        assert.strictEqual(
          BetPayoutCalculator.calculatePayout(
            winningNumber(num),
            `even_money_${opp}`,
            redNumbers,
            blackNumbers,
          ),
          0,
        );
      }
    });

    test("high/low: should win on correct range", () => {
      for (let num = 1; num <= 18; num++) {
        assert.strictEqual(
          BetPayoutCalculator.calculatePayout(
            winningNumber(num),
            "even_money_low",
            redNumbers,
            blackNumbers,
          ),
          1,
        );
        assert.strictEqual(
          BetPayoutCalculator.calculatePayout(
            winningNumber(num),
            "even_money_high",
            redNumbers,
            blackNumbers,
          ),
          0,
        );
      }
      for (let num = 19; num <= 36; num++) {
        assert.strictEqual(
          BetPayoutCalculator.calculatePayout(
            winningNumber(num),
            "even_money_high",
            redNumbers,
            blackNumbers,
          ),
          1,
        );
        assert.strictEqual(
          BetPayoutCalculator.calculatePayout(
            winningNumber(num),
            "even_money_low",
            redNumbers,
            blackNumbers,
          ),
          0,
        );
      }
    });

    test("even money bets lose on 0", () => {
      const types = ["red", "black", "even", "odd", "low", "high"];
      for (const type of types) {
        const payout = BetPayoutCalculator.calculatePayout(
          winningNumber(0),
          `even_money_${type}`,
          redNumbers,
          blackNumbers,
        );
        assert.strictEqual(payout, 0, `even_money_${type} should lose on 0`);
      }
    });
  });

  // --- TRIO BETS (11:1) ---
  describe("Trio Bets (11:1)", () => {
    test("trio_0_1_2 should win on 0, 1, or 2", () => {
      for (const num of [0, 1, 2]) {
        const payout = BetPayoutCalculator.calculatePayout(
          winningNumber(num),
          "trio_0_1_2",
          redNumbers,
          blackNumbers,
        );
        assert.strictEqual(payout, 11);
      }
    });

    test("trio_0_2_3 should win on 0, 2, or 3", () => {
      for (const num of [0, 2, 3]) {
        const payout = BetPayoutCalculator.calculatePayout(
          winningNumber(num),
          "trio_0_2_3",
          redNumbers,
          blackNumbers,
        );
        assert.strictEqual(payout, 11);
      }
    });

    test("trio bets lose on numbers outside the trio", () => {
      assert.strictEqual(
        BetPayoutCalculator.calculatePayout(
          winningNumber(4),
          "trio_0_1_2",
          redNumbers,
          blackNumbers,
        ),
        0,
      );
      assert.strictEqual(
        BetPayoutCalculator.calculatePayout(
          winningNumber(1),
          "trio_0_2_3",
          redNumbers,
          blackNumbers,
        ),
        0,
      );
    });
  });

  // --- BASKET BET (0,1,2,3) - 8:1 ---
  describe("Basket Bet (8:1)", () => {
    test("should win on 0,1,2,3", () => {
      for (const num of [0, 1, 2, 3]) {
        const payout = BetPayoutCalculator.calculatePayout(
          winningNumber(num),
          "basket",
          redNumbers,
          blackNumbers,
        );
        assert.strictEqual(payout, 8);
      }
    });

    test("should lose on other numbers", () => {
      for (const num of [4, 5, 36]) {
        const payout = BetPayoutCalculator.calculatePayout(
          winningNumber(num),
          "basket",
          redNumbers,
          blackNumbers,
        );
        assert.strictEqual(payout, 0);
      }
    });
  });

  // --- UNKNOWN BET TYPE ---
  describe("Unknown Bet Type", () => {
    test("should return 0 for invalid bet key", () => {
      const payout = BetPayoutCalculator.calculatePayout(
        winningNumber(17),
        "invalid_bet_999",
        redNumbers,
        blackNumbers,
      );
      assert.strictEqual(payout, 0);
    });
  });
});
