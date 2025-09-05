// classes/SinglePlayerRoom.js
import { RouletteEngine } from "./RouletteEngine.js";

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

  addPlayer(player, socket) {
    if (this.players.size >= 1)
      throw new Error("Esta sala es solo para un jugador.");
    player.socketId = socket.id;
    this.players.set(player.id, player);

    console.log(
      `🟢 Jugador ${player.name} (${player.id}) se unió. Balance: ${player.balance}`
    );

    this.server.to(socket.id).emit("player-initialized", player.toSocketData());

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
        if (this.timeRemaining <= 0) this.nextState();
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
      `[nextState] Estado actual: Desde aqui comienza nuevo ciclo: ${this.gameState}`
    );
    this.stopCountdown();

    if (this.gameState === GAME_STATES.BETTING) {
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
      this.broadcast("game-state-update", {
        state: this.gameState,
        time: this.timeRemaining,
      });
      this.winningNumber = null;
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
      let totalWinnings = 0; // ✅ Ganancias netas (solo lo que gana, sin incluir devolución de apuesta)
      let totalBetAmount = 0;
      const betResults = [];
      const balanceBeforePayout = player.balance; // Balance ya tiene descontadas las apuestas

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

      // ✅ Actualizamos balance solo con ganancias netas
      if (totalWinnings > 0) {
        player.updateBalance(totalWinnings);
      }

      const balanceAfterPayout = player.balance;
      const totalNetResult = totalWinnings - totalBetAmount;

      // 🔍 LOGS DETALLADOS PARA ENTENDER resultStatus
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

      // 🔍 Mostramos el estado de las apuestas
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

      // 🔥 CÁLCULO Y LOG DE resultStatus
      let resultStatus;
      if (playerBets.size === 0) {
        resultStatus = "no_bet";
        console.log("🎯 resultStatus asignado: 'no_bet' (no hizo apuestas)");
      } else if (totalWinnings > 0) {
        resultStatus = "win";
        console.log(
          `🎯 resultStatus asignado: 'win' (totalWinnings > 0: ${totalWinnings})`
        );
      } else {
        resultStatus = "lose";
        console.log(`🎯 resultStatus asignado: 'lose' (totalWinnings = 0)`);
      }

      // 📦 Payload que se envía
      const payload = {
        state: "payout",
        winningNumber: winningNumber.number,
        winningColor: winningNumber.color,
        totalWinnings, // ✅ Ganancia neta (solo lo que gana)
        totalNetResult, // ✅ Para que el frontend sepa si ganó/perdió/empató
        newBalance: balanceAfterPayout,
        resultStatus, // 🔥 Este es el valor que se envía
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

      console.log(
        `📤 Enviando a jugador ${player.name} (${playerId}) el estado:`,
        {
          resultStatus,
          totalWinnings,
          totalNetResult,
          newBalance: balanceAfterPayout,
          betCount: betResults.length,
        }
      );

      // Emitir al jugador o broadcast
      if (player.socketId) {
        this.server.to(player.socketId).emit("game-state-update", payload);
      } else {
        this.broadcast("game-state-update", payload);
      }

      // Guardar apuestas anteriores y limpiar
      this.lastBets.set(playerId, new Map(playerBets));
      this.bets.set(playerId, new Map());

      console.log(
        "------------------------------------------------------------"
      );
    });

    setTimeout(() => this.nextState(), 5000);
  }

  placeBet(playerId, betKey, amount) {
    console.log(
      `[SinglePlayerRoom] placeBet llamado: ${playerId}, ${betKey}, ${amount}`
    );

    if (this.gameState !== GAME_STATES.BETTING) return;
    const player = this.players.get(playerId);
    if (!player || player.balance < amount) return;

    if (!this.bets.has(playerId)) {
      this.bets.set(playerId, new Map());
    }
    const playerBets = this.bets.get(playerId);

    if (!this.rouletteEngine.isBetAllowed(betKey, playerBets)) {
      console.log(`🚫 Apuesta no permitida: ${betKey}`);
      return;
    }

    const currentAmount = playerBets.get(betKey) || 0;
    playerBets.set(betKey, currentAmount + amount);
    player.balance -= amount;

    // 🔥 Guardar también como última apuesta
    if (!this.lastBets.has(playerId)) {
      this.lastBets.set(playerId, new Map());
    }
    const lastPlayerBets = this.lastBets.get(playerId);
    lastPlayerBets.set(betKey, (lastPlayerBets.get(betKey) || 0) + amount);

    console.log(
      `🟢 [placeBet] Jugador ${player.name} apostó ${amount} a ${betKey}. Nuevo balance: ${player.balance}`
    );

    const betsArray = Array.from(playerBets, ([key, val]) => ({
      betKey: key,
      amount: val,
    }));
    const totalBet = betsArray.reduce((sum, bet) => sum + bet.amount, 0);

    this.server.to(playerId).emit("bet-placed", {
      newBalance: player.balance,
      bets: betsArray,
      totalBet,
    });
  }

  clearBets(playerId) {
    if (this.gameState !== GAME_STATES.BETTING) return;
    const player = this.players.get(playerId);
    if (!player) return;

    console.log(
      `[clearBets] Apuestas antes de limpiar:`,
      this.bets.get(playerId)
    );

    if (this.bets.has(playerId)) {
      const totalRefund = Array.from(this.bets.get(playerId).values()).reduce(
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

    console.log(`[undoBet] Deshaciendo última apuesta: ${betKey} -> ${amount}`);
    playerBets.delete(betKey);
    const player = this.players.get(playerId);
    player.updateBalance(amount);

    console.log(`[undoBet] Apuestas restantes:`, [...playerBets.entries()]);
    console.log(
      `[undoBet] Nuevo balance del jugador ${player.name}:`,
      player.balance
    );

    this.server.to(playerId).emit("bet-undone", {
      newBalance: player.balance,
      removedBet: { betKey, amount },
    });
  }

  repeatBet(playerId) {
    if (this.gameState !== GAME_STATES.BETTING) return;

    const player = this.players.get(playerId);
    if (!player) return;

    const lastBets = this.lastBets.get(playerId);
    if (!lastBets || lastBets.size === 0) {
      this.server
        .to(playerId)
        .emit("error", { message: "No hay apuestas para repetir." });
      return;
    }

    let totalAmount = 0;
    lastBets.forEach((amount) => (totalAmount += amount));
    if (player.balance < totalAmount) {
      this.server.to(playerId).emit("error", {
        message: "Saldo insuficiente para repetir apuestas.",
      });
      return;
    }

    const repeatedBets = new Map();
    lastBets.forEach((amount, betKey) => {
      repeatedBets.set(betKey, amount);
    });

    this.bets.set(playerId, repeatedBets);
    player.balance -= totalAmount;

    const betsArray = Array.from(repeatedBets, ([key, val]) => ({
      betKey: key,
      amount: val,
    }));

    this.server.to(playerId).emit("repeat-bet", {
      newBalance: player.balance,
      bets: betsArray,
      totalBet: totalAmount,
    });
  }

  doubleBet(playerId) {
    if (this.gameState !== GAME_STATES.BETTING) return;
    if (!this.bets.has(playerId)) return;

    const playerBets = this.bets.get(playerId);
    const player = this.players.get(playerId);
    if (!player) return;

    let totalAdditionalBet = 0;

    // Calcular el total adicional que se intentará duplicar
    playerBets.forEach((amount) => {
      totalAdditionalBet += amount;
    });

    if (player.balance < totalAdditionalBet) {
      console.warn(
        `[doubleBet] Jugador ${player.name} no tiene saldo suficiente para duplicar todas las apuestas.`
      );
      return;
    }

    // Reusar placeBet asegura validación y actualización correcta de saldo
    playerBets.forEach((amount, betKey) => {
      this.placeBet(playerId, betKey, amount);
    });

    // Emitir estado actualizado
    const updatedBets = this.bets.get(playerId) || new Map();
    const betsArray = Array.from(updatedBets, ([key, val]) => ({
      betKey: key,
      amount: val,
    }));
    const totalBet = betsArray.reduce((sum, b) => sum + b.amount, 0);

    this.server.to(playerId).emit("double-bet", {
      newBalance: player.balance,
      bets: betsArray,
      totalBet,
    });

    console.log(
      `[doubleBet] Jugador ${player.name} duplicó apuestas. Nuevo balance: ${player.balance}, Total apostado: ${totalBet}`
    );
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
