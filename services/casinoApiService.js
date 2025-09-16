// src/services/CasinoApiService.js
import axios from "axios";
import prisma from "../prisma/index.js";
import { v4 as uuidv4 } from "uuid";

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

    const now = new Date();
    const fecha =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0") +
      " " +
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0") +
      ":" +
      String(now.getSeconds()).padStart(2, "0");

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
        }
      );

      const { status, message, balance_before, balance_after } = response.data;

      if (status !== "success") {
        throw new Error(message || "La API externa rechazó la apuesta");
      }

      console.log(
        `✅ [CASINO API] Apuesta exitosa: ${transactionId} para usuario ${user.name}. Nuevo saldo: ${balance_after}`
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
      console.error(
        `❌ [CASINO API] Error al realizar apuesta para usuario ${userId}:`,
        {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        }
      );

      await prisma.externalTransaction.create({
        data: {
          userId,
          transactionId,
          amount,
          type: "BET",
          status: "FAILED",
          provider: "bets365vip",
          errorMessage: error.message,
          rawResponse: error.response
            ? JSON.stringify(error.response.data)
            : null,
        },
      });
      throw new Error(
        "Tu sesión ha expirado. Por favor, vuelve a iniciar sesión."
      );
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

    const now = new Date();
    const fecha =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0") +
      " " +
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0") +
      ":" +
      String(now.getSeconds()).padStart(2, "0");

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
        }
      );

      const { status, message, balance_before, balance_after } = response.data;

      if (status !== "success") {
        throw new Error(message || "La API externa rechazó el depósito");
      }

      console.log(
        `✅ [CASINO API] Ganancias depositadas: ${transactionId} para usuario ${user.name}. Nuevo saldo: ${balance_after}`
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
      console.error(
        `❌ [CASINO API] Error al depositar ganancias para usuario ${userId}:`,
        {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        }
      );

      await prisma.externalTransaction.create({
        data: {
          userId,
          transactionId,
          amount,
          type: "WIN",
          status: "FAILED",
          provider: "bets365vip",
          errorMessage: error.message,
          rawResponse: error.response
            ? JSON.stringify(error.response.data)
            : null,
        },
      });

      throw new Error(
        "Error al depositar ganancias. Por favor, contacta soporte."
      );
    }
  }
}
