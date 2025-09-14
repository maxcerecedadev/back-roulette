// classes/Player.js

export class Player {
  /**
   * @param {string} id - El ID único del usuario.
   * @param {string} name - El nombre de usuario.
   * @param {number} balance - El saldo inicial del usuario.
   * @param {string} currency - La moneda del jugador (por defecto "ARS").
   */
  constructor(id, name, balance, currency = "ARS") {
    this.id = id;
    this.name = name;
    this.balance = balance;
    this.initialBalance = balance;
    this.currency = currency;
    this.isReady = false;
    this.socket = null;
    this.socketId = null;
    this.ip = null;
    this.inTournament = false;
  }

  /**
   * Serializa los datos del jugador para enviar al frontend.
   * @returns {Object} Datos seguros para emitir por WebSocket.
   */
  toSocketData() {
    return {
      id: this.id,
      name: this.name,
      balance: this.balance,
      currency: this.currency,
      isReady: this.isReady,
      inTournament: this.inTournament,
    };
  }

  /**
   * Actualiza el saldo del jugador (positivo o negativo).
   * @param {number} amount
   */
  updateBalance(amount) {
    this.balance += amount;
  }

  /**
   * Asigna el socket del jugador (cuando se conecta).
   * @param {object} socket - Instancia del socket de Socket.IO.
   */
  setSocket(socket) {
    this.socket = socket;
    this.socketId = socket?.id || null;
    this.ip = socket?.handshake.address || "unknown";
  }

  /**
   * Limpia la referencia del socket (al desconectarse).
   */
  clearSocket() {
    this.socket = null;
    this.socketId = null;
    this.ip = null;
  }
}
