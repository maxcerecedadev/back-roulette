// classes/TournamentRoom.js

import { RouletteEngine } from "./RouletteEngine.js";

export class TournamentRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.bets = {};
    this.rouletteEngine = new RouletteEngine();
    this.gameState = "betting";
    this.timer = null;
    this.bettingTime = 30;
  }

  addPlayer(player) {
    this.players.set(player.id, player);
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    if (this.players.size === 0) {
      return true;
    }
    return false;
  }

  startBettingPeriod(io) {
    this.gameState = "betting";
    this.bets = {};
    io.to(this.id).emit("game-state-update", {
      state: "betting",
      time: this.bettingTime,
    });
    this.startTimer(io);
  }

  startTimer(io) {
    let remainingTime = this.bettingTime;
    this.timer = setInterval(() => {
      io.to(this.id).emit("timer", remainingTime);
      remainingTime--;
      if (remainingTime < 0) {
        clearInterval(this.timer);
        this.spin(io);
      }
    }, 1000);
  }

  spin(io) {
    this.gameState = "spinning";
    io.to(this.id).emit("game-state-update", { state: "spinning" });

    const result = this.rouletteEngine.getNextResult();

    setTimeout(() => {
      this.payout(io, result);
    }, 5000);
  }

  payout(io, result) {
    this.gameState = "payout";
    const winnings = {};

    for (const [playerId, player] of this.players) {
      // const playerBets = this.bets[playerId] || {};
      let wonAmount = 0;

      // TODO: Lógica de cálculo de pagos
      // Esto es solo un placeholder
      // For example, based on the winning number and color
      // for (const bet in playerBets) {
      //   if (bet === result.number || bet === result.color) {
      //      wonAmount += playerBets[bet] * payoutRate;
      //   }
      // }

      winnings[playerId] = wonAmount;
      player.balance += wonAmount;
    }

    io.to(this.id).emit("spin-result", {
      winningNumber: result.number,
      winnings,
      history: this.rouletteEngine.peekQueue(),
    });

    this.startBettingPeriod(io);
  }
}
