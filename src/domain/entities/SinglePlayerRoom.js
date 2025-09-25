// src/domain/entities/SinglePlayerRoom.js

import { RouletteEngine } from "#domain/entities/RouletteEngine.js";
import { emitErrorByKey } from "#shared/errorHandler.js";
import { BetLimits } from "#domain/value-objects/BetLimits.js";
import prisma from "#prisma";
import { CasinoApiService } from "#infra/api/casinoApiService.js";
import * as gameManager from "#app/managers/gameManager.js";

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
    this.manualMode = true;
    this.rouletteEngine = new RouletteEngine(20);
    this.winningNumber = null;
    this.lastWinningNumber = null;
    this.startCountdown();
    this.gameManager = gameManager;
  }

  broadcast(event, data) {
    console.log(event);
    console.log(data);

    this.server.to(this.id).emit(event, data);
  }

  getPlayerSocket(playerId) {
    const player = this.players.get(playerId);
    return player?.socket || null;
  }

  addPlayer(player, socket) {
    if (this.players.size >= 1) throw new Error("Esta sala es solo para un jugador.");
    player.socket = socket;
    player.socketId = socket.id;
    player.ip = socket.handshake.address || "unknown";

    this.players.set(player.id, player);
    socket.emit("player-initialized", player.toSocketData());
    this.broadcast("game-state-update", {
      state: this.gameState,
      time: this.timeRemaining,
    });
  }

  removePlayer(playerId) {
    if (this.players.has(playerId)) {
      this.players.delete(playerId);
    }
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  startCountdown() {
    this.countdownInterval = setInterval(() => {
      if (!this.manualMode || this.gameState !== GAME_STATES.BETTING) {
        this.timeRemaining--;
        this.broadcast("game-state-update", {
          state: this.gameState,
          time: this.timeRemaining,
        });
        if (this.timeRemaining <= 0 && !this.manualMode) {
          this.nextState();
        }
      }
    }, 1000);
  }

  stopCountdown() {
    clearInterval(this.countdownInterval);
  }

  setManualMode(value) {
    this.manualMode = value;
  }

  triggerSpin() {
    if (this.gameState !== GAME_STATES.SPINNING) return;
    this.spinWheel();
  }

  nextState() {
    this.stopCountdown();

    if (this.gameState === GAME_STATES.BETTING) {
      const hasBets = Array.from(this.bets.values()).some((bets) => bets.size > 0);
      if (!hasBets) {
        this.timeRemaining = 20;
        this.broadcast("game-state-update", {
          state: GAME_STATES.BETTING,
          time: this.timeRemaining,
        });
        if (!this.manualMode) this.startCountdown();
        return;
      }

      this.gameState = GAME_STATES.SPINNING;
      if (this.manualMode) {
        this.broadcast("game-state-update", { state: this.gameState });
      } else {
        this.spinWheel();
      }

      Array.from(this.players.keys()).forEach((playerId) => {
        this.attemptPlaceBet(playerId).catch((err) => {
          console.error(`❌ Error confirmando apuestas para ${playerId}:`, err.message);
          this.logFailedTransaction(playerId, "BET", 0, err.message);
        });
      });
    } else if (this.gameState === GAME_STATES.SPINNING) {
      this.gameState = GAME_STATES.PAYOUT;
      if (!this.winningNumber) {
        this.winningNumber = this.rouletteEngine.getNextWinningNumber();
      }
      this.processPayout(this.winningNumber);
    } else if (this.gameState === GAME_STATES.PAYOUT) {
      this.gameState = GAME_STATES.BETTING;
      this.timeRemaining = 20;
      this.winningNumber = null;
      this.broadcast("game-state-update", {
        state: this.gameState,
        time: this.timeRemaining,
      });
      if (!this.manualMode) this.startCountdown();
    }
  }

  spinWheel() {
    this.winningNumber = this.rouletteEngine.getNextWinningNumber();
    this.broadcast("game-state-update", {
      state: this.gameState,
      winningNumber: this.winningNumber.number,
      winningColor: this.winningNumber.color,
    });
    setTimeout(() => this.nextState(), 6000);
  }

  processPayout(winningNumber) {
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
          totalWinnings += totalReceived;
        } else {
          winnings = 0;
          totalReceived = 0;
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

      if (totalWinnings > 0) {
        this.attemptDepositWinnings(playerId, totalWinnings, player.ip || "unknown").catch(
          (err) => {
            console.error(`❌ Error depositando ganancias para ${playerId}:`, err.message);
            this.logFailedTransaction(playerId, "WIN", totalWinnings, err.message);
          },
        );
      }

      const balanceAfterPayout = player.balance;
      const totalNetResult = totalWinnings - totalBetAmount;
      let resultStatus = playerBets.size === 0 ? "no_bet" : totalWinnings > 0 ? "win" : "lose";

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

      if (player.socket) {
        player.socket.emit("game-state-update", payload);
      } else {
        this.broadcast("game-state-update", payload);
      }

      this.lastBets.set(playerId, new Map(playerBets));
      this.bets.set(playerId, new Map());

      const balanceBefore = balanceAfterPayout - totalWinnings + totalBetAmount;

      const roundData = {
        playerId: player.id,
        sessionId: this.id,
        roundId: `${this.id}_${Date.now()}`,
        gameState: "PAYOUT",
        winningNumber: winningNumber.number,
        winningColor: winningNumber.color,
        totalBetAmount,
        totalWinnings,
        netResult: totalNetResult,
        betResults,
        playerBalanceBefore: balanceBefore,
        playerBalanceAfter: balanceAfterPayout,
        currency: player.currency || "ARS",
        ipAddress: player.ip || "unknown",
        provider: "internal",
        reference: this.id,
        description: `Ronda finalizada. Número: ${winningNumber.number}, Color: ${winningNumber.color}`,
      };

      prisma.rouletteRound
        .create({ data: roundData })
        .then(() => {
          console.log(`✅ Ronda guardada en DB para jugador ${playerId}`);
          const player = this.players.get(playerId);
          if (player) {
            this.gameManager.notifyAdminPlayerBalanceUpdate(this.id, playerId, player.balance);
          }
        })
        .catch((err) => {
          console.error(`❌ Error al guardar ronda para jugador ${playerId}:`, err);
          const player = this.players.get(playerId);
          if (player) {
            this.gameManager.notifyAdminPlayerBalanceUpdate(this.id, playerId, player.balance);
          }
        });
    });

    setTimeout(() => this.nextState(), 5000);
  }

  placeBet(playerId, betKey, amount, callback, isIncreaseOnly = false) {
    if (this.gameState !== GAME_STATES.BETTING) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "GAME_STATE_INVALID");
      return callback?.({
        success: false,
        message: "No se aceptan apuestas en este momento.",
      });
    }

    const player = this.players.get(playerId);
    if (!player) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "PLAYER_NOT_FOUND");
      return callback?.({ success: false, message: "Jugador no encontrado." });
    }

    const buildStateSnapshot = () => {
      const playerBets = this.bets.get(playerId) || new Map();
      const betsArray = Array.from(playerBets, ([key, val]) => ({
        betKey: key,
        amount: val,
      }));
      const totalBet = betsArray.reduce((s, b) => s + b.amount, 0);
      return { balance: player.balance, bets: betsArray, totalBet };
    };

    if (player.balance < amount) {
      const socket = player.socket;
      if (socket) {
        emitErrorByKey(socket, "INSUFFICIENT_BALANCE", {
          betKey,
          amount,
          details: { currentBalance: player.balance },
          state: buildStateSnapshot(),
        });
      }
      return callback?.({ success: false, message: "Saldo insuficiente." });
    }

    if (!this.bets.has(playerId)) this.bets.set(playerId, new Map());
    const playerBets = this.bets.get(playerId);

    let validation;
    if (isIncreaseOnly && playerBets.has(betKey)) {
      const limitValidation = BetLimits.validateBetAmount(betKey, playerBets, amount);
      validation = {
        allowed: limitValidation.allowed,
        reasonCode: limitValidation.allowed ? undefined : "BET_TYPE_LIMIT_EXCEEDED",
        details: limitValidation,
      };
    } else {
      validation = this.rouletteEngine.isBetAllowedDetailed(betKey, playerBets, amount);
    }

    if (!validation.allowed) {
      const socket = player.socket;
      if (socket) {
        emitErrorByKey(socket, validation.reasonCode || "BET_NOT_ALLOWED", {
          betKey,
          amount,
          details: { ...validation.details, betKey },
          state: buildStateSnapshot(),
        });
      }
      return callback?.({
        success: false,
        message: validation.details?.reason || "Apuesta no permitida.",
      });
    }

    const currentAmount = playerBets.get(betKey) || 0;
    playerBets.set(betKey, currentAmount + amount);
    player.balance -= amount;

    if (!this.lastBets.has(playerId)) this.lastBets.set(playerId, new Map());
    const lastPlayerBets = this.lastBets.get(playerId);
    lastPlayerBets.set(betKey, (lastPlayerBets.get(betKey) || 0) + amount);

    const betsArray = Array.from(playerBets, ([key, val]) => ({
      betKey: key,
      amount: val,
    }));
    const totalBet = betsArray.reduce((sum, bet) => sum + bet.amount, 0);

    if (player.socket) {
      player.socket.emit("bet-placed", {
        newBalance: player.balance,
        bets: betsArray,
        totalBet,
      });
    }

    callback?.({ success: true, newBalance: player.balance });
  }

  clearBets(playerId, callback) {
    if (this.gameState !== GAME_STATES.BETTING) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "GAME_STATE_INVALID");
      return callback?.({
        success: false,
        message: "No se aceptan apuestas en este momento.",
      });
    }

    const player = this.players.get(playerId);
    if (!player) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "PLAYER_NOT_FOUND");
      return callback?.({ success: false, message: "Jugador no encontrado." });
    }

    let totalRefund = 0;
    if (this.bets.has(playerId)) {
      totalRefund = Array.from(this.bets.get(playerId).values()).reduce((sum, amt) => sum + amt, 0);
      player.updateBalance(totalRefund);
      this.bets.delete(playerId);
    }

    if (player.socket) {
      player.socket.emit("bets-cleared", {
        newBalance: player.balance,
        bets: [],
        totalBet: 0,
      });
    }

    callback?.({ success: true, newBalance: player.balance });
  }

  undoBet(playerId, callback) {
    if (this.gameState !== GAME_STATES.BETTING) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "GAME_STATE_INVALID");
      return callback?.({
        success: false,
        message: "No se aceptan apuestas en este momento.",
      });
    }

    if (!this.bets.has(playerId)) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "NO_BETS_TO_UNDO");
      return callback?.({
        success: false,
        message: "No hay apuestas para deshacer.",
      });
    }

    const playerBets = this.bets.get(playerId);
    const lastEntry = Array.from(playerBets.entries()).pop();
    if (!lastEntry) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "NO_BETS_TO_UNDO");
      return callback?.({
        success: false,
        message: "No hay apuestas para deshacer.",
      });
    }

    const [betKey, amount] = lastEntry;
    playerBets.delete(betKey);

    const player = this.players.get(playerId);
    if (!player) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "PLAYER_NOT_FOUND");
      return callback?.({ success: false, message: "Jugador no encontrado." });
    }

    player.updateBalance(amount);

    if (player.socket) {
      player.socket.emit("bet-undone", {
        newBalance: player.balance,
        removedBet: { betKey, amount },
      });
    }

    callback?.({ success: true, newBalance: player.balance });
  }

  repeatBet(playerId, callback) {
    if (this.gameState !== GAME_STATES.BETTING) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "GAME_STATE_INVALID");
      return callback?.({
        success: false,
        message: "No se aceptan apuestas en este momento.",
      });
    }

    const player = this.players.get(playerId);
    if (!player) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "PLAYER_NOT_FOUND");
      return callback?.({ success: false, message: "Jugador no encontrado." });
    }

    const lastBets = this.lastBets.get(playerId);
    if (!lastBets || lastBets.size === 0) {
      const socket = player.socket;
      if (socket) emitErrorByKey(socket, "NO_BETS_TO_REPEAT");
      return callback?.({
        success: false,
        message: "No hay apuestas para repetir.",
      });
    }

    let totalAmount = 0;
    lastBets.forEach((amount) => (totalAmount += amount));
    if (player.balance < totalAmount) {
      const socket = player.socket;
      if (socket) {
        emitErrorByKey(socket, "INSUFFICIENT_BALANCE", {
          details: { attempted: totalAmount, currentBalance: player.balance },
        });
      }
      return callback?.({ success: false, message: "Saldo insuficiente." });
    }

    const repeatedBets = new Map();
    lastBets.forEach((amount, betKey) => repeatedBets.set(betKey, amount));

    this.bets.set(playerId, repeatedBets);
    player.balance -= totalAmount;

    const betsArray = Array.from(repeatedBets, ([key, val]) => ({
      betKey: key,
      amount: val,
    }));

    if (player.socket) {
      player.socket.emit("repeat-bet", {
        newBalance: player.balance,
        bets: betsArray,
        totalBet: totalAmount,
      });
    }

    callback?.({ success: true, newBalance: player.balance });
  }

  doubleBet(playerId, callback) {
    if (this.gameState !== GAME_STATES.BETTING) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "GAME_STATE_INVALID");
      return callback?.({
        success: false,
        message: "No se aceptan apuestas en este momento.",
      });
    }

    if (!this.bets.has(playerId)) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "NO_BETS_TO_UNDO");
      return callback?.({
        success: false,
        message: "No hay apuestas para duplicar.",
      });
    }

    const playerBets = this.bets.get(playerId);
    const player = this.players.get(playerId);
    if (!player) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "PLAYER_NOT_FOUND");
      return callback?.({ success: false, message: "Jugador no encontrado." });
    }

    let totalAdditionalBet = 0;
    playerBets.forEach((amount) => (totalAdditionalBet += amount));

    if (player.balance < totalAdditionalBet) {
      const socket = player.socket;
      if (socket) {
        emitErrorByKey(socket, "INSUFFICIENT_BALANCE", {
          details: {
            attempted: totalAdditionalBet,
            currentBalance: player.balance,
          },
          state: {
            balance: player.balance,
            bets: Array.from(playerBets, ([key, val]) => ({
              betKey: key,
              amount: val,
            })),
            totalBet: Array.from(playerBets.values()).reduce((sum, amt) => sum + amt, 0),
          },
        });
      }
      return callback?.({ success: false, message: "Saldo insuficiente." });
    }

    const limitErrors = [];
    for (const [betKey, amount] of playerBets.entries()) {
      const limitValidation = BetLimits.validateBetAmount(betKey, playerBets, amount);
      if (!limitValidation.allowed) {
        limitErrors.push({
          betKey,
          reason: `Límite excedido para ${betKey}: máximo ${limitValidation.maxAllowed}, intentado ${limitValidation.proposedTotal}`,
        });
      }
    }

    if (limitErrors.length > 0) {
      const socket = player.socket;
      if (socket) {
        emitErrorByKey(socket, "BET_TYPE_LIMIT_EXCEEDED", {
          details: { reason: limitErrors[0].reason, limitErrors },
          state: {
            balance: player.balance,
            bets: Array.from(playerBets, ([key, val]) => ({
              betKey: key,
              amount: val,
            })),
            totalBet: Array.from(playerBets.values()).reduce((sum, amt) => sum + amt, 0),
          },
        });
      }
      return callback?.({ success: false, message: limitErrors[0].reason });
    }

    for (const [betKey, amount] of playerBets.entries()) {
      this.placeBet(playerId, betKey, amount, () => {}, true);
    }

    const updatedBets = this.bets.get(playerId) || new Map();
    const betsArray = Array.from(updatedBets, ([key, val]) => ({
      betKey: key,
      amount: val,
    }));
    const totalBet = betsArray.reduce((sum, b) => sum + b.amount, 0);

    if (player.socket) {
      player.socket.emit("double-bet", {
        newBalance: player.balance,
        bets: betsArray,
        totalBet,
      });
    }

    callback?.({ success: true, newBalance: player.balance });
  }

  peekQueue(count = 20) {
    while (this.rouletteEngine.resultsQueue.length < count) this.rouletteEngine.fillQueue();
    return this.rouletteEngine.resultsQueue.slice(0, count);
  }

  dequeueResult() {
    const result = this.rouletteEngine.getNextWinningNumber();
    while (this.rouletteEngine.resultsQueue.length < 20) this.rouletteEngine.fillQueue();
    return result;
  }

  // ✅ ✅ ✅ MÉTODOS AUXILIARES ASINCRONOS ✅ ✅ ✅

  async attemptPlaceBet(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;

    const playerBets = this.bets.get(playerId);
    if (!playerBets || playerBets.size === 0) return;

    const totalBetAmount = Array.from(playerBets.values()).reduce((sum, amt) => sum + amt, 0);

    try {
      await CasinoApiService.placeBet(playerId, totalBetAmount, player.ip || "unknown");
      console.log(`✅ Apuesta confirmada para ${playerId}: ${totalBetAmount}`);
    } catch (error) {
      console.error(`❌ Falló placeBet para ${playerId}:`, error.message);
      throw error;
    }
  }

  async attemptDepositWinnings(playerId, amount, ip) {
    try {
      await CasinoApiService.depositWinnings(playerId, amount, ip);
      console.log(`✅ Ganancias depositadas para ${playerId}: ${amount}`);
    } catch (error) {
      console.error(`❌ Falló depositWinnings para ${playerId}:`, error.message);
      throw error;
    }
  }

  async logFailedTransaction(playerId, type, amount, error) {
    try {
      await prisma.failedTransaction.create({
        playerId,
        roomId: this.id,
        type,
        amount,
        error: error.toString().substring(0, 500),
        status: "PENDING",
        createdAt: new Date(),
      });
      console.warn(`🚨 Transacción fallida registrada para ${playerId} (${type})`);
    } catch (dbError) {
      console.error(`❌ Error guardando transacción fallida en DB:`, dbError.message);
    }
  }
}
