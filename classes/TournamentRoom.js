// src/classes/TournamentRoom.js
import { RouletteEngine } from "./RouletteEngine.js";
import { emitErrorByKey } from "../utils/errorHandler.js";
import { BetLimits } from "./BetLimits.js";
import prisma from "../prisma/index.js";
import { CasinoApiService } from "../services/casinoApiService.js";

const GAME_STATES = {
  BETTING: "betting",
  SPINNING: "spinning",
  PAYOUT: "payout",
  FINISHED: "finished",
};

export class TournamentRoom {
  constructor(io, roomId, creatorId) {
    this.server = io;
    this.id = roomId;
    this.creatorId = creatorId;
    this.players = new Map();
    this.bets = new Map();
    this.lastBets = new Map();
    this.gameState = GAME_STATES.BETTING;
    this.currentRound = 1;
    this.maxRounds = 10;
    this.timeRemaining = 20;
    this.manualMode = false;
    this.rouletteEngine = new RouletteEngine(20);
    this.winningNumber = null;
    this.roundResults = [];
    this.countdownInterval = null;
    this.isStarted = false;
  }

  broadcast(event, data) {
    this.server.to(this.id).emit(event, data);
  }

  getPlayerSocket(playerId) {
    const player = this.players.get(playerId);
    return player?.socket || null;
  }

  addPlayer(player, socket) {
    if (this.players.size >= 3) {
      throw new Error("La sala de torneo está llena (máx. 3 jugadores).");
    }

    console.log(
      `🎮 [TournamentRoom.addPlayer] Jugador ${player.id} (${player.name}) ENTRANDO a sala de torneo ${this.id}`
    );

    player.socket = socket;
    player.socketId = socket.id;
    player.ip = socket.handshake.address || "unknown";

    this.players.set(player.id, player);
    socket.emit("player-initialized", {
      ...player.toSocketData(),
      isCreator: player.id === this.creatorId,
    });

    this.broadcast("tournament-state-update", this.getTournamentState());
  }

  startTournament(creatorId) {
    if (creatorId !== this.creatorId) {
      throw new Error("Solo el creador puede iniciar el torneo.");
    }

    if (this.players.size < 3) {
      throw new Error("Se necesitan 3 jugadores para iniciar.");
    }

    if (this.isStarted) {
      throw new Error("El torneo ya ha comenzado.");
    }

    this.isStarted = true;
    this.startCountdown();
    this.broadcast("tournament-started", { round: this.currentRound });
    this.broadcast("tournament-state-update", this.getTournamentState());
  }

  getTournamentState() {
    return {
      roomId: this.id,
      gameState: this.gameState,
      currentRound: this.currentRound,
      maxRounds: this.maxRounds,
      timeRemaining: this.timeRemaining,
      players: Array.from(this.players.values()).map((p) => ({
        ...p.toSocketData(),
        isCreator: p.id === this.creatorId, // 👈 Añadimos esta info
      })),
      winningNumber: this.winningNumber
        ? {
            number: this.winningNumber.number,
            color: this.winningNumber.color,
          }
        : null,
      roundResults: this.roundResults.slice(-3),
      isStarted: this.isStarted, // 👈 Nuevo campo
      creatorId: this.creatorId, // Opcional, para UI
    };
  }

  removePlayer(playerId) {
    if (this.players.has(playerId)) {
      const playerName = this.players.get(playerId)?.name || "Desconocido";
      console.log(
        `🚪 [TournamentRoom.removePlayer] Jugador ${playerId} (${playerName}) ELIMINADO de sala de torneo ${this.id}`
      );

      this.players.delete(playerId);
      this.bets.delete(playerId);
      this.lastBets.delete(playerId);
    }
    this.broadcast("tournament-state-update", this.getTournamentState());
  }

  startCountdown() {
    if (!this.isStarted) return;

    this.stopCountdown();
    this.countdownInterval = setInterval(() => {
      if (this.gameState !== GAME_STATES.BETTING) return;

      this.timeRemaining--;
      this.broadcast("tournament-state-update", this.getTournamentState());

      if (this.timeRemaining <= 0) {
        this.nextState();
      }
    }, 1000);
  }

  stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  nextState() {
    this.stopCountdown();

    if (this.gameState === GAME_STATES.BETTING) {
      const hasBets = Array.from(this.bets.values()).some(
        (bets) => bets.size > 0
      );

      this.gameState = GAME_STATES.SPINNING;
      this.broadcast("tournament-state-update", this.getTournamentState());

      Array.from(this.players.keys()).forEach((playerId) => {
        this.attemptPlaceBet(playerId).catch((err) => {
          console.error(
            `❌ Error confirmando apuestas para ${playerId}:`,
            err.message
          );
          this.logFailedTransaction(playerId, "BET", 0, err.message);
        });
      });

      if (!hasBets) {
        // Si nadie apostó, saltar al giro sin demora
        this.spinWheel();
      } else {
        // Esperar 2 segundos antes de girar (mejor UX)
        setTimeout(() => this.spinWheel(), 2000);
      }
    } else if (this.gameState === GAME_STATES.SPINNING) {
      this.gameState = GAME_STATES.PAYOUT;
      this.processPayout(this.winningNumber);
    } else if (this.gameState === GAME_STATES.PAYOUT) {
      // Guardar resultados de la ronda
      const roundData = {
        round: this.currentRound,
        winningNumber: this.winningNumber?.number,
        winningColor: this.winningNumber?.color,
        playerResults: Array.from(this.players.values()).map((player) => {
          const playerBets = this.bets.get(player.id) || new Map();
          let totalBet = 0;
          let totalWinnings = 0;

          playerBets.forEach((amount) => (totalBet += amount));

          // Calcular ganancias reales
          playerBets.forEach((amount, betKey) => {
            const profitMultiplier = this.rouletteEngine.calculatePayout(
              this.winningNumber,
              betKey
            );
            if (profitMultiplier > 0) {
              totalWinnings += amount * profitMultiplier;
            }
          });

          return {
            playerId: player.id,
            userName: player.name,
            totalBet,
            totalWinnings,
            net: totalWinnings - totalBet,
            balance: player.balance,
          };
        }),
      };

      this.roundResults.push(roundData);

      // Avanzar ronda o finalizar torneo
      if (this.currentRound < this.maxRounds) {
        this.currentRound++;
        this.resetRound();
      } else {
        this.gameState = GAME_STATES.FINISHED;
        this.broadcast("tournament-finished", {
          winner: this.getWinner(),
          results: this.roundResults,
        });

        // Guardar torneo en DB
        this.saveTournamentToDB().catch(console.error);

        // Desconectar a todos en 10 segundos
        setTimeout(() => {
          this.players.forEach((player) => {
            if (player.socket?.connected) {
              player.socket.emit("tournament-ended", {
                reason: "finished",
                message: "El torneo ha finalizado.",
              });
              player.socket.disconnect(true);
            }
          });
        }, 10000);
      }
    }
  }

  resetRound() {
    this.winningNumber = null;
    this.bets.clear();
    this.lastBets.clear();
    this.gameState = GAME_STATES.BETTING;
    this.timeRemaining = 20;
    this.startCountdown();
    this.broadcast("tournament-state-update", this.getTournamentState());
  }

  spinWheel() {
    this.winningNumber = this.rouletteEngine.getNextWinningNumber();
    this.broadcast("tournament-state-update", this.getTournamentState());
    setTimeout(() => this.nextState(), 3000);
  }

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
        this.attemptDepositWinnings(
          playerId,
          totalWinnings,
          player.ip || "unknown"
        ).catch((err) => {
          console.error(
            `❌ Error depositando ganancias para ${playerId}:`,
            err.message
          );
          this.logFailedTransaction(
            playerId,
            "WIN",
            totalWinnings,
            err.message
          );
        });
      }

      const balanceAfterPayout = player.balance;
      const totalNetResult = totalWinnings - totalBetAmount;
      let resultStatus =
        playerBets.size === 0 ? "no_bet" : totalWinnings > 0 ? "win" : "lose";

      const payload = {
        state: "payout",
        round: this.currentRound,
        winningNumber: winningNumber.number,
        winningColor: winningNumber.color,
        totalWinnings,
        totalNetResult,
        newBalance: balanceAfterPayout,
        resultStatus,
        betResults,
      };

      if (player.socket) {
        player.socket.emit("tournament-round-result", payload);
      }

      // Guardar última apuesta para repeat-bet en siguiente ronda
      const lastPlayerBets = new Map();
      playerBets.forEach((amount, betKey) =>
        lastPlayerBets.set(betKey, amount)
      );
      this.lastBets.set(playerId, lastPlayerBets);

      // Guardar ronda individual en DB (opcional, igual que single)
      this.saveRoundToDB(
        player,
        playerId,
        totalBetAmount,
        totalWinnings,
        betResults,
        winningNumber
      ).catch(console.error);
    });

    setTimeout(() => this.nextState(), 3000); // 3s para ver resultados antes de siguiente ronda
  }

  getWinner() {
    if (this.players.size === 0) return null;
    return Array.from(this.players.values())
      .reduce((prev, current) =>
        prev.balance > current.balance ? prev : current
      )
      .toSocketData();
  }

  async saveTournamentToDB() {
    try {
      const tournament = await prisma.tournament.create({
        data: {
          id: this.id,
          rounds: this.maxRounds,
          currentRound: this.currentRound,
          status: "COMPLETED",
          results: this.roundResults,
          createdAt: new Date(),
        },
      });
      console.log(`✅ Torneo guardado en DB: ${tournament.id}`);
    } catch (err) {
      console.error(`❌ Error guardando torneo ${this.id}:`, err);
    }
  }

  async saveRoundToDB(
    player,
    playerId,
    totalBetAmount,
    totalWinnings,
    betResults,
    winningNumber
  ) {
    try {
      await prisma.rouletteRound.create({
        data: {
          playerId: player.id,
          sessionId: this.id,
          roundId: `${this.id}_round${this.currentRound}_${playerId}`,
          gameState: "PAYOUT",
          winningNumber: winningNumber.number,
          winningColor: winningNumber.color,
          totalBetAmount,
          totalWinnings,
          netResult: totalWinnings - totalBetAmount,
          betResults,
          playerBalanceBefore: player.balance - totalWinnings + totalBetAmount,
          playerBalanceAfter: player.balance,
          currency: player.currency || "ARS",
          ipAddress: player.ip || "unknown",
          provider: "tournament",
          reference: this.id,
          description: `Ronda ${this.currentRound} de torneo. Número: ${winningNumber.number}`,
        },
      });
    } catch (err) {
      console.error(
        `❌ Error guardando ronda para ${playerId} en torneo:`,
        err
      );
    }
  }

  placeBet(playerId, betKey, amount, callback, isIncreaseOnly = false) {
    if (this.gameState !== GAME_STATES.BETTING) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "GAME_STATE_INVALID");
      return callback?.({
        success: false,
        message: "No se aceptan apuestas ahora.",
      });
    }

    const player = this.players.get(playerId);
    if (!player)
      return callback?.({ success: false, message: "Jugador no encontrado." });

    if (player.balance < amount) {
      const socket = player.socket;
      if (socket) {
        emitErrorByKey(socket, "INSUFFICIENT_BALANCE", {
          betKey,
          amount,
          details: { currentBalance: player.balance },
        });
      }
      return callback?.({ success: false, message: "Saldo insuficiente." });
    }

    if (!this.bets.has(playerId)) this.bets.set(playerId, new Map());
    const playerBets = this.bets.get(playerId);

    let validation;
    if (isIncreaseOnly && playerBets.has(betKey)) {
      const limitValidation = BetLimits.validateBetAmount(
        betKey,
        playerBets,
        amount
      );
      validation = {
        allowed: limitValidation.allowed,
        reasonCode: limitValidation.allowed
          ? undefined
          : "BET_TYPE_LIMIT_EXCEEDED",
      };
    } else {
      validation = this.rouletteEngine.isBetAllowedDetailed(
        betKey,
        playerBets,
        amount
      );
    }

    if (!validation.allowed) {
      const socket = player.socket;
      if (socket) {
        emitErrorByKey(socket, validation.reasonCode || "BET_NOT_ALLOWED", {
          betKey,
          amount,
          details: { ...validation.details, betKey },
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
      player.socket.emit("tournament-bet-placed", {
        newBalance: player.balance,
        bets: betsArray,
        totalBet,
      });
    }

    callback?.({ success: true, newBalance: player.balance });
  }

  clearBets(playerId, callback) {
    if (this.gameState !== GAME_STATES.BETTING)
      return callback?.({
        success: false,
        message: "No se aceptan apuestas ahora.",
      });

    const player = this.players.get(playerId);
    if (!player)
      return callback?.({ success: false, message: "Jugador no encontrado." });

    let totalRefund = 0;
    if (this.bets.has(playerId)) {
      totalRefund = Array.from(this.bets.get(playerId).values()).reduce(
        (sum, amt) => sum + amt,
        0
      );
      player.updateBalance(totalRefund);
      this.bets.delete(playerId);
    }

    if (player.socket) {
      player.socket.emit("tournament-bets-cleared", {
        newBalance: player.balance,
        bets: [],
        totalBet: 0,
      });
    }

    callback?.({ success: true, newBalance: player.balance });
  }

  undoBet(playerId, callback) {
    if (this.gameState !== GAME_STATES.BETTING)
      return callback?.({
        success: false,
        message: "No se aceptan apuestas ahora.",
      });

    const playerBets = this.bets.get(playerId);
    if (!playerBets || playerBets.size === 0)
      return callback?.({
        success: false,
        message: "No hay apuestas para deshacer.",
      });

    const lastEntry = Array.from(playerBets.entries()).pop();
    if (!lastEntry)
      return callback?.({
        success: false,
        message: "No hay apuestas para deshacer.",
      });

    const [betKey, amount] = lastEntry;
    playerBets.delete(betKey);

    const player = this.players.get(playerId);
    if (!player)
      return callback?.({ success: false, message: "Jugador no encontrado." });

    player.updateBalance(amount);

    if (player.socket) {
      player.socket.emit("tournament-bet-undone", {
        newBalance: player.balance,
        removedBet: { betKey, amount },
      });
    }

    callback?.({ success: true, newBalance: player.balance });
  }

  repeatBet(playerId, callback) {
    if (this.gameState !== GAME_STATES.BETTING)
      return callback?.({
        success: false,
        message: "No se aceptan apuestas ahora.",
      });

    const player = this.players.get(playerId);
    if (!player)
      return callback?.({ success: false, message: "Jugador no encontrado." });

    const lastBets = this.lastBets.get(playerId);
    if (!lastBets || lastBets.size === 0)
      return callback?.({
        success: false,
        message: "No hay apuestas para repetir.",
      });

    let totalAmount = 0;
    lastBets.forEach((amount) => (totalAmount += amount));
    if (player.balance < totalAmount)
      return callback?.({ success: false, message: "Saldo insuficiente." });

    const repeatedBets = new Map();
    lastBets.forEach((amount, betKey) => repeatedBets.set(betKey, amount));

    this.bets.set(playerId, repeatedBets);
    player.balance -= totalAmount;

    const betsArray = Array.from(repeatedBets, ([key, val]) => ({
      betKey: key,
      amount: val,
    }));

    if (player.socket) {
      player.socket.emit("tournament-repeat-bet", {
        newBalance: player.balance,
        bets: betsArray,
        totalBet: totalAmount,
      });
    }

    callback?.({ success: true, newBalance: player.balance });
  }

  doubleBet(playerId, callback) {
    if (this.gameState !== GAME_STATES.BETTING)
      return callback?.({
        success: false,
        message: "No se aceptan apuestas ahora.",
      });

    const playerBets = this.bets.get(playerId);
    if (!playerBets || playerBets.size === 0)
      return callback?.({
        success: false,
        message: "No hay apuestas para duplicar.",
      });

    const player = this.players.get(playerId);
    if (!player)
      return callback?.({ success: false, message: "Jugador no encontrado." });

    let totalAdditionalBet = 0;
    playerBets.forEach((amount) => (totalAdditionalBet += amount));

    if (player.balance < totalAdditionalBet)
      return callback?.({ success: false, message: "Saldo insuficiente." });

    const limitErrors = [];
    for (const [betKey, amount] of playerBets.entries()) {
      const limitValidation = BetLimits.validateBetAmount(
        betKey,
        playerBets,
        amount
      );
      if (!limitValidation.allowed) {
        limitErrors.push({ betKey, reason: `Límite excedido para ${betKey}` });
      }
    }

    if (limitErrors.length > 0) {
      const socket = player.socket;
      if (socket) {
        emitErrorByKey(socket, "BET_TYPE_LIMIT_EXCEEDED", {
          details: { reason: limitErrors[0].reason },
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
      player.socket.emit("tournament-double-bet", {
        newBalance: player.balance,
        bets: betsArray,
        totalBet,
      });
    }

    callback?.({ success: true, newBalance: player.balance });
  }

  // ✅ ✅ ✅ MÉTODOS AUXILIARES ASINCRONOS ✅ ✅ ✅

  async attemptPlaceBet(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;

    const playerBets = this.bets.get(playerId);
    if (!playerBets || playerBets.size === 0) return;

    const totalBetAmount = Array.from(playerBets.values()).reduce(
      (sum, amt) => sum + amt,
      0
    );

    try {
      await CasinoApiService.placeBet(
        playerId,
        totalBetAmount,
        "round_total",
        player.ip || "unknown",
        player.currency || "ARS"
      );
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
      console.error(
        `❌ Falló depositWinnings para ${playerId}:`,
        error.message
      );
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
      console.warn(
        `🚨 Transacción fallida registrada para ${playerId} (${type})`
      );
    } catch (dbError) {
      console.error(
        `❌ Error guardando transacción fallida en DB:`,
        dbError.message
      );
    }
  }
}
