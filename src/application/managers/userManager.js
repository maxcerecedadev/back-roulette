// src/application/managers/userManager.js

import prisma from "#prisma"

/**
 * UserManager - Gestor de operaciones relacionadas con usuarios
 * Interactúa directamente con Prisma para operaciones CRUD de usuarios
 */

/**
 * Obtiene usuarios con paginación y filtros
 * @param {Object} filters - Criterios de filtrado y paginación
 * @returns {Promise<Object>} Objeto con usuarios y metadatos de paginación
 */
export const getAllUsers = async (filters = {}) => {
  try {
    const whereClause = {};
    
    if (filters.search) {
      whereClause.name = {
        contains: filters.search,
        mode: 'insensitive',
      };
    }
    
    if (filters.minBalance !== undefined) {
      whereClause.balance = {
        gte: filters.minBalance,
      };
    }
    
    if (filters.maxBalance !== undefined) {
      whereClause.balance = {
        ...whereClause.balance,
        lte: filters.maxBalance,
      };
    }

    // Calcular offset para la paginación
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20)); // Límite entre 1 y 100
    const offset = (page - 1) * limit;

    // Contar total de usuarios que coinciden con los filtros
    const total = await prisma.user.count({
      where: whereClause,
    });

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        balance: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: offset,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      users,
      total,
      page,
      limit,
      totalPages
    };
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  }
};

/**
 * Obtiene un usuario por su ID
 * @param {string} id - ID del usuario
 * @returns {Promise<Object|null>} Usuario o null si no existe
 */
export const getUserById = async (id) => {
  try {
    return await prisma.user.findUnique({
      where: { id },
      include: {
        rouletteRounds: {
          take: 10, 
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  } catch (error) {
    console.error('Error getting user by ID:', error);
    throw error;
  }
};

/**
 * Elimina un usuario (cascada en rondas de ruleta)
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object>} Usuario eliminado
 */
export const deleteUser = async (userId) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true }
    });

    if (!user) {
      return null;
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    return user;
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
};