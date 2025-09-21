// src/domain/entities/Player.js

export class Player {
  /**
   * @param {string} id - El ID único del usuario.
   * @param {string} name - El nombre de usuario.
   * @param {number} balance - El saldo inicial del usuario.
   * @param {boolean} [isCreator=false] - Indica si este jugador es el creador del torneo.
   */
  constructor(id, name, balance, isCreator = false) {
    this.id = id;
    this.name = name;
    this.balance = balance;
    this.initialBalance = balance;
    this.isReady = false;
    this.socketId = null;
    this.isCreator = isCreator;
  }

  toSocketData() {
    return {
      id: this.id,
      name: this.name,
      balance: this.balance,
      isReady: this.isReady,
      isCreator: this.isCreator,
    };
  }

  updateBalance(amount) {
    this.balance += amount;
  }
}
