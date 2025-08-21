// src/routes/gameRoutes.js

import { Router } from "express";
import { adminAuth } from "../middleware/adminAuth.js";
import * as gameManager from "../services/gameManager.js";

const router = Router();

router.get("/status", adminAuth, (req, res) => {
  const { roomId } = req.query;
  const status = gameManager.getStatus(roomId);

  if (!status) {
    return res.status(404).json({ error: "Sala no encontrada." });
  }

  res.json(status);
});

router.get("/peek/:roomId", adminAuth, (req, res) => {
  const { roomId } = req.params;
  const results = gameManager.peekResults(roomId);
  if (!results) {
    return res.status(404).json({ error: "Room not found" });
  }
  res.json({ roomId, nextResults: results });
});
export default router;
