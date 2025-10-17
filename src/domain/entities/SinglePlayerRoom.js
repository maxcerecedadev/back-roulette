// src/domain/entities/SinglePlayerRoom.js

import { RouletteEngine } from "#domain/entities/RouletteEngine.js";
import { emitErrorByKey } from "#shared/errorHandler.js";
import { BetLimits } from "#domain/value-objects/BetLimits.js";
import prisma from "#prisma";
import { CasinoApiService } from "#infra/api/casinoApiService.js";
import * as gameManager from "#app/managers/gameManager.js";

/**
 * Sala de juego individual para un solo jugador.
 * Maneja el flujo completo de una partida de ruleta: apuestas, giro, pagos.
 * Integra con servicios externos para transacciones reales.
 */

// Estados del juego en una sala individual
const GAME_STATES = {
  BETTING: "betting",
  SPINNING: "spinning",
  PAYOUT: "payout",
};

export class SinglePlayerRoom {
  /**
   * Crea una nueva sala de juego individual.
   * @param {import("socket.io").Server} io - Instancia de Socket.IO para comunicación.
   * @param {string} roomId - ID único de la sala.
   */
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

  /**
   * Envía un evento a todos los jugadores en la sala.
   * @param {string} event - Nombre del evento.
   * @param {Object} data - Datos a enviar.
   */
  broadcast(event, data) {
    console.log(event);
    console.log(data);

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

  /**
   * Agrega un jugador a la sala individual.
   * @param {Player} player - Instancia del jugador.
   * @param {import("socket.io").Socket} socket - Socket de conexión del jugador.
   * @throws {Error} Si la sala ya tiene un jugador.
   */
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

  /**
   * Remueve un jugador de la sala.
   * @param {string} playerId - ID del jugador a remover.
   */
  removePlayer(playerId) {
    if (this.players.has(playerId)) {
      this.players.delete(playerId);
    }
  }

  /**
   * Obtiene un jugador por su ID.
   * @param {string} playerId - ID del jugador.
   * @returns {Player | undefined} Instancia del jugador o undefined si no existe.
   */
  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  /**
   * Inicia el contador de tiempo para el juego.
   * En modo manual, solo cuenta hacia atrás pero no cambia estados automáticamente.
   */
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

  /**
   * Detiene el contador de tiempo.
   */
  stopCountdown() {
    clearInterval(this.countdownInterval);
  }

  /**
   * Activa o desactiva el modo manual del juego.
   * @param {boolean} value - true para modo manual, false para automático.
   */
  setManualMode(value) {
    this.manualMode = value;
  }

  /**
   * Activa manualmente el giro de la ruleta.
   * Solo funciona si el juego está en estado SPINNING.
   */
  triggerSpin() {
    if (this.gameState !== GAME_STATES.SPINNING) return;
    this.spinWheel();
  }

  /**
   * Avanza al siguiente estado del juego.
   * Maneja la transición entre BETTING -> SPINNING -> PAYOUT -> BETTING.
   */
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

  /**
   * Ejecuta el giro de la ruleta y anuncia el resultado.
   * El resultado se obtiene de la cola pregenerada del motor.
   */
  spinWheel() {
    this.winningNumber = this.rouletteEngine.getNextWinningNumber();
    this.broadcast("game-state-update", {
      state: this.gameState,
      winningNumber: this.winningNumber.number,
      winningColor: this.winningNumber.color,
    });
    setTimeout(() => this.nextState(), 6000);
  }

  /**
   * Procesa los pagos para todos los jugadores basado en el número ganador.
   * Calcula ganancias, actualiza balances y registra transacciones.
   * @param {{number: number, color: string}} winningNumber - Número y color ganador.
   */
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

      // Crear payload con resultados detallados
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

      // Preparar datos para guardar en base de datos
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

      // Guardar ronda en base de datos
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

    setTimeout(() => this.nextState(), 6000);
  }

  /**
   * Registra una nueva apuesta para un jugador.
   * @param {string} playerId - ID del jugador.
   * @param {string} betKey - Clave de la apuesta.
   * @param {number} amount - Monto a apostar.
   * @param {Function} callback - Función de retorno.
   * @param {boolean} [isIncreaseOnly=false] - Si es true, solo valida límites, no combinaciones.
   */
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

    // Calcular el monto total del último bloque de apuestas
    let totalLastBetsAmount = 0;
    lastBets.forEach((amount) => (totalLastBetsAmount += amount));

    // Verificar si ya hay apuestas actuales
    const currentBets = this.bets.get(playerId) || new Map();

    if (currentBets.size > 0) {
      // Si ya hay apuestas actuales, no repetir (evitar duplicación)
      const betsArray = Array.from(currentBets, ([key, val]) => ({
        betKey: key,
        amount: val,
      }));
      const totalBet = betsArray.reduce((sum, b) => sum + b.amount, 0);

      if (player.socket) {
        player.socket.emit("repeat-bet", {
          newBalance: player.balance,
          bets: betsArray,
          totalBet,
        });
      }
      return callback?.({ success: true, newBalance: player.balance });
    }

    // Verificar saldo suficiente para todas las apuestas del bloque
    if (player.balance < totalLastBetsAmount) {
      const socket = player.socket;
      if (socket) {
        emitErrorByKey(socket, "INSUFFICIENT_BALANCE", {
          details: {
            attempted: totalLastBetsAmount,
            currentBalance: player.balance,
          },
        });
      }
      return callback?.({
        success: false,
        message: "Saldo insuficiente para repetir todas las apuestas.",
      });
    }

    // Validar todas las apuestas del bloque antes de aplicarlas
    for (const [betKey, amount] of lastBets) {
      const validation = this.rouletteEngine.isBetAllowedDetailed(betKey, currentBets, amount);
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
    }

    // Aplicar todas las apuestas del último bloque
    lastBets.forEach((amount, betKey) => {
      currentBets.set(betKey, amount);
    });

    // Actualizar el saldo
    player.balance -= totalLastBetsAmount;
    this.bets.set(playerId, currentBets);

    const betsArray = Array.from(currentBets, ([key, val]) => ({
      betKey: key,
      amount: val,
    }));
    const totalBet = betsArray.reduce((sum, b) => sum + b.amount, 0);

    if (player.socket) {
      player.socket.emit("repeat-bet", {
        newBalance: player.balance,
        bets: betsArray,
        totalBet,
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

  // =============== MÉTODOS AUXILIARES ASINCRONOS ===============

  /**
   * Confirma las apuestas de un jugador con el servicio externo de casino.
   * @param {string} playerId - ID del jugador.
   */
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

  /**
   * Deposita las ganancias de un jugador en el servicio externo de casino.
   * @param {string} playerId - ID del jugador.
   * @param {number} amount - Monto a depositar.
   * @param {string} ip - Dirección IP del jugador.
   */
  async attemptDepositWinnings(playerId, amount, ip) {
    try {
      await CasinoApiService.depositWinnings(playerId, amount, ip);
      console.log(`✅ Ganancias depositadas para ${playerId}: ${amount}`);
    } catch (error) {
      console.error(`❌ Falló depositWinnings para ${playerId}:`, error.message);
      throw error;
    }
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
