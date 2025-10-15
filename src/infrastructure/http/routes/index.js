// src/infrastructure/http/routes/index.js

import express from "express";
import gameRoutes from "./gameRoutes.js";
import userRoutes from "./userRoutes.js";

const router = express.Router();

router.use("/game", gameRoutes);
router.use("/users", userRoutes);

export default router;
