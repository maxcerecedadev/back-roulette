// classes/SinglePlayerRoom.js
import { RouletteEngine } from "./RouletteEngine.js";
import { emitErrorByKey } from "../utils/errorHandler.js";
import { BetLimits } from "./BetLimits.js";

const GAME_STATES = {
  BETTING: "betting",
  SPINNING: "spinning",
  PAYOUT: "payout",
};

export class SinglePlayerRoom {
  constructor(io, roomId) {
    console.log(`[Constructor] Creando nueva sala ${roomId}`);
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
  }

  broadcast(event, data) {
    this.server.to(this.id).emit(event, data);
  }

  getPlayerSocket(playerId) {
    const player = this.players.get(playerId);
    return player?.socket || null;
  }

  addPlayer(player, socket) {
    if (this.players.size >= 1)
      throw new Error("Esta sala es solo para un jugador.");

    player.socket = socket;
    player.socketId = socket.id;
    this.players.set(player.id, player);

    console.log(
      `🟢 Jugador ${player.name} (${player.id}) se unió. Balance: ${player.balance}`
    );

    socket.emit("player-initialized", player.toSocketData());

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
    console.log(`[SinglePlayerRoom] Modo manual: ${value}`);
  }

  triggerSpin() {
    if (this.gameState !== GAME_STATES.SPINNING) {
      console.warn(
        "[triggerSpin] No se puede lanzar la ruleta en este estado."
      );
      return;
    }
    console.log("[triggerSpin] Botón presionado, lanzando rueda");
    this.spinWheel();
  }

  nextState() {
    console.log(
      `[nextState] Estado actual: Desde aquí comienza nuevo ciclo: ${this.gameState}`
    );
    this.stopCountdown();

    if (this.gameState === GAME_STATES.BETTING) {
      const hasBets = Array.from(this.bets.values()).some(
        (bets) => bets.size > 0
      );

      if (!hasBets) {
        console.log(
          "[nextState] No hay apuestas, reiniciando ciclo de apuestas"
        );
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
        console.log("[nextState] Esperando acción manual para spinWheel()");
        this.broadcast("game-state-update", { state: this.gameState });
      } else {
        this.spinWheel();
      }
    } else if (this.gameState === GAME_STATES.SPINNING) {
      this.gameState = GAME_STATES.PAYOUT;

      if (!this.winningNumber) {
        console.warn(
          "[nextState] WARNING: winningNumber es null, generando uno ahora"
        );
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
    console.log(
      `🎡 [spinWheel] Número ganador generado: ${this.winningNumber.number} (${this.winningNumber.color})`
    );

    this.broadcast("game-state-update", {
      state: this.gameState,
      winningNumber: this.winningNumber.number,
      winningColor: this.winningNumber.color,
    });

    console.log(
      `[spinWheel] Emisión enviada. Se pasará al estado PAYOUT en 6 segundos.`
    );

    setTimeout(() => {
      console.log(`[Timeout] 6 segundos pasaron. Llamando a nextState().`);
      this.nextState();
    }, 6000);
  }

  processPayout(winningNumber) {
    console.log(
      `[processPayout] Iniciando payout. Número ganador:`,
      winningNumber
    );

    this.players.forEach((player, playerId) => {
      const playerBets = this.bets.get(playerId) || new Map();
      let totalWinnings = 0;
      let totalBetAmount = 0;
      const betResults = [];
      const balanceBeforePayout = player.balance;

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

      const balanceAfterPayout = player.balance;
      const totalNetResult = totalWinnings - totalBetAmount;

      // Logs detallados
      console.log(
        "------------------------------------------------------------"
      );
      console.log(`[PAYOUT START] Jugador: ${player.name} (${playerId})`);
      console.log(`Balance antes: ${balanceBeforePayout}`);
      console.log(`Total apostado: ${totalBetAmount}`);
      console.log(`Ganancias netas (totalWinnings): ${totalWinnings}`);
      console.log(
        `Resultado neto (totalWinnings - totalBetAmount): ${totalNetResult}`
      );

      if (playerBets.size === 0) {
        console.log("⚠️  El jugador NO realizó apuestas esta ronda.");
      } else {
        console.log("Apuestas realizadas:", Array.from(playerBets.keys()));
      }

      console.log("Detalle de apuestas:");
      betResults.forEach((bet) => {
        const status = bet.result === "win" ? "GANÓ" : "PERDIÓ";
        const multiplier =
          bet.profitMultiplier > 0 ? `(${bet.profitMultiplier}:1)` : "";
        if (bet.result === "win") {
          console.log(
            `- ${bet.betKey} | ${bet.amount} | ${status} ${multiplier} | Ganancia: +${bet.winnings} | Total recibido: ${bet.totalReceived}`
          );
        } else {
          console.log(
            `- ${bet.betKey} | ${bet.amount} | ${status} | Perdido: -${bet.amount}`
          );
        }
      });

      console.log("Resumen:");
      console.log(`Total apostado: -${totalBetAmount}`);
      console.log(`Total ganado (neto): +${totalWinnings}`);
      console.log(
        `Resultado neto de ronda: ${
          totalNetResult >= 0 ? "+" : ""
        }${totalNetResult}`
      );
      console.log(`Balance después: ${balanceAfterPayout}`);

      let resultStatus =
        playerBets.size === 0 ? "no_bet" : totalWinnings > 0 ? "win" : "lose";

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
      console.log(
        "------------------------------------------------------------"
      );
    });

    setTimeout(() => this.nextState(), 5000);
  }

  placeBet(playerId, betKey, amount, callback, isIncreaseOnly = false) {
    console.log(
      `[SinglePlayerRoom] placeBet llamado: ${playerId}, ${betKey}, ${amount}`
    );

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

      return {
        balance: player.balance,
        bets: betsArray,
        totalBet,
      };
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
      console.log(
        `🚫 [placeBet] Saldo insuficiente para ${player.name}: ${player.balance} < ${amount}`
      );
      return callback?.({ success: false, message: "Saldo insuficiente." });
    }

    if (!this.bets.has(playerId)) this.bets.set(playerId, new Map());
    const playerBets = this.bets.get(playerId);

    console.log(
      `[DEBUG] Apuestas actuales de ${player.name} ANTES de validar:`
    );
    Array.from(playerBets.entries()).forEach(([key, val]) => {
      console.log(`   - ${key}: $${val}`);
    });

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
        details: limitValidation,
      };
    } else {
      // Validar todo (cobertura, conflictos, límites)
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
          state: buildStateSnapshot(),
        });
      }

      // 👇 LOG 2: Detalle de por qué falló
      console.log(
        `[DEBUG] Validación FALLIDA para ${betKey}:`,
        validation.details?.reason || "Razón desconocida"
      );
      if (validation.details?.coverage) {
        console.log(
          `[DEBUG] Cobertura: actual=${validation.details.coverage.current}, con nueva=${validation.details.coverage.withNew}, máximo=${validation.details.coverage.max}`
        );
      }

      return callback?.({
        success: false,
        message: validation.details?.reason || "Apuesta no permitida.",
      });
    }

    // 5. ✅ Registrar apuesta
    const currentAmount = playerBets.get(betKey) || 0;
    playerBets.set(betKey, currentAmount + amount);
    player.balance -= amount;

    // Registrar en lastBets
    if (!this.lastBets.has(playerId)) this.lastBets.set(playerId, new Map());
    const lastPlayerBets = this.lastBets.get(playerId);
    lastPlayerBets.set(betKey, (lastPlayerBets.get(betKey) || 0) + amount);

    console.log(
      `🟢 [placeBet] Jugador ${player.name} apostó ${amount} a ${betKey}. Nuevo balance: ${player.balance}`
    );

    // 👇 LOG 3: Apuestas actuales DESPUÉS de registrar
    console.log(
      `[DEBUG] Apuestas actuales de ${player.name} DESPUÉS de apostar:`
    );
    Array.from(playerBets.entries()).forEach(([key, val]) => {
      console.log(`   - ${key}: $${val}`);
    });

    // Preparar respuesta
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

    console.log(
      `[clearBets] Apuestas antes de limpiar:`,
      this.bets.get(playerId)
    );

    let totalRefund = 0;
    if (this.bets.has(playerId)) {
      totalRefund = Array.from(this.bets.get(playerId).values()).reduce(
        (sum, amt) => sum + amt,
        0
      );
      console.log(
        `[clearBets] Devolviendo al jugador ${player.name}:`,
        totalRefund
      );
      player.updateBalance(totalRefund);
      this.bets.delete(playerId);
    }

    console.log(
      `[clearBets] Apuestas después de limpiar:`,
      this.bets.get(playerId)
    );
    console.log(
      `[clearBets] Nuevo balance del jugador ${player.name}:`,
      player.balance
    );

    // 👇 EMITIR EVENTO AL FRONTEND
    if (player.socket) {
      player.socket.emit("bets-cleared", {
        newBalance: player.balance,
        bets: [], // apuestas vacías
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
    console.log(`[undoBet] Deshaciendo última apuesta: ${betKey} -> ${amount}`);
    playerBets.delete(betKey);

    const player = this.players.get(playerId);
    if (!player) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "PLAYER_NOT_FOUND");
      return callback?.({ success: false, message: "Jugador no encontrado." });
    }

    player.updateBalance(amount);
    console.log(`[undoBet] Apuestas restantes:`, [...playerBets.entries()]);
    console.log(
      `[undoBet] Nuevo balance del jugador ${player.name}:`,
      player.balance
    );

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
        // 👇 EMITIR ERROR CON STATE
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
            totalBet: Array.from(playerBets.values()).reduce(
              (sum, amt) => sum + amt,
              0
            ),
          },
        });
      }
      console.warn(
        `[doubleBet] Jugador ${player.name} no tiene saldo suficiente para duplicar todas las apuestas.`
      );
      // 👇 LLAMAR AL CALLBACK CON ERROR
      return callback?.({ success: false, message: "Saldo insuficiente." });
    }

    // 👇 Validar solo límites de monto (no cobertura ni conflictos)
    const limitErrors = [];
    for (const [betKey, amount] of playerBets.entries()) {
      const limitValidation = BetLimits.validateBetAmount(
        betKey,
        playerBets,
        amount
      );

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
        // 👇 EMITIR ERROR CON STATE
        emitErrorByKey(socket, "BET_TYPE_LIMIT_EXCEEDED", {
          details: {
            reason: limitErrors[0].reason,
            limitErrors,
          },
          state: {
            balance: player.balance,
            bets: Array.from(playerBets, ([key, val]) => ({
              betKey: key,
              amount: val,
            })),
            totalBet: Array.from(playerBets.values()).reduce(
              (sum, amt) => sum + amt,
              0
            ),
          },
        });
      }
      // 👇 LLAMAR AL CALLBACK CON ERROR
      return callback?.({
        success: false,
        message: limitErrors[0].reason,
      });
    }

    // 👇 Duplicar cada apuesta — usar isIncreaseOnly = true
    for (const [betKey, amount] of playerBets.entries()) {
      this.placeBet(playerId, betKey, amount, () => {}, true);
    }

    // 👇 Obtener estado actualizado después de placeBet
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

    console.log(
      `[doubleBet] Jugador ${player.name} duplicó apuestas. Nuevo balance: ${player.balance}, Total apostado: ${totalBet}`
    );

    callback?.({ success: true, newBalance: player.balance });
  }

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
