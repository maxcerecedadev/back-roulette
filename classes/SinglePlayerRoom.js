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
    this.rouletteEngine = new RouletteEngine(20);
    this.winningNumber = null;
    this.lastWinningNumber = null;

    this.startCountdown();
  }
  broadcast(event, data) {
    this.server.to(this.id).emit(event, data);
  }

  addPlayer(player, socket) {
    if (this.players.size >= 1) {
      throw new Error("Esta sala es solo para un jugador.");
    }

    // Añadir socketId a la instancia de User
    player.socketId = socket.id;

    // Guardar la instancia completa en el Map
    this.players.set(player.id, player);

    console.log(
      `🟢 Jugador ${player.name} (${player.id}) se unió. Balance: ${player.balance}`
    );

    // Emitir solo al socket del jugador
    this.server.to(socket.id).emit("player-initialized", player.toSocketData());

    // Actualizar estado a todos los que estén en la sala
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
    console.log(`[nextState] Transicionando del estado: ${this.gameState}`);
    this.stopCountdown();
    if (this.gameState === GAME_STATES.BETTING) {
      this.gameState = GAME_STATES.SPINNING;
      this.spinWheel();
    } else if (this.gameState === GAME_STATES.SPINNING) {
      this.gameState = GAME_STATES.PAYOUT;
      this.processPayout(this.winningNumber);
    } else if (this.gameState === GAME_STATES.PAYOUT) {
      this.gameState = GAME_STATES.BETTING;
      this.timeRemaining = 20;
      this.broadcast("game-state-update", {
        state: this.gameState,
        time: this.timeRemaining,
      });
      this.winningNumber = null;
      this.startCountdown();
    }
  }

  spinWheel() {
    this.winningNumber = this.rouletteEngine.getNextWinningNumber();
    console.log(
      `🎡 [spinWheel] Número ganador generado: ${this.winningNumber.number} (${this.winningNumber.color})`
    ); // AHORA se emite el estado con el número ganador

    this.broadcast("game-state-update", {
      state: this.gameState,
      winningNumber: this.winningNumber.number,
      winningColor: this.winningNumber.color,
    });

    console.log(
      `[spinWheel] Emisión enviada. Se pasará al estado PAYOUT en 6 segundos.`
    ); // Pasar al siguiente estado después de que la animación termine

    setTimeout(() => {
      console.log(`[Timeout] 6 segundos pasaron. Llamando a nextState().`);
      this.nextState();
    }, 6000); // 6s = duración de la animación en front
  }

  processPayout(winningNumber) {
    console.log(
      `\n🏆 [processPayout] Iniciando proceso de pago. Número ganador: ${winningNumber.number}`
    );

    this.players.forEach((player, playerId) => {
      let totalWin = 0;
      const playerBets = this.bets.get(playerId) || new Map();
      const didPlayerBet = playerBets.size > 0;

      playerBets.forEach((betAmount, betKey) => {
        const multiplier = this.rouletteEngine.getBetResult(
          winningNumber,
          betKey
        );
        const won = betAmount * multiplier;
        totalWin += won;
      });

      // Agrega las ganancias al balance del jugador
      if (totalWin > 0) {
        player.updateBalance(totalWin);
      }

      // <-- Lógica para determinar el estado del resultado
      let resultStatus = "no_bet"; // Valor por defecto
      if (didPlayerBet) {
        if (totalWin > 0) {
          resultStatus = "win";
        } else {
          resultStatus = "lose";
        }
      }

      console.log(
        `[processPayout] Jugador ${player.name}. Total Ganado: ${totalWin}. Nuevo Balance: ${player.balance}. Estado: ${resultStatus}`
      );

      const payload = {
        state: GAME_STATES.PAYOUT,
        winningNumber: winningNumber.number,
        winningColor: winningNumber.color,
        totalWinnings: totalWin,
        newBalance: player.balance,
        resultStatus: resultStatus, // <-- Nuevo campo emitido
      };

      console.log(
        `[processPayout] Enviando payload a jugador ${playerId}: `,
        JSON.stringify(payload)
      );
      this.server.to(player.socketId).emit("game-state-update", payload);

      this.bets.set(playerId, new Map());
    });

    setTimeout(() => {
      this.nextState();
    }, 5000);
  }

  placeBet(playerId, betKey, amount) {
    console.log(
      `[SinglePlayerRoom] placeBet llamado: ${playerId}, ${betKey}, ${amount}`
    );
    console.log(
      "[DEBUG] placeBet playerId:",
      playerId,
      "players.keys():",
      Array.from(this.players.keys())
    );

    if (this.gameState !== GAME_STATES.BETTING) return;
    const player = this.players.get(playerId);
    if (!player || player.balance < amount) return;

    if (!this.bets.has(playerId)) this.bets.set(playerId, new Map());
    const playerBets = this.bets.get(playerId);
    const currentAmount = playerBets.get(betKey) || 0;
    playerBets.set(betKey, currentAmount + amount);
    player.balance -= amount;

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

    this.server.to(playerId).emit("bet-undone", {
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
