// src/infrastructure/api/casinoApiService.js

import axios from "axios";
import prisma from "#prisma";
import { v4 as uuidv4 } from "uuid";
import { formatDateForExternalAPI } from "#shared/timezone.js";

const API_BASE_URL = process.env.CASINO_API_BASE_URL;

export class CasinoApiService {
  static async placeBet(userId, amount, ip = "unknown") {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { externalToken: true, name: true },
    });

    if (!user || !user.externalToken) {
      throw new Error("Usuario no tiene token externo asociado");
    }

    const transactionId = `RLT_${uuidv4()}`;

    // ✅ Genera la fecha en la zona horaria definida en .env
    const fecha = formatDateForExternalAPI(new Date(), "yyyy-MM-dd HH:mm:ss");

    try {
      const response = await axios.post(
        `${API_BASE_URL}/usuario/ruleta-user-bet`,
        {
          monto: amount,
          transaction_id: transactionId,
          fecha: fecha,
          ip: ip,
        },
        {
          headers: {
            Authorization: `Bearer ${user.externalToken}`,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        },
      );

      const { status, message, balance_before, balance_after } = response.data;

      if (status !== "success") {
        throw new Error(message || "La API externa rechazó la apuesta");
      }

      console.log(
        `✅ [CASINO API] Apuesta exitosa: ${transactionId} para usuario ${user.name}. Nuevo saldo: ${balance_after}`,
      );

      await prisma.externalTransaction.create({
        data: {
          userId,
          transactionId,
          amount,
          type: "BET",
          status: "SUCCESS",
          provider: "bets365vip",
          rawResponse: JSON.stringify(response.data),
        },
      });

      return {
        success: true,
        transactionId,
        balanceBefore: balance_before,
        balanceAfter: balance_after,
        externalResponse: response.data,
      };
    } catch (error) {
      console.error(`❌ [CASINO API] Error al realizar apuesta para usuario ${userId}:`, {
        message: error.message,
        status: error.response ? error.response.status : null,
        data: error.response ? error.response.data : null,
      });

      await prisma.externalTransaction.create({
        data: {
          userId,
          transactionId,
          amount,
          type: "BET",
          status: "FAILED",
          provider: "bets365vip",
          errorMessage: error.message,
          rawResponse: error.response ? JSON.stringify(error.response.data) : null,
        },
      });
      throw new Error("Tu sesión ha expirado. Por favor, vuelve a iniciar sesión.");
    }
  }

  static async depositWinnings(userId, amount, ip = "unknown") {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { externalToken: true, name: true },
    });

    if (!user || !user.externalToken) {
      throw new Error("Usuario no tiene token externo asociado");
    }

    const transactionId = `WIN_${uuidv4()}`;

    // ✅ Genera la fecha en la zona horaria definida en .env
    const fecha = formatDateForExternalAPI(new Date(), "yyyy-MM-dd HH:mm:ss");

    try {
      const response = await axios.post(
        `${API_BASE_URL}/usuario/ruleta-user-win`,
        {
          monto: amount,
          transaction_id: transactionId,
          fecha: fecha,
          ip: ip,
        },
        {
          headers: {
            Authorization: `Bearer ${user.externalToken}`,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        },
      );

      const { status, message, balance_before, balance_after } = response.data;

      if (status !== "success") {
        throw new Error(message || "La API externa rechazó el depósito");
      }

      console.log(
        `✅ [CASINO API] Ganancias depositadas: ${transactionId} para usuario ${user.name}. Nuevo saldo: ${balance_after}`,
      );

      await prisma.externalTransaction.create({
        data: {
          userId,
          transactionId,
          amount,
          type: "WIN",
          status: "SUCCESS",
          provider: "bets365vip",
          rawResponse: JSON.stringify(response.data),
        },
      });

      return {
        success: true,
        transactionId,
        balanceBefore: balance_before,
        balanceAfter: balance_after,
        externalResponse: response.data,
      };
    } catch (error) {
      console.error(`❌ [CASINO API] Error al depositar ganancias para usuario ${userId}:`, {
        message: error.message,
        status: error.response ? error.response.status : null,
        data: error.response ? error.response.data : null,
      });

      await prisma.externalTransaction.create({
        data: {
          userId,
          transactionId,
          amount,
          type: "WIN",
          status: "FAILED",
          provider: "bets365vip",
          errorMessage: error.message,
          rawResponse: error.response ? JSON.stringify(error.response.data) : null,
        },
      });

      throw new Error("Error al depositar ganancias. Por favor, contacta soporte.");
    }
  }

  static async getPlayerBalance(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { externalToken: true, name: true },
    });

    if (!user || !user.externalToken) {
      throw new Error("Usuario no tiene token externo asociado");
    }

    try {
      const response = await axios.post(
        `${API_BASE_URL}/usuario/ruleta-user-info`,
        {},
        {
          headers: {
            Authorization: `Bearer ${user.externalToken}`,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        },
      );

      const { success, creditos } = response.data;

      if (!success) {
        throw new Error(response.data.message || "La API externa no pudo obtener el balance");
      }

      const balance = parseFloat(creditos);
      if (isNaN(balance)) {
        throw new Error("Balance inválido recibido del proveedor");
      }

      console.log(`✅ [CASINO API] Balance obtenido para usuario ${user.name}: ${balance}`);

      return balance;
    } catch (error) {
      console.error(`❌ [CASINO API] Error al obtener balance para usuario ${userId}:`, {
        message: error.message,
        status: error.response ? error.response.status : null,
        data: error.response ? error.response.data : null,
      });

      throw new Error("Error al obtener balance. Por favor, contacta soporte.");
    }
  }
}
