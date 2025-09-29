// src/domain/entities/TournamentRoom.js

import { RouletteEngine } from "#domain/entities/RouletteEngine.js";
import { emitErrorByKey } from "#shared/errorHandler.js";
import { BetLimits } from "#domain/value-objects/BetLimits.js";
import * as gameManager from "#app/managers/gameManager.js";
import prisma from "#prisma";

/**
 * Sala de torneo para múltiples jugadores.
 * Maneja el flujo completo de un torneo: inscripción, rondas, clasificación y premios.
 * Los jugadores compiten por un premio basado en su rendimiento acumulado.
 */

// Estados del juego en un torneo
const GAME_STATES = {
  BETTING: "betting",
  SPINNING: "spinning",
  PAYOUT: "payout",
  RESULTS: "results",
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
    this.maxRounds = 10; //! Máximo número de rondas
    this.timeRemaining = 30; //!! 60s Luego
    this.manualMode = false;
    this.rouletteEngine = new RouletteEngine(20);
    this.winningNumber = null;
    this.roundResults = [];
    this.countdownInterval = null;
    this.timeouts = [];
    this.intervals = [];
    this.isStarted = false;
    this.entryFee = 10000;
    this.houseCutPercentage = 0.2; // 20% para la casa
    this.totalPot = 0; // Acumulado de inscripciones
    this.playablePot = 0; // 80% del totalPot → premio a repartir
  }

  /**
   * Envía un evento a todos los jugadores en la sala del torneo.
   * @param {string} event - Nombre del evento.
   * @param {Object} data - Datos a enviar.
   */
  broadcast(event, data) {
    console.log(`📢 [broadcast] Emitiendo evento '${event}' a todos en sala ${this.id}`);
    this.server.to(this.id).emit(event, data);
  }

  /**
   * Obtiene el socket de un jugador específico.
   * @param {string} playerId - ID del jugador.
   * @returns {import("socket.io").Socket | null} Socket del jugador o null si no existe.
   */
  getPlayerSocket(playerId) {
    const player = this.players.get(playerId);
    return player?.socket || null;
  }

  addPlayer(player, socket) {
    if (this.players.size >= 3) {
      throw new Error("La sala de torneo está llena (máx. 3 jugadores).");
    }

    if (player.balance < this.entryFee) {
      throw new Error(
        "Saldo insuficiente para inscribirse en el torneo (se requieren 10.000 fichas).",
      );
    }

    player.balance -= this.entryFee;

    player.tournamentBalance = this.entryFee;
    player.initialTournamentBalance = this.entryFee;

    this.totalPot += this.entryFee;

    console.log(
      `🎟️ [TournamentRoom.addPlayer] Jugador ${player.id} (${player.name}) pagó ${this.entryFee} fichas. Balance real restante: ${player.balance}. Balance de torneo: ${player.tournamentBalance}. Poso total: ${this.totalPot}`,
    );

    player.socket = socket;
    player.socketId = socket.id;
    player.ip = socket.handshake.address || "unknown";
    player.hasLeft = false;

    this.players.set(player.id, player);
    socket.emit("player-initialized", {
      ...player.toSocketData(),
      isCreator: player.id === this.creatorId,
    });

    socket.emit("tournament-balance-update", {
      newBalance: player.tournamentBalance,
    });

    this.broadcast("tournament-state-update", this.getTournamentState());
  }

  /**
   * Inicia el torneo si se cumplen las condiciones.
   * @param {string} creatorId - ID del jugador que intenta iniciar.
   * @throws {Error} Si no es el creador, no hay suficientes jugadores o ya comenzó.
   */
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

    this.playablePot = Math.floor(this.totalPot * (1 - this.houseCutPercentage));
    console.log(
      `💰 [TournamentRoom] Torneo iniciado. Poso total: ${
        this.totalPot
      }. Casa: ${this.totalPot - this.playablePot}. Premio: ${this.playablePot}`,
    );

    this.isStarted = true;
    this.startCountdown();
    this.broadcast("tournament-started", {
      round: this.currentRound,
      playablePot: this.playablePot,
    });
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
        isCreator: p.id === this.creatorId,
        tournamentBalance: p.tournamentBalance,
      })),
      winningNumber: this.winningNumber
        ? {
            number: this.winningNumber.number,
            color: this.winningNumber.color,
          }
        : null,
      roundResults: this.roundResults.slice(-3),
      isStarted: this.isStarted,
      creatorId: this.creatorId,
      totalPot: this.totalPot,
      playablePot: this.playablePot,
    };
  }

  removePlayer(playerId) {
    if (!this.players.has(playerId)) {
      console.warn(`⚠️ [removePlayer] Jugador ${playerId} no existe en sala ${this.id}`);
      return;
    }

    const player = this.players.get(playerId);
    const playerName = player.name || "Desconocido";

    if (this.isStarted) {
      player.disconnected = true;
      player.hasLeft = true;
      player.socket = null;
      player.socketId = null;

      console.log(
        `⚠️ [TournamentRoom.removePlayer] Jugador ${playerId} (${playerName}) se DESCONECTÓ durante torneo activo. Marcado como desconectado.`,
      );

      this.broadcast("player-disconnected", {
        playerId: player.id,
        playerName,
        message: `${playerName} se ha desconectado. El torneo continúa.`,
      });

      return;
    }

    player.hasLeft = true;
    this.players.delete(playerId);

    console.log(
      `🚪 [TournamentRoom.removePlayer] Jugador ${playerId} (${playerName}) eliminado de sala ${this.id}`,
    );

    if (player.socket?.connected) {
      player.socket.emit("tournament-left", {
        reason: "left",
        message: "Abandonaste el torneo. No serás elegible para premios.",
      });
      player.socket.disconnect(true);
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
      this.gameState = GAME_STATES.SPINNING;
      this.broadcast("tournament-state-update", this.getTournamentState());

      Array.from(this.players.keys()).forEach((playerId) => {
        this.attemptPlaceBet(playerId).catch((err) => {
          console.error(`❌ Error confirmando apuestas para ${playerId}:`, err.message);
          this.logFailedTransaction(playerId, "BET", 0, err.message);
        });
      });

      const timeoutId = setTimeout(() => this.spinWheel(), 6000);
      this.timeouts.push(timeoutId);
    } else if (this.gameState === GAME_STATES.SPINNING) {
      this.gameState = GAME_STATES.PAYOUT;
      this.processPayout(this.winningNumber);
    } else if (this.gameState === GAME_STATES.PAYOUT) {
      const roundData = {
        round: this.currentRound,
        winningNumber: this.winningNumber?.number,
        winningColor: this.winningNumber?.color,
        playerResults: Array.from(this.players.values()).map((player) => {
          const playerBets = this.bets.get(player.id) || new Map();
          let totalBet = 0;
          let totalWinnings = 0;

          playerBets.forEach((amount) => (totalBet += amount));
          playerBets.forEach((amount, betKey) => {
            const profitMultiplier = this.rouletteEngine.calculatePayout(
              this.winningNumber,
              betKey,
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

      if (this.currentRound >= this.maxRounds) {
        this.gameState = GAME_STATES.RESULTS;

        const finalStandings = this.calculateFinalStandings();
        const prizeDistribution = this.distributePrize(finalStandings);

        prizeDistribution.forEach(({ playerId, prize }) => {
          const player = this.players.get(playerId);
          if (player) {
            player.balance += prize;
            console.log(
              `🏆 [PREMIO] Jugador ${player.name} (${playerId}) ganó ${prize} fichas. Nuevo saldo real: ${player.balance}`,
            );

            if (player.socket) {
              player.socket.emit("tournament-prize-awarded", {
                prize,
                message:
                  prize > 0
                    ? `🎉 ¡Ganaste ${prize.toLocaleString()} fichas!`
                    : "No ganaste premio esta vez.",
              });
            }
          }
        });

        gameManager.notifyAdminsRoomUpdate();

        this.broadcast("tournament-results", {
          standings: finalStandings,
          prizeDistribution,
          playablePot: this.playablePot,
          houseCut: this.totalPot - this.playablePot,
          leftPlayers: Array.from(this.players.values())
            .filter((p) => p.hasLeft || p.disconnected)
            .map((p) => ({ id: p.id, name: p.name })),
          message: "¡Torneo finalizado! Aquí están los resultados finales.",
        });

        console.log(`📊 [Torneo] Mostrando resultados finales por 10 segundos...`);

        this.saveTournamentToDB().catch(console.error);

        const timeoutId = setTimeout(() => {
          this.gameState = GAME_STATES.FINISHED;

          this.broadcast("tournament-finished", {
            standings: finalStandings,
            prizeDistribution,
            playablePot: this.playablePot,
            houseCut: this.totalPot - this.playablePot,
          });

          // 📢 Notificar a jugadores conectados
          this.players.forEach((player) => {
            if (player.socket?.connected) {
              player.socket.emit("tournament-ended", {
                reason: "finished",
                message: "El torneo ha finalizado. Gracias por participar.",
              });
              player.socket.disconnect(true);
            }
          });

          this.players.clear();
          console.log(`🗑️ [Torneo] Todos los jugadores eliminados de la sala ${this.id}`);

          gameManager.removeRoom(this.id);
          console.log(`🗑️ [Torneo] Sala ${this.id} eliminada del gameManager`);

          this.destroy();
        }, 10000);

        this.timeouts.push(timeoutId);
        return;
      } else {
        this.currentRound++;
        this.resetRound();
      }
    }
  }

  spinWheel() {
    this.winningNumber = this.rouletteEngine.getNextWinningNumber();
    console.log(
      `🎯 [spinWheel] ¡Número ganador de la ronda ${this.currentRound}!: ${this.winningNumber.number} (${this.winningNumber.color})`,
    );
    this.broadcast("tournament-state-update", this.getTournamentState());
    setTimeout(() => this.nextState(), 6000);
  }

  resetRound() {
    console.log(
      `🔄 [resetRound] Reiniciando ronda ${this.currentRound + 1}/${
        this.maxRounds
      } en sala ${this.id}`,
    );

    this.winningNumber = null;
    this.bets.clear();
    this.lastBets.clear();
    this.gameState = GAME_STATES.BETTING;
    this.timeRemaining = 30;
    this.startCountdown();
    this.broadcast("tournament-state-update", this.getTournamentState());

    console.log(
      `✅ [resetRound] Ronda reiniciada. Estado: ${this.gameState}, tiempo: ${this.timeRemaining}s`,
    );
  }

  processPayout(winningNumber) {
    console.log(
      `💸 [processPayout] Iniciando cálculo de pagos para ronda ${this.currentRound}. Número ganador: ${winningNumber.number} (${winningNumber.color})`,
    );

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

        console.log(
          `📊 [processPayout] Jugador ${playerId} - Apuesta: ${betKey} ($${amount}) → ${
            isWin ? "✅ GANÓ" : "❌ PERDIÓ"
          } → Ganancia: $${winnings}, Neto: $${netWin}`,
        );
      });

      if (totalWinnings > 0) {
        player.tournamentBalance += totalWinnings;
      }

      const balanceAfterPayout = player.tournamentBalance;
      const totalNetResult = totalWinnings - totalBetAmount;

      let resultStatus = playerBets.size === 0 ? "no_bet" : totalWinnings > 0 ? "win" : "lose";

      console.log(
        `💰 [RESULTADO RONDA ${this.currentRound}] Jugador "${player.name}" (${playerId}): 
→ Total apostado: $${totalBetAmount}
→ Ganancias totales: $${totalWinnings}
→ Resultado neto: ${totalNetResult >= 0 ? "+" : ""}${totalNetResult}
→ Balance de torneo final: $${balanceAfterPayout}`,
      );

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
        console.log(
          `📤 [processPayout] Emitido 'tournament-round-result' a ${playerId}: balance=${balanceAfterPayout}, neto=${totalNetResult}, estado=${resultStatus}`,
        );
      }

      const lastPlayerBets = new Map();
      playerBets.forEach((amount, betKey) => lastPlayerBets.set(betKey, amount));
      this.lastBets.set(playerId, lastPlayerBets);

      this.saveRoundToDB(
        player,
        playerId,
        totalBetAmount,
        totalWinnings,
        betResults,
        winningNumber,
      ).catch(console.error);
    });

    const timeoutId = setTimeout(() => this.nextState(), 5000);
    this.timeouts.push(timeoutId);
  }

  calculateFinalStandings() {
    return Array.from(this.players.values())
      .filter((player) => !player.hasLeft)
      .map((player) => ({
        id: player.id,
        name: player.name,
        finalBalance: player.tournamentBalance,
      }))
      .sort((a, b) => b.finalBalance - a.finalBalance);
  }

  distributePrize(standings) {
    if (standings.length === 0 || this.playablePot <= 0) return [];

    const topBalance = standings[0].finalBalance;
    const tiedPlayers = standings.filter((player) => player.finalBalance === topBalance);

    const prizePerPlayer = Math.floor(this.playablePot / tiedPlayers.length);

    return tiedPlayers.map((player) => ({
      playerId: player.id,
      playerName: player.name,
      prize: prizePerPlayer,
    }));
  }

  getWinner() {
    if (this.players.size === 0) return null;
    return Array.from(this.players.values())
      .reduce((prev, current) =>
        prev.tournamentBalance > current.tournamentBalance ? prev : current,
      )
      .toSocketData();
  }

  destroy() {
    this.players.clear();
    this.bets.clear();
    this.lastBets.clear();
    this.timeouts.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
    this.timeouts = [];
    this.intervals = [];
    console.log(`[TournamentRoom] Sala ${this.id} destruida. Todos los timers limpiados.`);
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

  async saveRoundToDB(player, playerId, totalBetAmount, totalWinnings, betResults, winningNumber) {
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
      console.error(`❌ Error guardando ronda para ${playerId} en torneo:`, err);
    }
  }

  "place-bet"(playerId, data, callback) {
    const { betKey, amount, round } = data;

    if (round !== this.currentRound) {
      console.warn(
        `⚠️ [place-bet] Apuesta rechazada para ${playerId}: ronda enviada (${round}) no coincide con ronda actual (${this.currentRound})`,
      );
      return callback?.({
        success: false,
        message: `Ronda incorrecta. Estás en la ronda ${this.currentRound}.`,
      });
    }

    if (this.gameState !== GAME_STATES.BETTING) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "GAME_STATE_INVALID");
      console.warn(
        `⚠️ [place-bet] Apuesta rechazada para ${playerId}: estado actual = ${this.gameState}`,
      );
      return callback?.({
        success: false,
        message: "No se aceptan apuestas ahora.",
      });
    }

    const player = this.players.get(playerId);
    if (!player) {
      console.warn(`⚠️ [place-bet] Jugador ${playerId} no encontrado en sala ${this.id}`);
      return callback?.({ success: false, message: "Jugador no encontrado." });
    }

    if (player.tournamentBalance < amount) {
      const socket = player.socket;
      if (socket) {
        emitErrorByKey(socket, "INSUFFICIENT_BALANCE", {
          betKey,
          amount,
          details: { currentBalance: player.tournamentBalance },
        });
      }
      console.warn(
        `⚠️ [place-bet] Saldo insuficiente para ${playerId}: intentó apostar ${amount}, tiene ${player.tournamentBalance}`,
      );
      return callback?.({ success: false, message: "Saldo insuficiente." });
    }

    if (!this.bets.has(playerId)) this.bets.set(playerId, new Map());
    const playerBets = this.bets.get(playerId);

    let validation;
    if (playerBets.has(betKey)) {
      const limitValidation = BetLimits.validateBetAmount(betKey, playerBets, amount);
      validation = {
        allowed: limitValidation.allowed,
        reasonCode: limitValidation.allowed ? undefined : "BET_TYPE_LIMIT_EXCEEDED",
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
        });
      }
      console.warn(
        `⚠️ [place-bet] Apuesta no permitida para ${playerId}: ${
          validation.details?.reason || "Razón desconocida"
        }`,
      );
      return callback?.({
        success: false,
        message: validation.details?.reason || "Apuesta no permitida.",
      });
    }

    const currentAmount = playerBets.get(betKey) || 0;
    playerBets.set(betKey, currentAmount + amount);
    player.tournamentBalance -= amount;
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
        newBalance: player.tournamentBalance,
        bets: betsArray,
        totalBet,
      });
      console.log(
        `📤 [place-bet] Ronda ${this.currentRound} - Emitido 'tournament-bet-placed' a ${playerId}: newBalance=${player.tournamentBalance}, totalBet=${totalBet}`,
      );
    }

    console.log(
      `🎲 [APUESTA] Ronda ${this.currentRound} - Jugador "${player.name}" (${playerId}) apostó $${amount} en "${betKey}". Nuevo balance de torneo: $${player.tournamentBalance}. Total apostado esta ronda: $${totalBet}`,
    );

    callback?.({ success: true, newBalance: player.tournamentBalance });
  }

  "clear-bets"(playerId, data, callback) {
    if (this.gameState !== GAME_STATES.BETTING)
      return callback?.({
        success: false,
        message: "No se aceptan apuestas ahora.",
      });

    const player = this.players.get(playerId);
    if (!player) return callback?.({ success: false, message: "Jugador no encontrado." });

    let totalRefund = 0;
    if (this.bets.has(playerId)) {
      totalRefund = Array.from(this.bets.get(playerId).values()).reduce((sum, amt) => sum + amt, 0);
      player.tournamentBalance += totalRefund;
      this.bets.delete(playerId);
    }

    if (player.socket) {
      player.socket.emit("tournament-bets-cleared", {
        newBalance: player.tournamentBalance,
        bets: [],
        totalBet: 0,
      });
    }

    callback?.({ success: true, newBalance: player.tournamentBalance });
  }

  "undo-bet"(playerId, data, callback) {
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
    if (!player) return callback?.({ success: false, message: "Jugador no encontrado." });

    player.tournamentBalance += amount;
    if (player.socket) {
      player.socket.emit("tournament-bet-undone", {
        newBalance: player.tournamentBalance,
        removedBet: { betKey, amount },
      });
    }

    callback?.({ success: true, newBalance: player.tournamentBalance }); // ✅ Usar tournamentBalance
  }

  "repeat-bet"(playerId, data, callback) {
    if (this.gameState !== GAME_STATES.BETTING)
      return callback?.({
        success: false,
        message: "No se aceptan apuestas ahora.",
      });

    const player = this.players.get(playerId);
    if (!player) return callback?.({ success: false, message: "Jugador no encontrado." });

    const lastBets = this.lastBets.get(playerId);
    if (!lastBets || lastBets.size === 0)
      return callback?.({
        success: false,
        message: "No hay apuestas para repetir.",
      });

    let totalAmount = 0;
    lastBets.forEach((amount) => (totalAmount += amount));
    if (player.tournamentBalance < totalAmount)
      return callback?.({ success: false, message: "Saldo insuficiente." });

    const repeatedBets = new Map();
    lastBets.forEach((amount, betKey) => repeatedBets.set(betKey, amount));

    this.bets.set(playerId, repeatedBets);
    player.tournamentBalance -= totalAmount;

    const betsArray = Array.from(repeatedBets, ([key, val]) => ({
      betKey: key,
      amount: val,
    }));

    if (player.socket) {
      player.socket.emit("tournament-repeat-bet", {
        newBalance: player.tournamentBalance,
        bets: betsArray,
        totalBet: totalAmount,
      });
    }

    callback?.({ success: true, newBalance: player.tournamentBalance });
  }

  "double-bet"(playerId, data, callback) {
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
    if (!player) return callback?.({ success: false, message: "Jugador no encontrado." });

    let totalAdditionalBet = 0;
    playerBets.forEach((amount) => (totalAdditionalBet += amount));

    if (player.tournamentBalance < totalAdditionalBet)
      return callback?.({ success: false, message: "Saldo insuficiente." });

    const limitErrors = [];
    for (const [betKey, amount] of playerBets.entries()) {
      const limitValidation = BetLimits.validateBetAmount(betKey, playerBets, amount);
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
      this["place-bet"](playerId, { betKey, amount, round: this.currentRound }, callback, true);
    }
  }

  /**
   * Devuelve los próximos resultados de la ruleta sin modificar la cola.
   * @param {number} count - Número de resultados a devolver (máximo la cola actual).
   * @returns {Array} Array de resultados { number, color }.
   */

  peekQueue(count = 20) {
    while (this.rouletteEngine.resultsQueue.length < count) {
      this.rouletteEngine.fillQueue();
    }
    return this.rouletteEngine.peekQueue().slice(0, count);
  }

  // =============== MÉTODOS AUXILIARES ASINCRONOS ===============

  /**
   * Simula la confirmación de apuestas en un torneo virtual.
   * En torneos, las apuestas son virtuales y no requieren transacciones reales.
   * @param {string} playerId - ID del jugador.
   */
  async attemptPlaceBet(playerId) {
    const player = this.players.get(playerId);
    if (!player) {
      console.warn(`⚠️ [attemptPlaceBet] Jugador ${playerId} no encontrado`);
      return;
    }

    const playerBets = this.bets.get(playerId);
    if (!playerBets || playerBets.size === 0) {
      console.log(`ℹ️ [attemptPlaceBet] Jugador ${playerId} no tiene apuestas pendientes`);
      return;
    }

    const totalBetAmount = Array.from(playerBets.values()).reduce((sum, amt) => sum + amt, 0);

    console.log(
      `✅ [TORNEO VIRTUAL] Apuesta simulada CONFIRMADA para ${playerId}: ${totalBetAmount} fichas. Estado: ${this.gameState}`,
    );
  }

  /**
   * Simula el depósito de ganancias en un torneo virtual.
   * En torneos, las ganancias son virtuales y se manejan internamente.
   * @param {string} playerId - ID del jugador.
   * @param {number} amount - Monto de ganancias.
   */
  async attemptDepositWinnings(playerId, amount) {
    console.log(`✅ [TORNEO VIRTUAL] Ganancias simuladas para ${playerId}: ${amount} fichas`);
  }

  /**
   * Registra una transacción fallida en la base de datos para seguimiento.
   * @param {string} playerId - ID del jugador.
   * @param {string} type - Tipo de transacción (BET, WIN, etc.).
   * @param {number} amount - Monto de la transacción.
   * @param {Error} error - Error que causó la falla.
   */
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
