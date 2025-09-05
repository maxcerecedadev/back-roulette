// test/full-combination.test.js

import { describe, test, expect, beforeEach } from "@jest/globals";
import { RouletteEngine } from "../classes/RouletteEngine.js";

describe("processPayout - Full Combination Test (Max-like Bet)", () => {
  let game;
  let mockServer;
  let playerId;
  let player;

  beforeEach(() => {
    mockServer = {
      emits: [],
      to: (room) => ({
        emit: (event, data) => {
          mockServer.emits.push({ room, event, data });
        },
      }),
      broadcast: (event, data) => {
        mockServer.emits.push({ room: "all", event, data });
      },
    };

    const rouletteEngine = new RouletteEngine();

    game = {
      server: mockServer,
      players: new Map(),
      bets: new Map(),
      lastBets: new Map(),
      rouletteEngine,

      processPayout(winningNumber) {
        this.players.forEach((player, playerId) => {
          const playerBets = this.bets.get(playerId) || new Map();
          let totalWinnings = 0;
          let totalBetAmount = 0;
          const betResults = [];

          playerBets.forEach((amount, betKey) => {
            totalBetAmount += amount;
            const profitMultiplier = this.rouletteEngine.calculatePayout(
              winningNumber,
              betKey
            );
            const isWin = profitMultiplier > 0;
            let winnings = 0;
            let netWin = 0;
            let totalReceived = 0;

            if (isWin) {
              winnings = amount * profitMultiplier;
              totalReceived = amount + winnings;
              netWin = winnings;
              totalWinnings += winnings;
            } else {
              netWin = -amount;
            }

            betResults.push({
              betKey,
              amount,
              result: isWin ? "win" : "lose",
              winnings,
              netWin,
              totalReceived,
              profitMultiplier: isWin ? profitMultiplier : 0,
            });
          });

          if (totalWinnings > 0) {
            player.updateBalance(totalWinnings);
          }

          const balanceAfterPayout = player.balance;
          const totalNetResult = totalWinnings - totalBetAmount;

          const resultStatus =
            playerBets.size === 0
              ? "no_bet"
              : totalNetResult > 0
              ? "win"
              : "lose";

          const payload = {
            state: "payout",
            winningNumber: winningNumber.number,
            winningColor: winningNumber.color,
            totalWinnings,
            totalNetResult,
            newBalance: balanceAfterPayout,
            resultStatus,
            betResults: betResults.map((bet) => ({
              betKey: bet.betKey,
              amount: bet.amount,
              result: bet.result,
              winnings: bet.winnings,
              netWin: bet.netWin,
              totalReceived: bet.totalReceived,
              profitMultiplier: bet.profitMultiplier,
            })),
          };

          if (player.socketId) {
            this.server.to(player.socketId).emit("game-state-update", payload);
          } else {
            this.server.broadcast("game-state-update", payload);
          }

          this.lastBets.set(playerId, new Map(playerBets));
          this.bets.set(playerId, new Map());
        });
      },
    };
  });

  test("should correctly process a full combination of bets when 17 wins", () => {
    playerId = "player-1";
    player = {
      name: "MaxPlayer",
      balance: 10000,
      socketId: "socket-123",
      updateBalance(amount) {
        this.balance += amount;
      },
    };

    game.players.set(playerId, player);

    const bets = new Map();

    // --- Apuestas internas ---
    bets.set("straight_17", 100);
    bets.set("split_17_18", 50);
    bets.set("split_14_17", 50);
    bets.set("split_17_20", 50);
    bets.set("street_16_17_18", 100);
    bets.set("corner_16_17_19_20", 50);
    bets.set("corner_17_18_20_21", 50);
    bets.set("line_16_17_18_19_20_21", 100);

    // --- Apuestas externas ---
    bets.set("dozen_2", 200); // 13-24 → 17 gana
    bets.set("column_2", 150); // 2,5,8,11,14,17,20,23,26,29,32,35 → 17 gana
    bets.set("even_money_black", 300); // 17 es negro → gana

    // --- Apuesta especial ---
    bets.set("trio_0_1_2", 20); // pierde

    game.bets.set(playerId, bets);

    const winningNumber = { number: 17, color: "black" };
    game.processPayout(winningNumber);

    // --- Cálculo manual de ganancias ---
    const expectedWinnings =
      100 * 35 + // straight → 3500
      50 * 17 * 3 + // 3 splits → 2550
      100 * 11 + // street → 1100
      50 * 8 * 2 + // 2 corners → 800
      100 * 5 + // line → 500
      200 * 2 + // dozen → 400
      150 * 2 + // column → 300
      300 * 1; // even_money_black → 300

    // Total: 3500 + 2550 + 1100 + 800 + 500 + 400 + 300 + 300 = 9450
    expect(expectedWinnings).toBe(9450);
    expect(player.balance).toBe(10000 + 9450); // 19450

    const emit = mockServer.emits[0];
    expect(emit.data.totalWinnings).toBe(9450);

    // ✅ Cálculo correcto del total apostado
    const totalBetAmount =
      100 + // straight
      50 * 3 + // splits
      100 + // street
      50 * 2 + // corners
      100 + // line
      200 + // dozen
      150 + // column
      300 + // black
      20; // trio

    expect(totalBetAmount).toBe(1220);
    expect(emit.data.totalNetResult).toBe(9450 - 1220); // 8230
    expect(emit.data.resultStatus).toBe("win");

    // --- Verificaciones individuales ---
    const results = emit.data.betResults;

    const straight = results.find((r) => r.betKey === "straight_17");
    expect(straight.result).toBe("win");
    expect(straight.winnings).toBe(3500);

    const split1 = results.find((r) => r.betKey === "split_17_18");
    expect(split1.result).toBe("win");
    expect(split1.winnings).toBe(850);

    const split2 = results.find((r) => r.betKey === "split_14_17");
    expect(split2.result).toBe("win");
    expect(split2.winnings).toBe(850);

    const split3 = results.find((r) => r.betKey === "split_17_20");
    expect(split3.result).toBe("win");
    expect(split3.winnings).toBe(850);

    const street = results.find((r) => r.betKey === "street_16_17_18");
    expect(street.result).toBe("win");
    expect(street.winnings).toBe(1100);

    const corner1 = results.find((r) => r.betKey === "corner_16_17_19_20");
    expect(corner1.result).toBe("win");
    expect(corner1.winnings).toBe(400);

    const corner2 = results.find((r) => r.betKey === "corner_17_18_20_21");
    expect(corner2.result).toBe("win");
    expect(corner2.winnings).toBe(400);

    const line = results.find((r) => r.betKey === "line_16_17_18_19_20_21");
    expect(line.result).toBe("win");
    expect(line.winnings).toBe(500);

    const dozen = results.find((r) => r.betKey === "dozen_2");
    expect(dozen.result).toBe("win");
    expect(dozen.winnings).toBe(400);

    const column = results.find((r) => r.betKey === "column_2");
    expect(column.result).toBe("win");
    expect(column.winnings).toBe(300);

    const black = results.find((r) => r.betKey === "even_money_black");
    expect(black.result).toBe("win");
    expect(black.winnings).toBe(300);

    const trio = results.find((r) => r.betKey === "trio_0_1_2");
    expect(trio.result).toBe("lose");
    expect(trio.winnings).toBe(0);

    const red = results.find((r) => r.betKey === "even_money_red");
    expect(red).toBeUndefined();
  });
});
