// test/processPayout.test.js

import { describe, test, expect, beforeEach } from "@jest/globals";
import { RouletteEngine } from "../src/classes/RouletteEngine.js";

// --- MOCKS ---

class MockPlayer {
  constructor(name, balance, socketId = "socket-123") {
    this.name = name;
    this.balance = balance;
    this.socketId = socketId;
  }

  updateBalance(amount) {
    this.balance += amount;
  }
}

class MockServer {
  constructor() {
    this.emits = [];
  }

  to(room) {
    return {
      emit: (event, data) => {
        this.emits.push({ room, event, data });
      },
    };
  }

  broadcast(event, data) {
    this.emits.push({ room: "all", event, data });
  }
}

// --- TEST ---

describe("processPayout - Full Integration Test", () => {
  let game;
  let mockServer;
  let playerId;
  let player;

  beforeEach(() => {
    mockServer = new MockServer();
    const rouletteEngine = new RouletteEngine();

    game = {
      server: mockServer,
      players: new Map(),
      bets: new Map(),
      lastBets: new Map(),
      rouletteEngine,

      processPayout(winningNumber) {
        console.log("[processPayout] Iniciando payout. Número ganador:", winningNumber);

        this.players.forEach((player, playerId) => {
          const playerBets = this.bets.get(playerId) || new Map();
          let totalWinnings = 0;
          let totalBetAmount = 0;
          const betResults = [];

          playerBets.forEach((amount, betKey) => {
            totalBetAmount += amount;

            const profitMultiplier = this.rouletteEngine.calculatePayout(winningNumber, betKey);

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
            playerBets.size === 0 ? "no_bet" : totalNetResult > 0 ? "win" : "lose";

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

  // --- CASO 1: Apuesta directa gana ---
  test("should correctly process a winning straight bet and update balance", () => {
    playerId = "player-1";
    player = new MockPlayer("Alice", 10000);
    game.players.set(playerId, player);

    const bets = new Map();
    bets.set("straight_17", 1000);
    game.bets.set(playerId, bets);

    const winningNumber = { number: 17, color: "black" };

    game.processPayout(winningNumber);

    expect(player.balance).toBe(45000); // 10000 + 35000
    expect(game.bets.get(playerId).size).toBe(0);

    const emit = mockServer.emits[0];
    expect(emit.data.totalWinnings).toBe(35000);
    expect(emit.data.resultStatus).toBe("win");

    const betResult = emit.data.betResults[0];
    expect(betResult.result).toBe("win");
    expect(betResult.winnings).toBe(35000);
  });

  // --- CASO 2: Apuesta pierde ---
  test("should correctly process a losing bet and deduct from balance", () => {
    playerId = "player-1";
    player = new MockPlayer("Bob", 5000);
    game.players.set(playerId, player);

    const bets = new Map();
    bets.set("straight_20", 500);
    game.bets.set(playerId, bets);

    const winningNumber = { number: 17, color: "black" };

    game.processPayout(winningNumber);

    expect(player.balance).toBe(5000);
    expect(game.bets.get(playerId).size).toBe(0);

    const emit = mockServer.emits[0];
    expect(emit.data.totalWinnings).toBe(0);
    expect(emit.data.resultStatus).toBe("lose");
  });

  // --- CASO 3: Múltiples apuestas (gana y pierde) ---
  test("should handle multiple bets (win and lose) and calculate net result", () => {
    playerId = "player-1";
    player = new MockPlayer("Charlie", 10000);
    game.players.set(playerId, player);

    const bets = new Map();
    bets.set("straight_17", 1000); // 35:1 → 35,000
    bets.set("split_1_2", 200); // pierde
    bets.set("even_money_black", 300); // 1:1 → 300 ✅ (17 es negro)
    game.bets.set(playerId, bets);

    const winningNumber = { number: 17, color: "black" };

    game.processPayout(winningNumber);

    const expectedWinnings = 1000 * 35 + 300 * 1; // 35,300
    expect(player.balance).toBe(10000 + expectedWinnings); // 45,300 ✅

    const emit = mockServer.emits[0];
    expect(emit.data.totalWinnings).toBe(expectedWinnings);
    expect(emit.data.totalNetResult).toBe(expectedWinnings - 1500);
    expect(emit.data.resultStatus).toBe("win");

    const results = emit.data.betResults;
    expect(results.length).toBe(3);

    const straight = results.find((r) => r.betKey === "straight_17");
    expect(straight.result).toBe("win");
    expect(straight.winnings).toBe(35000);

    const split = results.find((r) => r.betKey === "split_1_2");
    expect(split.result).toBe("lose");

    const black = results.find((r) => r.betKey === "even_money_black");
    expect(black.result).toBe("win");
    expect(black.winnings).toBe(300);
  });

  // --- CASO 4: Apuesta a rojo con número negro → pierde ---
  test("should lose on even_money_red when black number wins", () => {
    playerId = "player-1";
    player = new MockPlayer("Diana", 8000);
    game.players.set(playerId, player);

    const bets = new Map();
    bets.set("even_money_red", 500);
    game.bets.set(playerId, bets);

    const winningNumber = { number: 17, color: "black" };

    game.processPayout(winningNumber);

    expect(player.balance).toBe(8000);
    const emit = mockServer.emits[0];
    const betResult = emit.data.betResults[0];
    expect(betResult.result).toBe("lose");
  });

  // --- CASO 5: Número 0 → solo gana straight_0 ---
  test("should handle payout when winning number is 0", () => {
    playerId = "player-1";
    player = new MockPlayer("Eve", 10000);
    game.players.set(playerId, player);

    const bets = new Map();
    bets.set("even_money_red", 500);
    bets.set("dozen_1", 200);
    bets.set("straight_0", 100);
    game.bets.set(playerId, bets);

    const winningNumber = { number: 0, color: "green" };

    game.processPayout(winningNumber);

    expect(player.balance).toBe(10000 + 3500); // 100 * 35 = 3500

    const emit = mockServer.emits[0];
    expect(emit.data.totalWinnings).toBe(3500);
    expect(emit.data.resultStatus).toBe("win");

    const results = emit.data.betResults;
    const straight = results.find((r) => r.betKey === "straight_0");
    expect(straight.result).toBe("win");
    expect(straight.winnings).toBe(3500);

    const red = results.find((r) => r.betKey === "even_money_red");
    expect(red.result).toBe("lose");
  });

  // --- CASO 6: Jugador sin socketId → usa broadcast ---
  test("should emit to broadcast if player has no socketId", () => {
    playerId = "player-1";
    player = new MockPlayer("Frank", 10000);
    player.socketId = null;
    game.players.set(playerId, player);

    const bets = new Map();
    bets.set("straight_17", 1000);
    game.bets.set(playerId, bets);

    const winningNumber = { number: 17, color: "black" };

    game.processPayout(winningNumber);

    const emit = mockServer.emits[0];
    expect(emit.room).toBe("all");
    expect(emit.event).toBe("game-state-update");
  });
});
