// classes/TournamentRoom.js
import { RouletteEngine } from "./RouletteEngine.js";
import { emitErrorByKey } from "../utils/errorHandler.js";
import { BetLimits } from "./BetLimits.js";
import prisma from "../prisma/index.js";

const GAME_STATES = {
  WAITING: "waiting",
  IN_PROGRESS: "in_progress",
  FINISHED: "finished",
};

const MAX_ROUNDS = 30;
const ENTRY_FEE = 10000;
const HOUSE_TAKE_PERCENT = 0.2;

export class TournamentRoom {
  constructor(io, roomId) {
    this.server = io;
    this.id = roomId;
    this.players = new Map();
    this.gameState = GAME_STATES.WAITING;
    this.currentRound = 0;
    this.totalRounds = MAX_ROUNDS;
    this.rouletteEngine = new RouletteEngine(20);
    this.winningNumber = null;
    this.potTotal = 0;
    this.houseEarnings = 0;
    this.payoutPool = 0;
    this.roundResults = [];
    this.bets = new Map();

    this.startTournament();
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
      throw new Error("Torneo completo. No se aceptan más jugadores.");
    }

    if (player.inTournament) {
      throw new Error(
        "Ya estás en otro torneo. Termina el actual antes de unirte a otro."
      );
    }

    player.socket = socket;
    player.socketId = socket.id;
    player.ip = socket.handshake.address || "unknown";
    player.inTournament = true;

    // Verificar saldo
    if (player.balance < ENTRY_FEE) {
      const socket = this.getPlayerSocket(player.id);
      if (socket)
        emitErrorByKey(socket, "INSUFFICIENT_BALANCE", {
          details: { required: ENTRY_FEE, current: player.balance },
        });
      throw new Error(`Saldo insuficiente. Necesitas ${ENTRY_FEE} fichas.`);
    }

    // Deducción de entrada
    player.balance -= ENTRY_FEE;

    this.players.set(player.id, {
      player,
      points: 0,
      bets: new Map(),
    });

    socket.emit("tournament-joined", {
      message: "¡Te has unido al torneo!",
      tournamentId: this.id,
      playersInTournament: this.players.size,
      entryFee: ENTRY_FEE,
      pot: this.potTotal + ENTRY_FEE,
    });

    this.broadcast("tournament-player-joined", {
      playerId: player.id,
      playerName: player.name,
      playersJoined: this.players.size,
      maxPlayers: 3,
    });

    if (this.players.size === 3) {
      this.startGame();
    }
  }

  removePlayer(playerId) {
    if (this.players.has(playerId)) {
      const playerData = this.players.get(playerId);
      const player = playerData.player;

      if (this.gameState === GAME_STATES.WAITING) {
        player.balance += ENTRY_FEE;
        player.inTournament = false;
      } else if (this.gameState === GAME_STATES.IN_PROGRESS) {
        console.warn(
          `⚠️ Jugador ${playerId} se desconectó durante el torneo. Descalificado.`
        );
      }

      this.players.delete(playerId);

      this.broadcast("tournament-player-left", {
        playerId,
        playersLeft: this.players.size,
      });

      if (this.gameState === GAME_STATES.WAITING && this.players.size < 3) {
        console.log(
          `🔄 Torneo ${this.id}: Reiniciando por falta de jugadores.`
        );
      }
    }
  }

  startTournament() {
    console.log(`🏆 Torneo ${this.id} creado. Esperando jugadores...`);
  }

  startGame() {
    if (this.players.size !== 3) return;

    this.gameState = GAME_STATES.IN_PROGRESS;
    this.potTotal = 3 * ENTRY_FEE;
    this.houseEarnings = Math.floor(this.potTotal * HOUSE_TAKE_PERCENT);
    this.payoutPool = this.potTotal - this.houseEarnings;

    this.saveTournamentStart();

    this.broadcast("tournament-started", {
      gameState: this.gameState,
      potTotal: this.potTotal,
      houseEarnings: this.houseEarnings,
      payoutPool: this.payoutPool,
      rounds: this.totalRounds,
      currentRound: this.currentRound,
    });

    this.nextRound();
  }

  nextRound() {
    if (this.gameState !== GAME_STATES.IN_PROGRESS) return;

    this.currentRound++;
    this.bets.clear();

    if (this.currentRound > this.totalRounds) {
      this.endTournament();
      return;
    }

    this.winningNumber = this.rouletteEngine.getNextWinningNumber();
    this.roundResults.push(this.winningNumber);

    this.broadcast("round-update", {
      round: this.currentRound,
      winningNumber: this.winningNumber.number,
      winningColor: this.winningNumber.color,
      remainingRounds: this.totalRounds - this.currentRound,
    });

    setTimeout(() => {
      this.processRoundResult();
    }, 10000);
  }

  processRoundResult() {
    const winningNumber = this.winningNumber;

    this.players.forEach((playerData) => {
      const playerBets = playerData.bets;
      let pointsEarned = 0;

      playerBets.forEach((amount, betKey) => {
        const profitMultiplier = this.rouletteEngine.calculatePayout(
          winningNumber,
          betKey
        );
        if (profitMultiplier > 0) {
          pointsEarned += amount * profitMultiplier;
        }
      });

      playerData.points += pointsEarned;
    });

    this.broadcast("round-points-updated", {
      round: this.currentRound,
      winningNumber: winningNumber.number,
      winningColor: winningNumber.color,
      standings: Array.from(this.players.entries())
        .map(([id, data]) => ({
          playerId: id,
          playerName: data.player.name,
          points: data.points,
          balance: data.player.balance,
        }))
        .sort((a, b) => b.points - a.points),
    });

    setTimeout(() => this.nextRound(), 1000);
  }

  placeBet(playerId, betKey, amount, callback) {
    if (this.gameState !== GAME_STATES.IN_PROGRESS) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "GAME_STATE_INVALID");
      return callback?.({
        success: false,
        message: "No se aceptan apuestas en este momento.",
      });
    }

    const player = this.players.get(playerId)?.player;
    if (!player) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "PLAYER_NOT_FOUND");
      return callback?.({ success: false, message: "Jugador no encontrado." });
    }

    if (player.balance < amount) {
      const socket = player.socket;
      if (socket)
        emitErrorByKey(socket, "INSUFFICIENT_BALANCE", {
          details: { attempted: amount, currentBalance: player.balance },
        });
      return callback?.({ success: false, message: "Saldo insuficiente." });
    }

    if (!this.bets.has(playerId)) this.bets.set(playerId, new Map());
    const playerBets = this.bets.get(playerId);

    const limitValidation = BetLimits.validateBetAmount(
      betKey,
      playerBets,
      amount
    );

    if (!limitValidation.allowed) {
      const socket = player.socket;
      if (socket)
        emitErrorByKey(socket, "BET_TYPE_LIMIT_EXCEEDED", {
          betKey,
          amount,
          details: {
            reason: limitValidation.reason,
            maxAllowed: limitValidation.maxAllowed,
            proposedTotal: limitValidation.proposedTotal,
            currentTotal: limitValidation.currentTotal,
          },
        });
      return callback?.({
        success: false,
        message:
          limitValidation.reason || "Apuesta excede los límites permitidos.",
      });
    }

    const engineValidation = this.rouletteEngine.isBetAllowedDetailed(
      betKey,
      playerBets,
      amount
    );

    if (!engineValidation.allowed) {
      const socket = player.socket;
      if (socket)
        emitErrorByKey(
          socket,
          engineValidation.reasonCode || "BET_NOT_ALLOWED",
          {
            betKey,
            amount,
            details: { ...engineValidation.details },
          }
        );
      return callback?.({
        success: false,
        message: engineValidation.details?.reason || "Apuesta no permitida.",
      });
    }

    const currentAmount = playerBets.get(betKey) || 0;
    playerBets.set(betKey, currentAmount + amount);
    player.balance -= amount;

    this.broadcast("bet-placed", {
      playerId,
      betKey,
      amount,
      newBalance: player.balance,
    });

    callback?.({ success: true, newBalance: player.balance });
  }

  clearBets(playerId, callback) {
    if (this.gameState !== GAME_STATES.IN_PROGRESS) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "GAME_STATE_INVALID");
      return callback?.({
        success: false,
        message: "No se aceptan apuestas en este momento.",
      });
    }

    const player = this.players.get(playerId)?.player;
    if (!player) {
      const socket = this.getPlayerSocket(playerId);
      if (socket) emitErrorByKey(socket, "PLAYER_NOT_FOUND");
      return callback?.({ success: false, message: "Jugador no encontrado." });
    }

    const playerBets = this.bets.get(playerId);
    if (!playerBets || playerBets.size === 0) {
      return callback?.({
        success: false,
        message: "No hay apuestas para limpiar.",
      });
    }

    let totalRefund = 0;
    playerBets.forEach((amount) => (totalRefund += amount));
    player.balance += totalRefund;
    playerBets.clear();

    this.broadcast("bets-cleared", { playerId });
    callback?.({ success: true, newBalance: player.balance });
  }

  endTournament() {
    this.gameState = GAME_STATES.FINISHED;

    const standings = Array.from(this.players.entries())
      .map(([id, data]) => ({
        playerId: id,
        playerName: data.player.name,
        points: data.points,
        balanceBefore: data.player.balance + ENTRY_FEE,
      }))
      .sort((a, b) => b.points - a.points);

    let prizes = [0, 0, 0];

    if (standings.length === 0) {
      console.error("❌ Sin jugadores en torneo para repartir premios");
      return;
    }

    const first = standings[0];
    const second = standings[1];
    const third = standings[2];

    if (first.points === second.points && second.points === third.points) {
      prizes = [this.payoutPool / 3, this.payoutPool / 3, this.payoutPool / 3];
    } else if (first.points === second.points) {
      prizes = [this.payoutPool / 2, this.payoutPool / 2, 0];
    } else {
      prizes = [this.payoutPool, 0, 0];
    }

    for (let i = 0; i < 3; i++) {
      if (standings[i]) {
        const playerData = this.players.get(standings[i].playerId);
        const prize = prizes[i];
        if (prize > 0) {
          playerData.player.balance += prize;
          playerData.player.inTournament = false;
        }
      }
    }

    this.saveTournamentEnd(standings, prizes);

    this.broadcast("tournament-ended", {
      standings,
      prizes,
      houseEarnings: this.houseEarnings,
      totalPot: this.potTotal,
      payoutPool: this.payoutPool,
      winner: standings[0],
    });

    console.log(`🏁 Torneo ${this.id} finalizado. Premios repartidos.`);
  }

  saveTournamentStart() {
    prisma.tournament
      .create({
        data: {
          id: this.id,
          status: "started",
          entryFee: ENTRY_FEE,
          totalPlayers: 3,
          houseTake: this.houseEarnings,
          payoutPool: this.payoutPool,
          createdAt: new Date(),
        },
      })
      .catch((err) =>
        console.error("❌ Error guardando inicio de torneo:", err)
      );
  }

  saveTournamentEnd(standings, prizes) {
    prisma.tournament
      .update({
        where: { id: this.id },
        data: {
          status: "completed",
          endedAt: new Date(),
          standings: JSON.stringify(standings),
          prizes: JSON.stringify(prizes),
          houseTake: this.houseEarnings,
          payoutPool: this.payoutPool,
        },
      })
      .catch((err) => console.error("❌ Error guardando fin de torneo:", err));
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
