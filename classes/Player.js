// classes/Player.js

export class Player {
  /**
   * @param {string} id - El ID único del usuario.
   * @param {string} name - El nombre de usuario.
   * @param {number} balance - El saldo inicial del usuario.
   */
  constructor(id, name, balance) {
    this.id = id;
    this.name = name;
    this.balance = balance;
    this.initialBalance = balance;
    this.isReady = false;
    this.socketId = null;
  }

  toSocketData() {
    return {
      id: this.id,
      name: this.name,
      balance: this.balance,
      isReady: this.isReady,
    };
  }

  updateBalance(amount) {
    this.balance += amount;
  }
}
