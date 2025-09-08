// handlers/tournamentHandler.js
import * as gameManager from "../services/gameManager.js";

export const tournamentHandler = (io, socket) => {
  socket.on("tournament-join", (data, callback) => {
    const { userId, userName, balance, tournamentId = "default" } = data;
    const player = { id: userId, name: userName, balance };

    const roomId = `tournament-${tournamentId}`;

    try {
      const room = gameManager.getOrCreateTournamentRoom(roomId, io);
      room.addPlayer(player, socket);
      socket.join(roomId);

      socket.player = player;

      if (callback) {
        callback({
          message: "Unido al torneo",
          roomId,
          user: player,
        });
      }

      console.log(`🏆 Jugador ${userName} unido al torneo ${roomId}`);
    } catch (error) {
      console.error("❌ Error al unirse al torneo:", error.message);
      if (callback) callback({ error: error.message });
    }
  });

  const getPlayerId = () => socket.player?.id;

  // ✅ Marcar jugador como listo
  socket.on("tournament:ready", ({ isReady }) => {
    const roomId = Array.from(socket.rooms).find((r) =>
      r.startsWith("tournament-")
    );
    if (!roomId) return;

    const room = gameManager.getRoom(roomId);
    if (!room || !getPlayerId()) return;

    room.setPlayerReady(getPlayerId(), isReady);
  });

  socket.on("place-bet", (betData) => {
    const { betKey, amount, roomId } = betData;
    const room = gameManager.getRoom(roomId);
    if (!room || !getPlayerId()) return;
    room.placeBet(getPlayerId(), betKey, amount);
  });

  socket.on("clear-bets", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room || !getPlayerId()) return;
    room.clearBets(getPlayerId());
  });

  socket.on("undo-bet", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room || !getPlayerId()) return;
    room.undoBet(getPlayerId());
  });

  socket.on("repeat-bet", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room || !getPlayerId()) return;
    room.repeatBet(getPlayerId());
  });

  socket.on("double-bet", ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room || !getPlayerId()) return;
    room.doubleBet(getPlayerId());
  });

  socket.on("spin", () => {
    console.warn(
      "[tournament] Spin manual ignorado — se controla por estado del torneo"
    );
  });

  socket.on("disconnect", () => {
    const rooms = Array.from(socket.rooms).filter((r) =>
      r.startsWith("tournament-")
    );
    rooms.forEach((roomId) => {
      const room = gameManager.getRoom(roomId);
      if (room && getPlayerId()) {
        room.removePlayer(getPlayerId());
        // Si la sala queda vacía, eliminarla
        if (room.players.size === 0) {
          gameManager.removeRoom(roomId);
        }
      }
    });
  });
};
