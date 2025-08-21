// classes/SinglePlayerRoom.js
import { RouletteEngine } from "./RouletteEngine.js";

const GAME_STATES = {
  BETTING: "betting",
  SPINNING: "spinning",
  PAYOUT: "payout",
};

export class SinglePlayerRoom {
  constructor(io, roomId) {
    this.server = io;
    this.id = roomId;
    this.players = new Map();
    this.bets = new Map();
    this.lastBets = new Map();
    this.gameState = GAME_STATES.BETTING;
    this.timeRemaining = 20;
    this.rouletteEngine = new RouletteEngine(20); // cola siempre con 20 resultados
    this.winningNumber = null;
    this.lastWinningNumber = null;

    this.startCountdown();
  }

  broadcast(event, data) {
    this.server.to(this.id).emit(event, data);
  }

  addPlayer(player) {
    if (this.players.size >= 1) {
      throw new Error("Esta sala es solo para un jugador.");
    }
    this.players.set(player.id, player);
    console.log(`🟢 Jugador ${player.name} se unió a la sala ${this.id}`);
    this.broadcast("game-state-update", {
      state: this.gameState,
      time: this.timeRemaining,
    });
  }

  removePlayer(playerId) {
    if (this.players.has(playerId)) {
      this.players.delete(playerId);
      console.log(`🔴 Jugador ${playerId} salió de la sala ${this.id}`);
    }
  }

  startCountdown() {
    this.countdownInterval = setInterval(() => {
      this.timeRemaining--;
      this.broadcast("game-state-update", {
        state: this.gameState,
        time: this.timeRemaining,
      });
      if (this.timeRemaining <= 0) this.nextState();
    }, 1000);
  }

  stopCountdown() {
    clearInterval(this.countdownInterval);
  }

  nextState() {
    this.stopCountdown();
    if (this.gameState === GAME_STATES.BETTING) {
      this.gameState = GAME_STATES.SPINNING;
      this.broadcast("game-state-update", { state: this.gameState });
      this.spinWheel();
    } else if (this.gameState === GAME_STATES.SPINNING) {
      this.gameState = GAME_STATES.PAYOUT;
      this.processPayout();
    } else if (this.gameState === GAME_STATES.PAYOUT) {
      this.gameState = GAME_STATES.BETTING;
      this.timeRemaining = 20;
      this.broadcast("game-state-update", {
        state: this.gameState,
        time: this.timeRemaining,
      });
      this.startCountdown();
    }
  }

  spinWheel() {
    this.winningNumber = this.rouletteEngine.getNextWinningNumber();
    setTimeout(() => this.nextState(), 5000);
  }

  processPayout() {
    const winningNum = this.winningNumber;
    const playerId = this.players.keys().next().value;
    const player = this.players.get(playerId);

    let totalWinnings = 0;
    const betResults = [];

    if (this.bets.has(playerId)) {
      const playerBets = this.bets.get(playerId);
      this.lastBets.set(playerId, new Map(playerBets));
      playerBets.forEach((amount, betKey) => {
        const payoutMultiplier = this.rouletteEngine.getBetResult(
          winningNum,
          betKey
        );
        const wonAmount = amount * payoutMultiplier;
        if (wonAmount > 0) totalWinnings += wonAmount;
        betResults.push({ betKey, amount, payoutMultiplier, wonAmount });
      });
    }

    if (totalWinnings > 0) player.updateBalance(totalWinnings);

    this.lastWinningNumber = this.winningNumber;
    this.bets.clear();

    this.broadcast("game-state-update", {
      state: this.gameState,
      winningNumber: this.winningNumber.number,
      color: this.winningNumber.color,
      totalWinnings,
      newBalance: player.balance,
      betResults,
    });

    setTimeout(() => {
      this.gameState = GAME_STATES.BETTING;
      this.timeRemaining = 20;
      this.broadcast("game-state-update", {
        state: this.gameState,
        time: this.timeRemaining,
      });
      this.startCountdown();
    }, 8000);
  }

  placeBet(playerId, betKey, amount) {
    if (this.gameState !== GAME_STATES.BETTING) return;
    const player = this.players.get(playerId);
    if (!player || player.balance < amount) return;

    if (!this.bets.has(playerId)) this.bets.set(playerId, new Map());
    const playerBets = this.bets.get(playerId);
    const currentAmount = playerBets.get(betKey) || 0;
    playerBets.set(betKey, currentAmount + amount);
    player.balance -= amount;

    const betsArray = Array.from(playerBets, ([key, val]) => ({
      betKey: key,
      amount: val,
    }));
    const totalBet = betsArray.reduce((sum, bet) => sum + bet.amount, 0);

    this.server
      .to(playerId)
      .emit("bet-placed", {
        newBalance: player.balance,
        bets: betsArray,
        totalBet,
      });
  }

  clearBets(playerId) {
    if (this.gameState !== GAME_STATES.BETTING) return;
    const player = this.players.get(playerId);
    if (!player) return;

    if (this.bets.has(playerId)) {
      const totalRefund = Array.from(this.bets.get(playerId).values()).reduce(
        (sum, amt) => sum + amt,
        0
      );
      player.updateBalance(totalRefund);
      this.bets.delete(playerId);
    }

    this.server
      .to(playerId)
      .emit("bets-cleared", { newBalance: player.balance });
  }

  undoBet(playerId) {
    if (this.gameState !== GAME_STATES.BETTING) return;
    if (!this.bets.has(playerId)) return;
    const playerBets = this.bets.get(playerId);
    const lastEntry = Array.from(playerBets.entries()).pop();
    if (!lastEntry) return;
    const [betKey, amount] = lastEntry;
    playerBets.delete(betKey);
    const player = this.players.get(playerId);
    player.updateBalance(amount);

    this.server
      .to(playerId)
      .emit("bet-undone", {
        newBalance: player.balance,
        removedBet: { betKey, amount },
      });
  }

  repeatBet(playerId) {
    if (this.gameState !== GAME_STATES.BETTING) return;
    if (!this.lastBets.has(playerId)) return;
    const lastPlayerBets = this.lastBets.get(playerId);
    const player = this.players.get(playerId);
    if (!player) return;

    lastPlayerBets.forEach((amount, betKey) => {
      if (player.balance >= amount) this.placeBet(playerId, betKey, amount);
    });

    this.server.to(playerId).emit("bets-repeated", {
      bets: Array.from(lastPlayerBets.entries()).map(([betKey, amount]) => ({
        betKey,
        amount,
      })),
      newBalance: player.balance,
    });
  }

  doubleBet(playerId) {
    if (this.gameState !== GAME_STATES.BETTING) return;
    if (!this.bets.has(playerId)) return;
    const playerBets = this.bets.get(playerId);
    const player = this.players.get(playerId);
    if (!player) return;

    playerBets.forEach((amount, betKey) => {
      if (player.balance >= amount) this.placeBet(playerId, betKey, amount);
    });

    this.server.to(playerId).emit("bets-doubled", {
      bets: Array.from(playerBets.entries()).map(([betKey, amount]) => ({
        betKey,
        amount,
      })),
      newBalance: player.balance,
    });
  }

  // --- Resultados dinámicos usando RouletteEngine ---
  peekQueue(count = 20) {
    while (this.rouletteEngine.resultsQueue.length < count)
      this.rouletteEngine.fillQueue();
    return this.rouletteEngine.resultsQueue.slice(0, count);
  }

  dequeueResult() {
    const result = this.rouletteEngine.getNextWinningNumber();
    while (this.rouletteEngine.resultsQueue.length < 20)
      this.rouletteEngine.fillQueue();
    return result;
  }
}
