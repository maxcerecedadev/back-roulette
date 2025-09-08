// classes/TournamentRoom.js
import { SinglePlayerRoom } from "./SinglePlayerRoom.js";

const GAME_STATES = {
  BETTING: "betting",
  SPINNING: "spinning",
  PAYOUT: "payout",
};

export class TournamentRoom extends SinglePlayerRoom {
  constructor(io, roomId) {
    super(io, roomId);
    this.manualMode = false;
    this.readyPlayers = new Set();
    console.log(`[TournamentRoom] Sala de torneo creada: ${roomId}`);
  }

  addPlayer(player, socket) {
    const MAX_PLAYERS = 5;

    if (this.players.size >= MAX_PLAYERS) {
      console.warn(
        `[TournamentRoom] ❌ Intento de unirse fallido: sala llena (${MAX_PLAYERS} jugadores máximo)`
      );
      socket.emit("error", {
        message: `La sala está llena. Máximo ${MAX_PLAYERS} jugadores.`,
        code: "ROOM_FULL",
      });
      return;
    }

    player.socketId = socket.id;
    this.players.set(player.id, player);
    this.readyPlayers.delete(player.id);
    console.log(
      `🎮 [TournamentRoom] Jugador ${player.name} (${player.id}) se unió. Balance: ${player.balance}`
    );

    this.server.to(socket.id).emit("player-initialized", player.toSocketData());

    this.broadcastGameState();

    this.broadcast("player-joined", {
      playerId: player.id,
      player: player.toSocketData(),
      totalPlayers: this.players.size,
      maxPlayers: MAX_PLAYERS,
    });
  }
  setPlayerReady(playerId, isReady) {
    if (isReady) {
      this.readyPlayers.add(playerId);
    } else {
      this.readyPlayers.delete(playerId);
    }

    console.log(
      `[TournamentRoom] Jugador ${playerId} ${
        isReady ? "listo" : "no listo"
      }. Listos: ${this.readyPlayers.size}/${this.players.size}`
    );

    this.broadcast("player-ready-update", {
      playerId,
      isReady,
      readyCount: this.readyPlayers.size,
      totalPlayers: this.players.size,
    });

    if (
      this.gameState === GAME_STATES.BETTING &&
      this.readyPlayers.size === this.players.size &&
      this.players.size > 0
    ) {
      console.log(
        `[TournamentRoom] ✅ Todos los jugadores listos. Avanzando a SPINNING...`
      );
      this.nextState();
    }
  }

  startCountdown() {
    this.timeRemaining = 20;
    this.broadcastGameState();

    this.countdownInterval = setInterval(() => {
      if (this.gameState !== GAME_STATES.BETTING) {
        clearInterval(this.countdownInterval);
        return;
      }

      this.timeRemaining--;
      this.broadcastGameState();

      if (this.timeRemaining <= 0) {
        this.players.forEach((_, playerId) => {
          if (!this.readyPlayers.has(playerId)) {
            this.setPlayerReady(playerId, true);
          }
        });

        if (this.gameState === GAME_STATES.BETTING) {
          this.nextState();
        }
      }
    }, 1000);
  }

  broadcastGameState() {
    this.broadcast("game-state-update", {
      state: this.gameState,
      time: this.timeRemaining,
      readyPlayers: Array.from(this.readyPlayers),
      totalPlayers: this.players.size,
    });
  }

  nextState() {
    console.log(`[TournamentRoom] nextState desde: ${this.gameState}`);

    this.stopCountdown();

    if (this.gameState === GAME_STATES.BETTING) {
      this.gameState = GAME_STATES.SPINNING;
      this.broadcastGameState();
      this.spinWheel(); // En torneo, spin es automático
    } else if (this.gameState === GAME_STATES.SPINNING) {
      this.gameState = GAME_STATES.PAYOUT;

      if (!this.winningNumber) {
        this.winningNumber = this.rouletteEngine.getNextWinningNumber();
      }

      this.processPayout(this.winningNumber);
    } else if (this.gameState === GAME_STATES.PAYOUT) {
      this.gameState = GAME_STATES.BETTING;
      this.timeRemaining = 20;
      this.readyPlayers.clear(); // Resetear estado "ready" para nueva ronda
      this.broadcastGameState();
      this.startCountdown();
    }
  }

  // ✅ Sobrescribimos processPayout para que emita a todos simultáneamente
  processPayout(winningNumber) {
    console.log(`[TournamentRoom] Procesando payout para todos los jugadores`);

    // Primero, calculamos los resultados para todos
    const allResults = {};

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
        if (isWin) {
          winnings = amount * profitMultiplier;
          totalWinnings += amount + winnings; // Recibe apuesta + ganancia
        }

        betResults.push({
          betKey,
          amount,
          result: isWin ? "win" : "lose",
          winnings,
          profitMultiplier: isWin ? profitMultiplier : 0,
        });
      });

      if (totalWinnings > 0) {
        player.updateBalance(totalWinnings);
      }

      const balanceAfterPayout = player.balance;
      const totalNetResult = totalWinnings - totalBetAmount;

      let resultStatus;
      if (playerBets.size === 0) {
        resultStatus = "no_bet";
      } else if (totalWinnings > 0) {
        resultStatus = "win";
      } else {
        resultStatus = "lose";
      }

      allResults[playerId] = {
        playerName: player.name,
        resultStatus,
        totalWinnings,
        totalNetResult,
        newBalance: balanceAfterPayout,
        betResults,
      };

      // Guardar apuestas para "repeat bet"
      this.lastBets.set(playerId, new Map(playerBets));
      this.bets.set(playerId, new Map());
    });

    // Emitir el resultado a TODOS los jugadores al mismo tiempo
    this.broadcast("game-state-update", {
      state: GAME_STATES.PAYOUT,
      winningNumber: winningNumber.number,
      winningColor: winningNumber.color,
      results: allResults, // ✅ Todos reciben los resultados de todos
    });

    setTimeout(() => this.nextState(), 5000);
  }

  // ✅ Sobrescribimos removePlayer para limpiar ready state
  removePlayer(playerId) {
    super.removePlayer(playerId);
    this.readyPlayers.delete(playerId);
    console.log(
      `[TournamentRoom] Jugador ${playerId} eliminado de readyPlayers`
    );

    // Si quedan jugadores, reevaluar estado
    if (this.players.size > 0 && this.gameState === GAME_STATES.BETTING) {
      this.broadcastGameState();
    }
  }

  triggerSpin() {
    console.warn("[TournamentRoom] Spin manual bloqueado — solo automático");
  }
}
