// src/domain/entities/Player.js

/**
 * Representa un jugador en el sistema de ruleta.
 * Maneja la información básica del jugador, su saldo y estado de conexión.
 */

export class Player {
  /**
   * Crea una nueva instancia de jugador.
   * @param {string} id - El ID único del usuario en el sistema.
   * @param {string} name - El nombre de usuario para mostrar en la interfaz.
   * @param {number} balance - El saldo inicial del usuario en fichas.
   * @param {boolean} [isCreator=false] - Indica si este jugador es el creador del torneo.
   *   Solo aplica en salas de torneo donde el creador tiene permisos especiales.
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

  /**
   * Convierte los datos del jugador a un formato seguro para enviar por socket.
   * Excluye información sensible y solo incluye datos necesarios para el cliente.
   * @returns {Object} Objeto con los datos públicos del jugador.
   */
  toSocketData() {
    return {
      id: this.id,
      name: this.name,
      balance: this.balance,
      isReady: this.isReady,
      isCreator: this.isCreator,
    };
  }

  /**
   * Actualiza el saldo del jugador sumando o restando una cantidad.
   * @param {number} amount - Cantidad a sumar (positiva) o restar (negativa) del saldo.
   * @returns {void}
   */
  updateBalance(amount) {
    this.balance += amount;
  }
}
